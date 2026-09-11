package ingestion

import (
	"compress/gzip"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
	"xpharma-backend/pkg/db"
)

type IngestionPayload struct {
	Invoices     []InvoiceSyncItem     `json:"invoices"`
	Returns      []ReturnSyncItem      `json:"returns"`
	CashReceipts []CashReceiptSyncItem `json:"cash_receipts"`
	Ledger       []LedgerSyncItem      `json:"ledger"`
	Products     []ProductSyncItem     `json:"products"`
	Customers    []CustomerSyncItem    `json:"customers"`
	Cursors      SyncCursors           `json:"cursors"`
}

type CustomerSyncItem struct {
	Code    string `json:"code"`
	Name    string `json:"name"`
	Phone   string `json:"phone"`
	Address string `json:"address"`
}

type SyncCursors struct {
	InvoiceCursor string `json:"invoice_cursor"`
	ReturnCursor  string `json:"return_cursor"`
	ReceiptCursor string `json:"receipt_cursor"`
	LedgerCursor  string `json:"ledger_cursor"`
}

type InvoiceSyncItem struct {
	RemoteID        string            `json:"remote_id"`
	InvoiceNumber   string            `json:"invoice_number"`
	PharmacyCode    string            `json:"pharmacy_code"`
	InvoiceDate     time.Time         `json:"invoice_date"`
	TotalAmount     float64           `json:"total_amount"`
	DiscountAmount  float64           `json:"discount_amount"`
	NetAmount       float64           `json:"net_amount"`
	PaidAmount      float64           `json:"paid_amount"`
	RemainingAmount float64           `json:"remaining_amount"`
	Status          string            `json:"status"`
	Items           []InvoiceLineItem `json:"items"`
}

type InvoiceLineItem struct {
	RemoteItemID    string  `json:"remote_item_id"`
	ItemCode        string  `json:"item_code"`
	ItemName        string  `json:"item_name"`
	Unit            string  `json:"unit"`
	Quantity        float64 `json:"quantity"`
	BonusQuantity   float64 `json:"bonus_quantity"`
	UnitPrice       float64 `json:"unit_price"`
	DiscountPercent float64 `json:"discount_percent"`
	TotalPrice      float64 `json:"total_price"`
}

type ReturnSyncItem struct {
	RemoteID     string    `json:"remote_id"`
	ReturnNumber string    `json:"return_number"`
	PharmacyCode string    `json:"pharmacy_code"`
	ReturnDate   time.Time `json:"return_date"`
	TotalAmount  float64   `json:"total_amount"`
	NetAmount    float64   `json:"net_amount"`
	Status       string    `json:"status"`
	Reason       string    `json:"reason"`
}

type CashReceiptSyncItem struct {
	RemoteID      string    `json:"remote_id"`
	ReceiptNumber string    `json:"receipt_number"`
	PharmacyCode  string    `json:"pharmacy_code"`
	ReceiptDate   time.Time `json:"receipt_date"`
	Amount        float64   `json:"amount"`
	PaymentMethod string    `json:"payment_method"`
	CollectorName string    `json:"collector_name"`
	Notes         string    `json:"notes"`
}

type LedgerSyncItem struct {
	RemoteID     string    `json:"remote_id"`
	PharmacyCode string    `json:"pharmacy_code"`
	EntryDate    time.Time `json:"entry_date"`
	DocType      string    `json:"doc_type"`
	DocNumber    string    `json:"doc_number"`
	Debit        float64   `json:"debit"`
	Credit       float64   `json:"credit"`
	Balance      float64   `json:"balance"`
	Description  string    `json:"description"`
}

type ProductSyncItem struct {
	RemoteID        string    `json:"remote_id"`
	Name            string    `json:"name"`
	NameEn          string    `json:"name_en"`
	Price           float64   `json:"price"`
	Quantity        float64   `json:"quantity"`
	DiscountPercent float64   `json:"discount_percent"`
	DateIn          time.Time `json:"date_in"`
}

type IngestionService struct {
	router *db.TenantRouter
}

func NewIngestionService(router *db.TenantRouter) *IngestionService {
	return &IngestionService{router: router}
}

// AuthenticateAgent verifies the X-Agent-Key header against public.tenants
func (s *IngestionService) AuthenticateAgent(c *gin.Context) (string, error) {
	apiKey := c.GetHeader("X-Agent-Key")
	if apiKey == "" {
		return "", fmt.Errorf("missing X-Agent-Key header")
	}

	hash := sha256.Sum256([]byte(apiKey))
	keyHash := hex.EncodeToString(hash[:])

	var tenantID string
	query := `
		UPDATE public.tenants 
		SET last_heartbeat_at = NOW() 
		WHERE api_key_hash = $1 AND status = 'active' 
		RETURNING id
	`
	err := s.router.Pool().QueryRow(c.Request.Context(), query, keyHash).Scan(&tenantID)
	if err != nil {
		return "", fmt.Errorf("invalid or inactive agent key")
	}

	return tenantID, nil
}

