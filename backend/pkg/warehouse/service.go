package warehouse

import (
	"fmt"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"xpharma-backend/pkg/auth"
	"xpharma-backend/pkg/db"
)

var nonDigitRegex = regexp.MustCompile(`\D+`)

// normalizeEgyptianPhone strips country codes and leading zeros to get the core phone number
func normalizeEgyptianPhone(p string) string {
	digits := nonDigitRegex.ReplaceAllString(p, "")
	if strings.HasPrefix(digits, "0020") {
		digits = strings.TrimPrefix(digits, "0020")
	} else if strings.HasPrefix(digits, "20") && len(digits) > 10 {
		digits = strings.TrimPrefix(digits, "20")
	}
	digits = strings.TrimLeft(digits, "0")
	return digits
}

// matchEgyptianPhones checks if inputPhone matches any candidate phone in dbPhones
func matchEgyptianPhones(inputPhone, dbPhones string) bool {
	normInput := normalizeEgyptianPhone(inputPhone)
	if normInput == "" || len(normInput) < 7 {
		return false
	}

	separatorRegex := regexp.MustCompile(`[,/;\s\n]+`)
	candidates := separatorRegex.Split(dbPhones, -1)

	for _, cand := range candidates {
		normCand := normalizeEgyptianPhone(cand)
		if normCand == "" {
			continue
		}
		if normCand == normInput {
			return true
		}
		if len(normCand) >= 8 && len(normInput) >= 8 {
			if strings.HasSuffix(normCand, normInput) || strings.HasSuffix(normInput, normCand) {
				return true
			}
		}
	}

	wholeDBNorm := normalizeEgyptianPhone(dbPhones)
	if len(wholeDBNorm) >= 8 && len(normInput) >= 8 && strings.Contains(wholeDBNorm, normInput) {
		return true
	}

	return false
}

type WarehouseService struct {
	router       *db.TenantRouter
	tokenService *auth.TokenService
}

func NewWarehouseService(router *db.TenantRouter, tokenService *auth.TokenService) *WarehouseService {
	return &WarehouseService{
		router:       router,
		tokenService: tokenService,
	}
}

// GetWarehouses returns the list of active warehouses, annotating linked status and all linked pharmacies for the requested user
func (s *WarehouseService) GetWarehouses(c *gin.Context) {
	userID := strings.TrimSpace(c.Query("user_id"))

	query := `
		SELECT 
			t.id, 
			t.name, 
			t.slug, 
			t.status,
			COALESCE(t.address, '') AS address,
			COALESCE(t.contact_phone, '') AS contact_phone,
			COALESCE(t.logo_url, '') AS logo_url,
			COALESCE(t.category, 'مخزن أدوية') AS category
		FROM public.tenants t
		WHERE t.status = 'active'
		ORDER BY t.name ASC
	`
	rows, err := s.router.Pool().Query(c.Request.Context(), query)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	type TenantBasic struct {
		id, name, slug, status, address, contactPhone, logoURL, category string
	}
	var tenants []TenantBasic
	for rows.Next() {
		var t TenantBasic
		if err := rows.Scan(&t.id, &t.name, &t.slug, &t.status, &t.address, &t.contactPhone, &t.logoURL, &t.category); err == nil {
			tenants = append(tenants, t)
		}
	}

	var warehouses []map[string]interface{}
	for _, t := range tenants {
		var linkedPharmacies []map[string]interface{}

		if userID != "" {
			// Query all pharmacies linked to this user in this warehouse
			pQuery := `
				SELECT p.id::text, p.code, p.name 
				FROM public.pharmacies p
				WHERE p.tenant_id = $1 
				  AND (p.linked_user_id = $2 OR p.linked_user_id = (SELECT email FROM public.users WHERE id::text = $2 LIMIT 1))
				  AND p.is_active = true
				ORDER BY p.updated_at DESC
			`
			pRows, pErr := s.router.Pool().Query(c.Request.Context(), pQuery, t.id, userID)
			if pErr == nil {
				for pRows.Next() {
					var pID, pCode, pName string
					if err := pRows.Scan(&pID, &pCode, &pName); err == nil {
						pToken, _ := s.tokenService.GenerateToken(auth.Claims{
							UserID:     userID,
							TenantID:   t.id,
							PharmacyID: pID,
							PharmaCode: pCode,
							Role:       "pharmacist",
						}, 30*24*time.Hour)

						linkedPharmacies = append(linkedPharmacies, map[string]interface{}{
							"id":            pID,
							"pharmacy_id":   pID,
							"pharmacy_code": pCode,
							"code":          pCode,
							"pharmacy_name": pName,
							"name":          pName,
							"token":         pToken,
							"tenant_id":     t.id,
						})
					}
				}
				pRows.Close()
			}
		}

		isLinked := len(linkedPharmacies) > 0
		var linkedPharmaID, linkedPharmaName, linkedPharmaCode, pharmaToken string
		if isLinked {
			first := linkedPharmacies[0]
			linkedPharmaID = first["pharmacy_id"].(string)
			linkedPharmaName = first["pharmacy_name"].(string)
			linkedPharmaCode = first["pharmacy_code"].(string)
			pharmaToken = first["token"].(string)
		}

		warehouses = append(warehouses, map[string]interface{}{
			"id":                   t.id,
			"name":                 t.name,
			"slug":                 t.slug,
			"status":               t.status,
			"address":              t.address,
			"contact_phone":        t.contactPhone,
			"logo_url":             t.logoURL,
			"category":             t.category,
			"is_linked":            isLinked,
			"linked_pharmacy_id":   linkedPharmaID,
			"linked_pharmacy_name": linkedPharmaName,
			"linked_pharmacy_code": linkedPharmaCode,
			"pharmacy_token":       pharmaToken,
			"linked_pharmacies":    linkedPharmacies,
		})
	}

	c.JSON(http.StatusOK, gin.H{
		"success":    true,
		"warehouses": warehouses,
	})
}

