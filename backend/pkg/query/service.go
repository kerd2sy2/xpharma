package query

import (
	"context"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
	"xpharma-backend/pkg/db"
)

type QueryService struct {
	router *db.TenantRouter
}

func NewQueryService(router *db.TenantRouter) *QueryService {
	return &QueryService{router: router}
}

// GetBalance returns balance, total purchases, and credit summary
func (s *QueryService) GetBalance(c *gin.Context) {
	tenantID := c.GetString("tenant_id")
	pharmaCode := c.GetString("pharma_code")

	if tenantID == "" || pharmaCode == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Missing tenant_id or pharma_code in auth claims"})
		return
	}

	ctx := c.Request.Context()
	var balance, totalPurchases, totalReturns, totalPaid float64

	err := s.router.ExecInTenant(ctx, tenantID, func(ctx context.Context, schema string, conn *pgxpool.Conn) error {
		query := fmt.Sprintf(`
			SELECT 
				COALESCE((SELECT SUM(net_amount) FROM %s.invoices WHERE pharmacy_code = $1), 0),
				COALESCE((SELECT SUM(net_amount) FROM %s.returns WHERE pharmacy_code = $1), 0),
				COALESCE((SELECT SUM(amount) FROM %s.cash_receipts WHERE pharmacy_code = $1), 0),
				COALESCE((SELECT balance FROM %s.ledger_entries WHERE pharmacy_code = $1 ORDER BY entry_date DESC, id DESC LIMIT 1), 0)
		`, schema, schema, schema, schema)

		return conn.QueryRow(ctx, query, pharmaCode).Scan(&totalPurchases, &totalReturns, &totalPaid, &balance)
	})

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success":         true,
		"balance":         balance,
		"total_purchases": totalPurchases,
		"total_returns":   totalReturns,
		"total_paid":      totalPaid,
		"currency":        "EGP",
	})
}

// GetPurchases returns invoices with pagination and date filter
func (s *QueryService) GetPurchases(c *gin.Context) {
	tenantID := c.GetString("tenant_id")
	pharmaCode := c.GetString("pharma_code")
	dateFilter := c.Query("date")
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "50"))
	offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))

	ctx := c.Request.Context()
	var invoices []map[string]interface{}

	err := s.router.ExecInTenant(ctx, tenantID, func(ctx context.Context, schema string, conn *pgxpool.Conn) error {
		whereClause := fmt.Sprintf("WHERE pharmacy_code = $1")
		args := []interface{}{pharmaCode}

		if dateFilter != "" {
			whereClause += " AND invoice_date::date = $2"
			args = append(args, dateFilter)
		}

		limitClause := fmt.Sprintf("ORDER BY invoice_date DESC LIMIT %d OFFSET %d", limit, offset)
		query := fmt.Sprintf(`
			SELECT id, remote_id, invoice_number, invoice_date, total_amount, discount_amount, net_amount, paid_amount, remaining_amount, status
			FROM %s.invoices 
			%s 
			%s
		`, schema, whereClause, limitClause)

		rows, err := conn.Query(ctx, query, args...)
		if err != nil {
			return err
		}
		defer rows.Close()

		for rows.Next() {
			var id, remoteID, invNum, status string
			var invDate time.Time
			var total, disc, net, paid, remaining float64

			if err := rows.Scan(&id, &remoteID, &invNum, &invDate, &total, &disc, &net, &paid, &remaining, &status); err != nil {
				return err
			}

			invoices = append(invoices, map[string]interface{}{
				"id":               id,
				"remote_id":        remoteID,
				"invoice_number":   invNum,
				"invoice_date":     invDate.Format(time.RFC3339),
				"total_amount":     total,
				"discount_amount":  disc,
				"net_amount":       net,
				"paid_amount":      paid,
				"remaining_amount": remaining,
				"status":           status,
			})
		}
		return nil
	})

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "invoices": invoices})
}