// HandleIngest receives Gzip compressed JSON batch payload
func (s *IngestionService) HandleIngest(c *gin.Context) {
	tenantID, err := s.AuthenticateAgent(c)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
		return
	}

	var reader io.Reader = c.Request.Body
	if strings.Contains(c.GetHeader("Content-Encoding"), "gzip") {
		gz, err := gzip.NewReader(c.Request.Body)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Failed to decompress gzip stream: " + err.Error()})
			return
		}
		defer gz.Close()
		reader = gz
	}

	var payload IngestionPayload
	if err := json.NewDecoder(reader).Decode(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid payload format: " + err.Error()})
		return
	}

	ctx := c.Request.Context()
	err = s.router.ExecInTenant(ctx, tenantID, func(ctx context.Context, schema string, conn *pgxpool.Conn) error {
		tx, err := conn.Begin(ctx)
		if err != nil {
			return err
		}
		defer tx.Rollback(ctx)

		// 1. Upsert Invoices & Items
		for _, inv := range payload.Invoices {
			var invoiceID string
			invQuery := fmt.Sprintf(`
				INSERT INTO %s.invoices (remote_id, invoice_number, pharmacy_code, invoice_date, total_amount, discount_amount, net_amount, paid_amount, remaining_amount, status, updated_at)
				VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
				ON CONFLICT (remote_id) DO UPDATE 
				SET invoice_number = EXCLUDED.invoice_number,
				    total_amount = EXCLUDED.total_amount,
				    discount_amount = EXCLUDED.discount_amount,
				    net_amount = EXCLUDED.net_amount,
				    paid_amount = EXCLUDED.paid_amount,
				    remaining_amount = EXCLUDED.remaining_amount,
				    status = EXCLUDED.status,
				    updated_at = NOW()
				RETURNING id
			`, schema)

			err := tx.QueryRow(ctx, invQuery,
				inv.RemoteID, inv.InvoiceNumber, inv.PharmacyCode, inv.InvoiceDate,
				inv.TotalAmount, inv.DiscountAmount, inv.NetAmount, inv.PaidAmount, inv.RemainingAmount, inv.Status,
			).Scan(&invoiceID)
			if err != nil {
				return fmt.Errorf("upsert invoice %s: %w", inv.RemoteID, err)
			}

			// Upsert Items
			if len(inv.Items) > 0 {
				delQuery := fmt.Sprintf(`DELETE FROM %s.invoice_items WHERE invoice_id = $1`, schema)
				if _, err := tx.Exec(ctx, delQuery, invoiceID); err != nil {
					return err
				}

				for _, itm := range inv.Items {
					itmQuery := fmt.Sprintf(`
						INSERT INTO %s.invoice_items (invoice_id, remote_item_id, item_code, item_name, unit, quantity, bonus_quantity, unit_price, discount_percent, total_price)
						VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
					`, schema)
					_, err := tx.Exec(ctx, itmQuery,
						invoiceID, itm.RemoteItemID, itm.ItemCode, itm.ItemName, itm.Unit,
						itm.Quantity, itm.BonusQuantity, itm.UnitPrice, itm.DiscountPercent, itm.TotalPrice,
					)
					if err != nil {
						return fmt.Errorf("insert invoice item: %w", err)
					}
				}
			}
		}

		// 2. Upsert Returns
		for _, ret := range payload.Returns {
			retQuery := fmt.Sprintf(`
				INSERT INTO %s.returns (remote_id, return_number, pharmacy_code, return_date, total_amount, net_amount, status, reason, updated_at)
				VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
				ON CONFLICT (remote_id) DO UPDATE 
				SET return_number = EXCLUDED.return_number,
				    total_amount = EXCLUDED.total_amount,
				    net_amount = EXCLUDED.net_amount,
				    status = EXCLUDED.status,
				    updated_at = NOW()
			`, schema)
			_, err := tx.Exec(ctx, retQuery,
				ret.RemoteID, ret.ReturnNumber, ret.PharmacyCode, ret.ReturnDate,
				ret.TotalAmount, ret.NetAmount, ret.Status, ret.Reason,
			)
			if err != nil {
				return fmt.Errorf("upsert return %s: %w", ret.RemoteID, err)
			}
		}

		// 3. Upsert Cash Receipts
		for _, rcpt := range payload.CashReceipts {
			rcptQuery := fmt.Sprintf(`
				INSERT INTO %s.cash_receipts (remote_id, receipt_number, pharmacy_code, receipt_date, amount, payment_method, collector_name, notes, updated_at)
				VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
				ON CONFLICT (remote_id) DO UPDATE 
				SET amount = EXCLUDED.amount,
				    collector_name = EXCLUDED.collector_name,
				    notes = EXCLUDED.notes,
				    updated_at = NOW()
			`, schema)
			_, err := tx.Exec(ctx, rcptQuery,
				rcpt.RemoteID, rcpt.ReceiptNumber, rcpt.PharmacyCode, rcpt.ReceiptDate,
				rcpt.Amount, rcpt.PaymentMethod, rcpt.CollectorName, rcpt.Notes,
			)
			if err != nil {
				return fmt.Errorf("upsert receipt %s: %w", rcpt.RemoteID, err)
			}
		}

		// 4. Upsert Ledger Entries
		for _, ledg := range payload.Ledger {
			ledgQuery := fmt.Sprintf(`
				INSERT INTO %s.ledger_entries (remote_id, pharmacy_code, entry_date, doc_type, doc_number, debit, credit, balance, description)
				VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
				ON CONFLICT (remote_id) DO UPDATE 
				SET debit = EXCLUDED.debit,
				    credit = EXCLUDED.credit,
				    balance = EXCLUDED.balance,
				    description = EXCLUDED.description
			`, schema)
			_, err := tx.Exec(ctx, ledgQuery,
				ledg.RemoteID, ledg.PharmacyCode, ledg.EntryDate, ledg.DocType,
				ledg.DocNumber, ledg.Debit, ledg.Credit, ledg.Balance, ledg.Description,
			)
			if err != nil {
				return fmt.Errorf("upsert ledger %s: %w", ledg.RemoteID, err)
			}
		}

		// 5. Upsert Products
		for _, prod := range payload.Products {
			prodQuery := fmt.Sprintf(`
				INSERT INTO %s.products (remote_id, name, name_en, price, quantity, discount_percent, date_in, updated_at)
				VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
				ON CONFLICT (remote_id) DO UPDATE 
				SET name = EXCLUDED.name,
				    price = EXCLUDED.price,
				    quantity = EXCLUDED.quantity,
				    discount_percent = EXCLUDED.discount_percent,
				    updated_at = NOW()
			`, schema)
			_, err := tx.Exec(ctx, prodQuery,
				prod.RemoteID, prod.Name, prod.NameEn, prod.Price, prod.Quantity, prod.DiscountPercent, prod.DateIn,
			)
			if err != nil {
				return fmt.Errorf("upsert product %s: %w", prod.RemoteID, err)
			}
		}

		// 6. Upsert Customers / Pharmacies into public.pharmacies
		for _, cust := range payload.Customers {
			if cust.Code == "" || strings.TrimSpace(cust.Name) == "" {
				continue
			}
			custQuery := `
				INSERT INTO public.pharmacies (tenant_id, code, name, phone, address, is_active, updated_at)
				VALUES ($1, $2, $3, $4, $5, TRUE, NOW())
				ON CONFLICT (tenant_id, code) DO UPDATE 
				SET name = EXCLUDED.name,
				    phone = COALESCE(NULLIF(EXCLUDED.phone, ''), public.pharmacies.phone),
				    address = COALESCE(NULLIF(EXCLUDED.address, ''), public.pharmacies.address),
				    updated_at = NOW()
			`
			_, err := tx.Exec(ctx, custQuery,
				tenantID, cust.Code, cust.Name, cust.Phone, cust.Address,
			)
			if err != nil {
				return fmt.Errorf("upsert pharmacy %s: %w", cust.Code, err)
			}
		}

		// 7. Update Cursors & Sync State in central public table
		syncStateQuery := `
			INSERT INTO public.tenant_sync_states (tenant_id, last_sync_at, last_invoice_cursor, last_return_cursor, last_receipt_cursor, last_ledger_cursor, sync_status, updated_at)
			VALUES ($1, NOW(), $2, $3, $4, $5, 'idle', NOW())
			ON CONFLICT (tenant_id) DO UPDATE 
			SET last_sync_at = NOW(),
			    last_invoice_cursor = COALESCE(NULLIF($2, ''), public.tenant_sync_states.last_invoice_cursor),
			    last_return_cursor = COALESCE(NULLIF($3, ''), public.tenant_sync_states.last_return_cursor),
			    last_receipt_cursor = COALESCE(NULLIF($4, ''), public.tenant_sync_states.last_receipt_cursor),
			    last_ledger_cursor = COALESCE(NULLIF($5, ''), public.tenant_sync_states.last_ledger_cursor),
			    sync_status = 'idle',
			    last_error = NULL,
			    updated_at = NOW()
		`
		_, err = tx.Exec(ctx, syncStateQuery,
			tenantID,
			payload.Cursors.InvoiceCursor,
			payload.Cursors.ReturnCursor,
			payload.Cursors.ReceiptCursor,
			payload.Cursors.LedgerCursor,
		)
		if err != nil {
			return fmt.Errorf("update sync state: %w", err)
		}

		return tx.Commit(ctx)
	})

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "Batch synced successfully",
		"counts": gin.H{
			"invoices":  len(payload.Invoices),
			"returns":   len(payload.Returns),
			"receipts":  len(payload.CashReceipts),
			"ledger":    len(payload.Ledger),
			"products":  len(payload.Products),
			"customers": len(payload.Customers),
		},
	})
}