// RequestWarehouse creates a request for onboarding a new unlisted warehouse
func (s *WarehouseService) RequestWarehouse(c *gin.Context) {
	var req struct {
		WarehouseName  string `json:"warehouse_name" binding:"required"`
		WarehousePhone string `json:"warehouse_phone" binding:"required"`
		Notes          string `json:"notes"`
		UserID         string `json:"user_id"`
		UserEmail      string `json:"user_email"`
		UserName       string `json:"user_name"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "اسم المخزن ورقم الهاتف مطلوبان"})
		return
	}

	insertQuery := `
		INSERT INTO public.warehouse_requests 
			(warehouse_name, warehouse_phone, notes, requested_by_user_id, requested_by_email, requested_by_name)
		VALUES ($1, $2, $3, $4, $5, $6)
	`
	_, err := s.router.Pool().Exec(c.Request.Context(), insertQuery,
		strings.TrimSpace(req.WarehouseName),
		strings.TrimSpace(req.WarehousePhone),
		strings.TrimSpace(req.Notes),
		req.UserID,
		req.UserEmail,
		req.UserName,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "فشل حفظ الطلب، يرجى المحاولة لاحقاً"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "تم استلام طلب إضافة المخزن بنجاح",
	})
}

// VerifyPharmacy verifies pharmacy credentials in a warehouse and links the account
func (s *WarehouseService) VerifyPharmacy(c *gin.Context) {
	var req struct {
		TenantID     string `json:"tenant_id" binding:"required"`
		PharmacyCode string `json:"pharmacy_code" binding:"required"`
		Phone        string `json:"phone"`
		UserID       string `json:"user_id"`
		Email        string `json:"email"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "كود الصيدلية وبيانات المستودع مطلوبة"})
		return
	}

	code := strings.TrimSpace(req.PharmacyCode)
	phone := strings.TrimSpace(req.Phone)

	var pharmacyID, name, dbPhone string
	var isActive bool
	lookupQuery := `
		SELECT id, name, COALESCE(phone, ''), is_active
		FROM public.pharmacies
		WHERE tenant_id = $1 AND code = $2
		LIMIT 1
	`
	err := s.router.Pool().QueryRow(c.Request.Context(), lookupQuery, req.TenantID, code).Scan(&pharmacyID, &name, &dbPhone, &isActive)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "كود الصيدلية غير مسجل في قاعدة هذا المستودع. يرجى التأكد من صحة الكود."})
		return
	}

	if !isActive {
		c.JSON(http.StatusForbidden, gin.H{"error": "حساب الصيدلية غير نشط في هذا المستودع"})
		return
	}

	if phone == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "رقم الهاتف المسجل لدى المخزن مطلوب لتأكيد الربط"})
		return
	}

	dbPhone = strings.TrimSpace(dbPhone)
	if dbPhone == "" {
		c.JSON(http.StatusPreconditionRequired, gin.H{
			"error": "لا يوجد رقم هاتف مسجل لهذه الصيدلية في سيستم المخزن. يرجى التواصل مع إدارة المخزن لإضافة رقم هاتفك في حسابك أولاً للتمكن من ربط الحساب.",
		})
		return
	}

	if !matchEgyptianPhones(phone, dbPhone) {
		c.JSON(http.StatusUnauthorized, gin.H{
			"error": "رقم الهاتف غير مطابق لرقم الصيدلية المسجل في سيستم المخزن",
		})
		return
	}

	linkedUID := req.UserID
	cleanEmail := strings.ToLower(strings.TrimSpace(req.Email))

	// Enforce Subscription & SaaS limits before linking a pharmacy
	if linkedUID != "" || cleanEmail != "" {
		var dbUID string
		var userPlan int
		var isSubActiveInUser bool
		var userSubExpiresAt *time.Time

		_ = s.router.Pool().QueryRow(
			c.Request.Context(),
			`SELECT id::text, COALESCE(subscription_plan, 0), COALESCE(is_subscription_active, false), subscription_expires_at
			 FROM public.users 
			 WHERE (id::text = $1 AND $1 <> '') OR (LOWER(email) = LOWER($2) AND $2 <> '') 
			 LIMIT 1`,
			linkedUID, cleanEmail,
		).Scan(&dbUID, &userPlan, &isSubActiveInUser, &userSubExpiresAt)

		if dbUID != "" {
			linkedUID = dbUID
		}

		// Also check public.subscriptions table directly for active paid subscription
		var activeSubCount int
		var subPlanType string
		_ = s.router.Pool().QueryRow(
			c.Request.Context(),
			`SELECT COUNT(*), COALESCE(MAX(plan_type), '')
			 FROM (
				SELECT plan_type
				FROM public.subscriptions 
				WHERE (LOWER(TRIM(user_email)) = LOWER(TRIM($1)) OR (user_id::text = $2 AND $2 <> ''))
				  AND status = 'active'
				  AND (end_date IS NULL OR end_date >= CURRENT_DATE)
				ORDER BY created_at DESC 
				LIMIT 1
			 ) latest_sub`,
			cleanEmail, linkedUID,
		).Scan(&activeSubCount, &subPlanType)

		isSubscribed := false
		subPlan := 0

		if activeSubCount > 0 {
			isSubscribed = true
			if strings.Contains(subPlanType, "5") {
				subPlan = 5
			} else if strings.Contains(subPlanType, "4") {
				subPlan = 4
			} else if strings.Contains(subPlanType, "3") {
				subPlan = 3
			} else if strings.Contains(subPlanType, "2") {
				subPlan = 2
			} else if strings.Contains(subPlanType, "1") {
				subPlan = 1
			}
		} else if isSubActiveInUser && userSubExpiresAt != nil && userSubExpiresAt.After(time.Now()) && userPlan > 0 {
			isSubscribed = true
			subPlan = userPlan
		}

		allowedPharmacies := 2
		if isSubscribed {
			if subPlan <= 0 {
				subPlan = 1
			}
			allowedPharmacies = subPlan
		}

		// 1. Check if this specific pharmacy code is already linked to this user in this specific warehouse
		var alreadyLinked bool
		_ = s.router.Pool().QueryRow(
			c.Request.Context(),
			`SELECT EXISTS(SELECT 1 FROM public.pharmacies WHERE linked_user_id = $1 AND LOWER(code) = LOWER($2) AND tenant_id = $3)`,
			linkedUID, code, req.TenantID,
		).Scan(&alreadyLinked)

		// 2. Rule: User subscribes per single warehouse based on pharmacy count (1 is free, 2+ requires subscription)
		// All warehouses are open and can be linked freely ("انما يفتح كل المخازن عادى")
		if !alreadyLinked {
			var warehousePharmaciesCount int
			_ = s.router.Pool().QueryRow(
				c.Request.Context(),
				`SELECT COUNT(DISTINCT code) FROM public.pharmacies WHERE linked_user_id = $1 AND tenant_id = $2`,
				linkedUID, req.TenantID,
			).Scan(&warehousePharmaciesCount)

			if !isSubscribed {
				// Free tier: 1 pharmacy is free in this warehouse. 2 or more requires subscription!
				if warehousePharmaciesCount >= 1 {
					c.JSON(http.StatusForbidden, gin.H{
						"error":         "ربط أكثر من صيدلية واحدة في نفس المخزن يتطلب الاشتراك في إحدى باقات إكس فارما (باقة صيدليتان أو أكثر).",
						"code":          "SUBSCRIPTION_REQUIRED",
						"required_plan": 2,
					})
					return
				}
			} else {
				// Paid tier: allowed up to purchased plan in this warehouse
				if warehousePharmaciesCount >= allowedPharmacies {
					nextPlan := allowedPharmacies + 1
					if nextPlan > 5 {
						nextPlan = 5
					}
					c.JSON(http.StatusForbidden, gin.H{
						"error":         fmt.Sprintf("لقد استنفدت الحد الأقصى لباقة اشتراكك في هذا المخزن (%d صيدليات). يرجى ترقية باقتك لإضافة فرع جديد.", allowedPharmacies),
						"code":          "PLAN_LIMIT_REACHED",
						"required_plan": nextPlan,
						"current_count": warehousePharmaciesCount,
						"allowed_count": allowedPharmacies,
					})
					return
				}
			}
		}
	}

	if linkedUID != "" {
		updateQuery := `UPDATE public.pharmacies SET linked_user_id = $1, updated_at = NOW() WHERE id = $2`
		_, _ = s.router.Pool().Exec(c.Request.Context(), updateQuery, linkedUID, pharmacyID)
	}

	token, err := s.tokenService.GenerateToken(auth.Claims{
		UserID:     req.UserID,
		Email:      req.Email,
		TenantID:   req.TenantID,
		PharmacyID: pharmacyID,
		PharmaCode: code,
		Role:       "pharmacist",
	}, 30*24*time.Hour)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "فشل توليد التوكن"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success":       true,
		"token":         token,
		"pharmacy_name": name,
		"pharmacy_code": code,
		"tenant_id":     req.TenantID,
	})
}