// GetStatement returns the ledger running statement with all account movements
func (s *QueryService) GetStatement(c *gin.Context) {
	tenantID := c.GetString("tenant_id")
	pharmaCode := c.GetString("pharma_code")
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "150"))

	ctx := c.Request.Context()
	var entries []map[string]interface{}

	err := s.router.ExecInTenant(ctx, tenantID, func(ctx context.Context, schema string, conn *pgxpool.Conn) error {
		// 1. Check if direct ledger_entries exist for this pharmacy
		var directCount int
		checkQuery := fmt.Sprintf(`SELECT COUNT(*) FROM %s.ledger_entries WHERE pharmacy_code = $1`, schema)
		_ = conn.QueryRow(ctx, checkQuery, pharmaCode).Scan(&directCount)

		var query string
		if directCount > 0 {
			query = fmt.Sprintf(`
				SELECT id::text, remote_id, entry_date, doc_type, doc_number, debit, credit, balance, description
				FROM %s.ledger_entries
				WHERE pharmacy_code = $1
				ORDER BY entry_date ASC, id ASC
				LIMIT %d
			`, schema, limit)
		} else {
			// 2. Comprehensive union of all account movements (Invoices, Receipts, Returns)
			query = fmt.Sprintf(`
				SELECT 
					remote_id,
					remote_id,
					entry_date,
					doc_type,
					doc_number,
					debit,
					credit,
					SUM(debit - credit) OVER (ORDER BY entry_date ASC, remote_id ASC) as balance,
					description
				FROM (
					SELECT 
						'INV-' || remote_id as remote_id,
						invoice_date as entry_date,
						'فاتورة مبيعات' as doc_type,
						invoice_number as doc_number,
						net_amount as debit,
						0.00 as credit,
						'فاتورة مبيعات أدوية' as description
					FROM %s.invoices
					WHERE pharmacy_code = $1
					UNION ALL
					SELECT 
						'RCP-' || remote_id as remote_id,
						receipt_date as entry_date,
						'سند قبض نقدي' as doc_type,
						receipt_number as doc_number,
						0.00 as debit,
						amount as credit,
						COALESCE(notes, 'سند تحصيل نقدي') as description
					FROM %s.cash_receipts
					WHERE pharmacy_code = $1
					UNION ALL
					SELECT 
						'RET-' || remote_id as remote_id,
						return_date as entry_date,
						'مرتجع مبيعات' as doc_type,
						return_number as doc_number,
						0.00 as debit,
						net_amount as credit,
						COALESCE(reason, 'مرتجع مبيعات أدوية') as description
					FROM %s.returns
					WHERE pharmacy_code = $1
				) movements
				ORDER BY entry_date ASC
				LIMIT %d
			`, schema, schema, schema, limit)
		}

		rows, err := conn.Query(ctx, query, pharmaCode)
		if err != nil {
			return err
		}
		defer rows.Close()

		for rows.Next() {
			var id, remoteID, docType, docNum, desc string
			var entryDate time.Time
			var debit, credit, balance float64

			if err := rows.Scan(&id, &remoteID, &entryDate, &docType, &docNum, &debit, &credit, &balance, &desc); err != nil {
				return err
			}

			entries = append(entries, map[string]interface{}{
				"id":          id,
				"remote_id":   remoteID,
				"entry_date":  entryDate.Format("2006-01-02"),
				"doc_type":    docType,
				"doc_number":  docNum,
				"debit":       debit,
				"credit":      credit,
				"balance":     balance,
				"description": desc,
			})
		}
		return nil
	})

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "statement": entries})
}

// GetReturns returns sales returns with pagination and date filter
func (s *QueryService) GetReturns(c *gin.Context) {
	tenantID := c.GetString("tenant_id")
	pharmaCode := c.GetString("pharma_code")
	dateFilter := c.Query("date")
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "50"))
	offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))

	ctx := c.Request.Context()
	var returns []map[string]interface{}

	err := s.router.ExecInTenant(ctx, tenantID, func(ctx context.Context, schema string, conn *pgxpool.Conn) error {
		whereClause := "WHERE pharmacy_code = $1"
		args := []interface{}{pharmaCode}

		if dateFilter != "" {
			whereClause += " AND return_date::date = $2"
			args = append(args, dateFilter)
		}

		limitClause := fmt.Sprintf("ORDER BY return_date DESC LIMIT %d OFFSET %d", limit, offset)
		query := fmt.Sprintf(`
			SELECT id, remote_id, return_number, return_date, total_amount, net_amount, status, COALESCE(reason, '')
			FROM %s.returns 
			%s 
			%s
		`, schema, whereClause, limitClause)

		rows, err := conn.Query(ctx, query, args...)
		if err != nil {
			return err
		}
		defer rows.Close()

		for rows.Next() {
			var id, remoteID, retNum, status, reason string
			var retDate time.Time
			var total, net float64

			if err := rows.Scan(&id, &remoteID, &retNum, &retDate, &total, &net, &status, &reason); err != nil {
				return err
			}

			returns = append(returns, map[string]interface{}{
				"id":            id,
				"remote_id":     remoteID,
				"return_number": retNum,
				"return_date":   retDate.Format(time.RFC3339),
				"total_amount":  total,
				"net_amount":    net,
				"status":        status,
				"reason":        reason,
			})
		}
		return nil
	})

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "returns": returns})
}

// GetRecentProducts returns recent products and offers
func (s *QueryService) GetRecentProducts(c *gin.Context) {
	tenantID := c.GetString("tenant_id")
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "30"))

	ctx := c.Request.Context()
	var products []map[string]interface{}

	err := s.router.ExecInTenant(ctx, tenantID, func(ctx context.Context, schema string, conn *pgxpool.Conn) error {
		query := fmt.Sprintf(`
			SELECT id, remote_id, name, name_en, price, quantity, discount_percent, date_in
			FROM %s.products
			WHERE quantity > 0
			ORDER BY date_in DESC, id DESC
			LIMIT %d
		`, schema, limit)

		rows, err := conn.Query(ctx, query)
		if err != nil {
			return err
		}
		defer rows.Close()

		for rows.Next() {
			var id, remoteID, name, nameEn string
			var price, qty, disc float64
			var dateIn *time.Time

			if err := rows.Scan(&id, &remoteID, &name, &nameEn, &price, &qty, &disc, &dateIn); err != nil {
				return err
			}

			dateStr := ""
			if dateIn != nil {
				dateStr = dateIn.Format("2006-01-02")
			}

			products = append(products, map[string]interface{}{
				"id":               id,
				"remote_id":        remoteID,
				"name":             name,
				"name_en":          nameEn,
				"price":            price,
				"quantity":         qty,
				"discount_percent": disc,
				"date_in":          dateStr,
			})
		}
		return nil
	})

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "products": products})
}