// LinkPharmacy links a pharmacy using a unique link code
func (s *WarehouseService) LinkPharmacy(c *gin.Context) {
	var req struct {
		LinkCode string `json:"link_code" binding:"required"`
		UserID   string `json:"user_id" binding:"required"`
		Email    string `json:"email"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var pharmacyID, tenantID, code, name string
	lookupQuery := `
		SELECT id, tenant_id, code, name 
		FROM public.pharmacies 
		WHERE link_code = $1 AND is_active = true
	`
	err := s.router.Pool().QueryRow(c.Request.Context(), lookupQuery, req.LinkCode).Scan(&pharmacyID, &tenantID, &code, &name)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "كود الربط غير صحيح أو الصيدلية غير مفعلة"})
		return
	}

	linkedUID := req.UserID
	cleanEmail := strings.ToLower(strings.TrimSpace(req.Email))

	// Enforce Subscription & SaaS limits in LinkPharmacy as well
	if linkedUID != "" || cleanEmail != "" {
		var dbUID string
		var userPlan int
		var isSubActiveInUser bool
		var userSubExpiresAt *time.Time

		_ = s.router.Pool().QueryRow(
			c.Request.Context(),
			`SELECT id::text, COALESCE(subscription_plan, 0), COALESCE(is_subscription_active, false), subscription_expires_at
			 FROM public.users 
			 WHERE (id::text = $1 AND $1 <> '') OR (LOWER(email) = LOWER($2) AND $2 <> '') 
			 LIMIT 1`,
			linkedUID, cleanEmail,
		).Scan(&dbUID, &userPlan, &isSubActiveInUser, &userSubExpiresAt)

		if dbUID != "" {
			linkedUID = dbUID
		}

		var activeSubCount int
		var subPlanType string
		_ = s.router.Pool().QueryRow(
			c.Request.Context(),
			`SELECT COUNT(*), COALESCE(MAX(plan_type), '')
			 FROM (
				SELECT plan_type
				FROM public.subscriptions 
				WHERE (LOWER(TRIM(user_email)) = LOWER(TRIM($1)) OR (user_id::text = $2 AND $2 <> ''))
				  AND status = 'active'
				  AND (end_date IS NULL OR end_date >= CURRENT_DATE)
				ORDER BY created_at DESC 
				LIMIT 1
			 ) latest_sub`,
			cleanEmail, linkedUID,
		).Scan(&activeSubCount, &subPlanType)

		isSubscribed := false
		subPlan := 0

		if activeSubCount > 0 {
			isSubscribed = true
			if strings.Contains(subPlanType, "5") {
				subPlan = 5
			} else if strings.Contains(subPlanType, "4") {
				subPlan = 4
			} else if strings.Contains(subPlanType, "3") {
				subPlan = 3
			} else if strings.Contains(subPlanType, "2") {
				subPlan = 2
			} else if strings.Contains(subPlanType, "1") {
				subPlan = 1
			}
		} else if isSubActiveInUser && userSubExpiresAt != nil && userSubExpiresAt.After(time.Now()) && userPlan > 0 {
			isSubscribed = true
			subPlan = userPlan
		}

		allowedPharmacies := 2
		if isSubscribed {
			if subPlan <= 0 {
				subPlan = 1
			}
			allowedPharmacies = subPlan
		}

		var alreadyLinked bool
		_ = s.router.Pool().QueryRow(
			c.Request.Context(),
			`SELECT EXISTS(SELECT 1 FROM public.pharmacies WHERE linked_user_id = $1 AND LOWER(code) = LOWER($2))`,
			linkedUID, code,
		).Scan(&alreadyLinked)

		if !alreadyLinked {
			var warehousePharmaciesCount int
			_ = s.router.Pool().QueryRow(
				c.Request.Context(),
				`SELECT COUNT(DISTINCT code) FROM public.pharmacies WHERE linked_user_id = $1 AND tenant_id = $2`,
				linkedUID, tenantID,
			).Scan(&warehousePharmaciesCount)

			if !isSubscribed {
				// Free tier: 1 pharmacy is free in this warehouse. 2 or more requires subscription!
				if warehousePharmaciesCount >= 1 {
					c.JSON(http.StatusForbidden, gin.H{
						"error":         "ربط أكثر من صيدلية واحدة في نفس المخزن يتطلب الاشتراك في إحدى باقات إكس فارما (باقة صيدليتان أو أكثر).",
						"code":          "SUBSCRIPTION_REQUIRED",
						"required_plan": 2,
					})
					return
				}
			} else {
				// Paid tier: allowed up to purchased plan in this warehouse
				if warehousePharmaciesCount >= allowedPharmacies {
					nextPlan := allowedPharmacies + 1
					if nextPlan > 5 {
						nextPlan = 5
					}
					c.JSON(http.StatusForbidden, gin.H{
						"error":         fmt.Sprintf("لقد استنفدت الحد الأقصى لباقة اشتراكك في هذا المخزن (%d صيدليات). يرجى ترقية باقتك لإضافة فرع جديد.", allowedPharmacies),
						"code":          "PLAN_LIMIT_REACHED",
						"required_plan": nextPlan,
						"current_count": warehousePharmaciesCount,
						"allowed_count": allowedPharmacies,
					})
					return
				}
			}
		}
	}

	updateQuery := `UPDATE public.pharmacies SET linked_user_id = $1, updated_at = NOW() WHERE id = $2`
	_, _ = s.router.Pool().Exec(c.Request.Context(), updateQuery, req.UserID, pharmacyID)

	token, err := s.tokenService.GenerateToken(auth.Claims{
		UserID:     req.UserID,
		Email:      req.Email,
		TenantID:   tenantID,
		PharmacyID: pharmacyID,
		PharmaCode: code,
		Role:       "pharmacist",
	}, 30*24*time.Hour)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "فشل توليد التوكن"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success":       true,
		"token":         token,
		"pharmacy_name": name,
		"pharmacy_code": code,
		"tenant_id":     tenantID,
	})
}

// GetBanners returns active promotional banners for the mobile app
func (s *WarehouseService) GetBanners(c *gin.Context) {
	query := `
		SELECT 
			id::text, 
			COALESCE(title, '') AS title, 
			COALESCE(subtitle, '') AS subtitle, 
			image_url, 
			COALESCE(badge_text, 'إعلان') AS badge_text, 
			COALESCE(action_type, 'none') AS action_type, 
			COALESCE(action_value, '') AS action_value, 
			COALESCE(bg_color, '#3F0082') AS bg_color, 
			is_active, 
			sort_order, 
			created_at
		FROM public.banners
		WHERE is_active = true
		ORDER BY sort_order ASC, created_at DESC
	`
	rows, err := s.router.Pool().Query(c.Request.Context(), query)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"success": true, "banners": []interface{}{}})
		return
	}
	defer rows.Close()

	var banners []map[string]interface{}
	for rows.Next() {
		var id, title, subtitle, imageURL, badgeText, actionType, actionValue, bgColor string
		var isActive bool
		var sortOrder int
		var createdAt time.Time
		if err := rows.Scan(&id, &title, &subtitle, &imageURL, &badgeText, &actionType, &actionValue, &bgColor, &isActive, &sortOrder, &createdAt); err == nil {
			banners = append(banners, map[string]interface{}{
				"id":           id,
				"title":        title,
				"subtitle":     subtitle,
				"image_url":    imageURL,
				"badge_text":   badgeText,
				"action_type":  actionType,
				"action_value": actionValue,
				"bg_color":     bgColor,
				"is_active":    isActive,
				"sort_order":   sortOrder,
				"created_at":   createdAt,
			})
		}
	}

	if banners == nil {
		banners = []map[string]interface{}{}
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"banners": banners,
	})
}

