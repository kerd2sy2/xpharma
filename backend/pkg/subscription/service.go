package subscription

import (
	"context"
	"fmt"
	"log"
	"math"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"xpharma-backend/pkg/db"
)

type SubscriptionService struct {
	router *db.TenantRouter
}

func NewSubscriptionService(router *db.TenantRouter) *SubscriptionService {
	svc := &SubscriptionService{
		router: router,
	}
	svc.ensureSchema()
	return svc
}

func (s *SubscriptionService) ensureSchema() {
	statements := []string{
		`ALTER TABLE public.subscriptions ALTER COLUMN tenant_id DROP NOT NULL`,
		`ALTER TABLE public.subscriptions ALTER COLUMN end_date DROP NOT NULL`,
		`ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_plan_type_check`,
		`ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_status_check`,
		`ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS user_id UUID`,
		`ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS user_email VARCHAR(255)`,
		`ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS user_name VARCHAR(255)`,
		`ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS user_phone VARCHAR(64)`,
		`ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS amount NUMERIC(10,2) DEFAULT 0`,
		`ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS currency VARCHAR(16) DEFAULT 'EGP'`,
		`ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS payment_method VARCHAR(64) DEFAULT 'kashier'`,
		`ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS order_id VARCHAR(128)`,
		`ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS transaction_id VARCHAR(128)`,
		`ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS card_brand VARCHAR(32)`,
		`ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS masked_card VARCHAR(32)`,
		`ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS receipt_ref VARCHAR(128)`,
		`ALTER TABLE public.users ADD COLUMN IF NOT EXISTS subscription_plan INT DEFAULT 0`,
		`ALTER TABLE public.users ADD COLUMN IF NOT EXISTS is_subscription_active BOOLEAN DEFAULT false`,
		`ALTER TABLE public.users ADD COLUMN IF NOT EXISTS subscription_expires_at TIMESTAMPTZ`,
		`ALTER TABLE public.pharmacies ADD COLUMN IF NOT EXISTS is_suspended BOOLEAN NOT NULL DEFAULT FALSE`,
	}
	for _, stmt := range statements {
		_, err := s.router.Pool().Exec(context.Background(), stmt)
		if err != nil {
			log.Printf("[SubscriptionService] ensureSchema warning: %s -> %v", stmt, err)
		}
	}
}

// PharmacyItem represents a linked pharmacy
type PharmacyItem struct {
	Code        string `json:"code"`
	Name        string `json:"name"`
	IsSuspended bool   `json:"is_suspended"`
}

// GetStatus returns the subscription and trial status for a given user email
func (s *SubscriptionService) GetStatus(c *gin.Context) {
	email := strings.ToLower(strings.TrimSpace(c.Query("email")))
	if email == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "البريد الإلكتروني مطلوب"})
		return
	}

	// 1. Authoritative check against public.subscriptions (get latest active subscription)
	var activeSubCount int
	var subPlanType string
	var subEndDate time.Time
	_ = s.router.Pool().QueryRow(
		c.Request.Context(),
		`SELECT 
			COUNT(*),
			COALESCE(MAX(plan_type), ''),
			COALESCE(MAX(end_date), CURRENT_DATE + INTERVAL '30 days')
		 FROM (
			SELECT plan_type, end_date
			FROM public.subscriptions 
			WHERE LOWER(TRIM(user_email)) = LOWER(TRIM($1))
			  AND status = 'active'
			  AND (end_date IS NULL OR end_date >= CURRENT_DATE)
			ORDER BY created_at DESC 
			LIMIT 1
		 ) latest_sub`,
		email,
	).Scan(&activeSubCount, &subPlanType, &subEndDate)

	var isPaused bool
	_ = s.router.Pool().QueryRow(
		c.Request.Context(),
		`SELECT EXISTS(
			SELECT 1 FROM public.subscriptions 
			WHERE LOWER(TRIM(user_email)) = LOWER(TRIM($1))
			  AND status = 'paused'
		)`,
		email,
	).Scan(&isPaused)

	// 2. Safe check against public.users
	var userExists bool
	var subscriptionPlan int
	var isSubActiveInUser bool
	var userSubExpiresAt *time.Time
	_ = s.router.Pool().QueryRow(
		c.Request.Context(),
		`SELECT 
			TRUE,
			COALESCE(subscription_plan, 0),
			COALESCE(is_subscription_active, false),
			subscription_expires_at
		 FROM public.users 
		 WHERE LOWER(email) = LOWER($1) LIMIT 1`,
		email,
	).Scan(&userExists, &subscriptionPlan, &isSubActiveInUser, &userSubExpiresAt)

	isSubscribed := false
	if activeSubCount > 0 {
		isSubscribed = true
		if strings.Contains(subPlanType, "5") {
			subscriptionPlan = 5
		} else if strings.Contains(subPlanType, "4") {
			subscriptionPlan = 4
		} else if strings.Contains(subPlanType, "3") {
			subscriptionPlan = 3
		} else if strings.Contains(subPlanType, "2") {
			subscriptionPlan = 2
		} else if strings.Contains(subPlanType, "1") {
			subscriptionPlan = 1
		}
	} else if isSubActiveInUser && userSubExpiresAt != nil && userSubExpiresAt.After(time.Now()) && subscriptionPlan > 0 {
		isSubscribed = true
		subEndDate = *userSubExpiresAt
	}

	var allowedPharmacies int
	trialDaysLeft := 0
	isTrialExpired := false

	if isSubscribed {
		if subscriptionPlan <= 0 {
			subscriptionPlan = 1
		}
		allowedPharmacies = subscriptionPlan

		if !subEndDate.IsZero() {
			hoursLeft := time.Until(subEndDate).Hours()
			if hoursLeft <= 0 {
				trialDaysLeft = 0
			} else {
				trialDaysLeft = int(math.Ceil(hoursLeft / 24.0))
				if trialDaysLeft > 30 {
					trialDaysLeft = 30
				}
			}
		} else {
			trialDaysLeft = 30
		}
		isTrialExpired = false
	} else {
		// Free trial has expired or no active subscription:
		// "بعد كده، حتى لو صيدلية واحدة، تبقى الاشتراك 100 جنيه"
		subscriptionPlan = 0
		allowedPharmacies = 0
		trialDaysLeft = 0
		isTrialExpired = true
	}

	if isPaused {
		isSubscribed = false
		allowedPharmacies = 0
		subscriptionPlan = 0
	}

	// Fetch distinct linked pharmacies with suspension status
	rows, err := s.router.Pool().Query(
		c.Request.Context(),
		`SELECT DISTINCT COALESCE(code, ''), COALESCE(name, ''), COALESCE(is_suspended, false)
		 FROM public.pharmacies 
		 WHERE linked_user_id IN (
			SELECT id::text FROM public.users WHERE LOWER(email) = LOWER($1)
			UNION
			SELECT email FROM public.users WHERE LOWER(email) = LOWER($1)
			UNION
			SELECT google_id FROM public.users WHERE LOWER(email) = LOWER($1) AND google_id IS NOT NULL AND google_id <> ''
			UNION
			SELECT apple_id FROM public.users WHERE LOWER(email) = LOWER($1) AND apple_id IS NOT NULL AND apple_id <> ''
		 ) AND is_active = true
		 ORDER BY is_suspended ASC, code ASC`,
		email,
	)
	linkedList := make([]PharmacyItem, 0)
	activeSelectedCount := 0
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var p PharmacyItem
			if scanErr := rows.Scan(&p.Code, &p.Name, &p.IsSuspended); scanErr == nil {
				linkedList = append(linkedList, p)
				if !p.IsSuspended {
					activeSelectedCount++
				}
			}
		}
	}

	linkedCount := len(linkedList)
	canAddPharmacy := isSubscribed && allowedPharmacies > linkedCount
	hasOverflow := isSubscribed && allowedPharmacies > 0 && linkedCount > allowedPharmacies
	requiresSelection := hasOverflow && (activeSelectedCount == 0 || activeSelectedCount > allowedPharmacies)

	c.JSON(http.StatusOK, gin.H{
		"success":                 true,
		"trial_days_left":         trialDaysLeft,
		"is_trial_expired":        isTrialExpired,
		"is_subscribed":           isSubscribed,
		"is_paused":               isPaused,
		"subscription_plan":       subscriptionPlan,
		"allowed_pharmacies":      allowedPharmacies,
		"linked_pharmacies_count": linkedCount,
		"linked_pharmacies":       linkedList,
		"can_add_pharmacy":        canAddPharmacy,
		"has_overflow":            hasOverflow,
		"requires_selection":      requiresSelection,
	})
}

// GetUpgradeQuote calculates prorated upgrade pricing with credit rollover and 30 fresh days
func (s *SubscriptionService) GetUpgradeQuote(c *gin.Context) {
	email := strings.ToLower(strings.TrimSpace(c.Query("email")))
	targetPlanStr := strings.TrimSpace(c.Query("target_plan"))
	targetPlan, _ := strconv.Atoi(targetPlanStr)
	if targetPlan <= 0 {
		targetPlan = 3
	}

	if email == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "البريد الإلكتروني مطلوب"})
		return
	}

	// 1. Check authoritative subscription in public.subscriptions
	var activeSubCount int
	var subPlanType string
	var subEndDate time.Time
	_ = s.router.Pool().QueryRow(
		c.Request.Context(),
		`SELECT 
			COUNT(*),
			COALESCE(MAX(plan_type), ''),
			COALESCE(MAX(end_date), CURRENT_DATE + INTERVAL '30 days')
		 FROM (
			SELECT plan_type, end_date
			FROM public.subscriptions 
			WHERE LOWER(TRIM(user_email)) = LOWER(TRIM($1))
			  AND status = 'active'
			  AND (end_date IS NULL OR end_date >= CURRENT_DATE)
			ORDER BY created_at DESC 
			LIMIT 1
		 ) latest_sub`,
		email,
	).Scan(&activeSubCount, &subPlanType, &subEndDate)

	// 2. Fallback check against public.users
	var subscriptionPlan int
	var isSubActiveInUser bool
	var userSubExpiresAt *time.Time
	_ = s.router.Pool().QueryRow(
		c.Request.Context(),
		`SELECT 
			COALESCE(subscription_plan, 0),
			COALESCE(is_subscription_active, false),
			subscription_expires_at
		 FROM public.users 
		 WHERE LOWER(email) = LOWER($1) LIMIT 1`,
		email,
	).Scan(&subscriptionPlan, &isSubActiveInUser, &userSubExpiresAt)

	currentPlan := 0
	if activeSubCount > 0 {
		if strings.Contains(subPlanType, "5") {
			currentPlan = 5
		} else if strings.Contains(subPlanType, "4") {
			currentPlan = 4
		} else if strings.Contains(subPlanType, "3") {
			currentPlan = 3
		} else if strings.Contains(subPlanType, "2") {
			currentPlan = 2
		} else if strings.Contains(subPlanType, "1") {
			currentPlan = 1
		} else if subscriptionPlan > 0 {
			currentPlan = subscriptionPlan
		}
	} else if isSubActiveInUser && userSubExpiresAt != nil && userSubExpiresAt.After(time.Now()) && subscriptionPlan > 0 {
		currentPlan = subscriptionPlan
		subEndDate = *userSubExpiresAt
	}

	daysRemaining := 0
	currentPlanPrice := 0.0
	unusedCredit := 0.0
	isUpgrade := false

	targetPrice := getPlanPrice(targetPlan)

	if currentPlan > 0 && !subEndDate.IsZero() && subEndDate.After(time.Now()) {
		var isFreeTrial bool
		_ = s.router.Pool().QueryRow(
			c.Request.Context(),
			`SELECT EXISTS(
				SELECT 1 FROM public.subscriptions
				WHERE LOWER(TRIM(user_email)) = LOWER(TRIM($1))
				  AND status = 'active'
				  AND (amount = 0 OR payment_method = 'free_trial' OR plan_type LIKE '%تجريب%')
			)`,
			email,
		).Scan(&isFreeTrial)

		hoursLeft := time.Until(subEndDate).Hours()
		if hoursLeft <= 0 {
			daysRemaining = 0
		} else {
			daysRemaining = int(math.Ceil(hoursLeft / 24.0))
			if daysRemaining > 30 {
				daysRemaining = 30
			}
		}

		if isFreeTrial {
			currentPlanPrice = 0
			unusedCredit = 0
			isUpgrade = false
		} else {
			isUpgrade = true
			currentPlanPrice = getPlanPrice(currentPlan)
			dailyRate := currentPlanPrice / 30.0
			unusedCredit = math.Round(dailyRate * float64(daysRemaining))

			// If user targets same or lower plan, bump target to current + 1
			if targetPlan <= currentPlan {
				targetPlan = currentPlan + 1
				if targetPlan > 5 {
					targetPlan = 5
				}
				targetPrice = getPlanPrice(targetPlan)
			}
		}
	}

	rawFinal := targetPrice - unusedCredit
	// Round to neat 5 EGP increments for pleasant pricing (e.g. 216.6 -> 215)
	finalAmount := math.Round(rawFinal/5.0) * 5.0
	if finalAmount < 50.0 {
		finalAmount = 50.0 // Minimum floor
	}

	c.JSON(http.StatusOK, gin.H{
		"success":            true,
		"email":              email,
		"current_plan":       currentPlan,
		"current_plan_price": currentPlanPrice,
		"days_remaining":     daysRemaining,
		"unused_credit":      unusedCredit,
		"target_plan":        targetPlan,
		"target_plan_price":  targetPrice,
		"final_amount":       finalAmount,
		"currency":           "EGP",
		"is_upgrade":         isUpgrade,
		"new_duration_days":  30,
	})
}

// RegisterPharmacy registers a pharmacy code globally for subscription management
func (s *SubscriptionService) RegisterPharmacy(c *gin.Context) {
	var req struct {
		Code     string `json:"code" binding:"required"`
		Name     string `json:"name" binding:"required"`
		Email    string `json:"email"`
		TenantID string `json:"tenant_id"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "كود واسم الصيدلية مطلوبان"})
		return
	}

	cleanEmail := strings.ToLower(strings.TrimSpace(req.Email))
	if cleanEmail != "" {
		var userID string
		_ = s.router.Pool().QueryRow(c.Request.Context(), `SELECT id FROM public.users WHERE LOWER(email) = LOWER($1) LIMIT 1`, cleanEmail).Scan(&userID)
		if userID != "" && strings.TrimSpace(req.TenantID) != "" {
			_, _ = s.router.Pool().Exec(
				c.Request.Context(),
				`UPDATE public.pharmacies SET linked_user_id = $1, updated_at = NOW() WHERE LOWER(code) = LOWER($2) AND tenant_id = $3`,
				userID, strings.TrimSpace(req.Code), strings.TrimSpace(req.TenantID),
			)
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "تم تسجيل الصيدلية وتحديث الربط بنجاح",
	})
}

// RecordPayment persists a successful Kashier/Card/InstaPay payment into DB
func (s *SubscriptionService) RecordPayment(c *gin.Context) {
	var req struct {
		UserEmail     string  `json:"user_email"`
		UserName      string  `json:"user_name"`
		UserPhone     string  `json:"user_phone"`
		PlanType      string  `json:"plan_type"`
		Amount        float64 `json:"amount"`
		PaymentMethod string  `json:"payment_method"`
		Status        string  `json:"status"`
		OrderID       string  `json:"order_id"`
		TransactionID string  `json:"transaction_id"`
		CardBrand     string  `json:"card_brand"`
		MaskedCard    string  `json:"masked_card"`
		ReceiptRef    string  `json:"receipt_ref"`
		Notes         string  `json:"notes"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid payload"})
		return
	}

	if req.PaymentMethod == "" {
		req.PaymentMethod = "kashier"
	}
	if req.Status == "" {
		req.Status = "active"
	}
	if req.ReceiptRef == "" {
		req.ReceiptRef = req.TransactionID
		if req.ReceiptRef == "" {
			req.ReceiptRef = req.OrderID
		}
	}
	if req.Notes == "" {
		req.Notes = "دفع إلكتروني ناجح عبر بوابة كاشير (Kashier) - مرجع: " + req.ReceiptRef
	}

	// Determine plan integer
	plan := 3
	if strings.HasPrefix(req.PlanType, "P") {
		var p int
		if _, err := fmt.Sscanf(req.PlanType, "P%d", &p); err == nil && p > 0 {
			plan = p
		}
	} else if strings.Contains(req.PlanType, "5") {
		plan = 5
	} else if strings.Contains(req.PlanType, "4") {
		plan = 4
	} else if strings.Contains(req.PlanType, "3") {
		plan = 3
	} else if strings.Contains(req.PlanType, "2") {
		plan = 2
	} else if strings.Contains(req.PlanType, "1") {
		plan = 1
	}

	// If plan is still default, try extracting from OrderID (e.g. XPH-SUB-user-P4-A55-...)
	if req.OrderID != "" {
		parts := strings.Split(req.OrderID, "-")
		for _, part := range parts {
			if strings.HasPrefix(part, "P") && len(part) >= 2 {
				if val, err := strconv.Atoi(part[1:]); err == nil && val > 0 {
					plan = val
					break
				}
			}
		}
	}

	// 0. Idempotency Check: Don't insert duplicate records for the same order_id
	if req.OrderID != "" {
		var existingID string
		_ = s.router.Pool().QueryRow(
			c.Request.Context(),
			`SELECT id FROM public.subscriptions WHERE order_id = $1 LIMIT 1`,
			req.OrderID,
		).Scan(&existingID)
		if existingID != "" {
			// Already recorded! Ensure it is active and user is updated
			_, _ = s.router.Pool().Exec(c.Request.Context(),
				`UPDATE public.subscriptions SET status = 'active', plan_type = $2, updated_at = NOW() WHERE id = $1`,
				existingID, fmt.Sprintf("%d صيدليات", plan),
			)
			if req.UserEmail != "" {
				_, _ = s.router.Pool().Exec(c.Request.Context(),
					`UPDATE public.users 
					 SET subscription_plan = $1, 
					     is_subscription_active = true, 
					     subscription_expires_at = NOW() + INTERVAL '30 days',
					     updated_at = NOW()
					 WHERE LOWER(email) = LOWER($2)`,
					plan, strings.ToLower(req.UserEmail),
				)
			}
			c.JSON(http.StatusOK, gin.H{
				"success": true,
				"message": "تم تأكيد وتحديث الاشتراك بنجاح (معاملة سابقة مسجلة)",
				"plan":    plan,
			})
			return
		}
	}

	// 1. Supersede any older active subscriptions for this email so new plan takes priority
	if req.UserEmail != "" {
		_, _ = s.router.Pool().Exec(
			c.Request.Context(),
			`UPDATE public.subscriptions SET status = 'superseded', updated_at = NOW() WHERE LOWER(user_email) = LOWER($1) AND status = 'active'`,
			req.UserEmail,
		)
	}

	// 2. Insert new active subscription into public.subscriptions
	_, err := s.router.Pool().Exec(
		c.Request.Context(),
		`INSERT INTO public.subscriptions (
			tenant_id, user_email, user_name, user_phone, plan_type, amount, payment_method,
			status, order_id, transaction_id, card_brand, masked_card, receipt_ref,
			notes, start_date, end_date, created_at, updated_at
		) VALUES (
			(SELECT id FROM public.tenants LIMIT 1),
			$1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
			CURRENT_DATE, CURRENT_DATE + INTERVAL '30 days', NOW(), NOW()
		)`,
		req.UserEmail, req.UserName, req.UserPhone, fmt.Sprintf("%d صيدليات", plan),
		req.Amount, req.PaymentMethod, req.Status, req.OrderID, req.TransactionID,
		req.CardBrand, req.MaskedCard, req.ReceiptRef, req.Notes,
	)
	if err != nil {
		log.Printf("[RecordPayment] Insert error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "فشل حفظ الاشتراك في قاعدة البيانات: " + err.Error()})
		return
	}

	// 3. Update public.users
	if req.UserEmail != "" {
		cleanEmail := strings.ToLower(req.UserEmail)
		_, err := s.router.Pool().Exec(
			c.Request.Context(),
			`UPDATE public.users 
			 SET subscription_plan = $1, 
			     is_subscription_active = true, 
			     subscription_expires_at = NOW() + INTERVAL '30 days',
			     updated_at = NOW()
			 WHERE LOWER(email) = LOWER($2)`,
			plan, cleanEmail,
		)
		if err != nil {
			log.Printf("[RecordPayment] Update users error: %v", err)
		}

		// Count user's total pharmacies: if new plan >= total pharmacies, unsuspend all of them!
		var totalUserPharmacies int
		_ = s.router.Pool().QueryRow(
			c.Request.Context(),
			`SELECT COUNT(DISTINCT code) FROM public.pharmacies
			 WHERE linked_user_id IN (
				SELECT id::text FROM public.users WHERE LOWER(email) = LOWER($1)
				UNION
				SELECT email FROM public.users WHERE LOWER(email) = LOWER($1)
			 ) AND is_active = true`,
			cleanEmail,
		).Scan(&totalUserPharmacies)

		if plan >= totalUserPharmacies {
			_, _ = s.router.Pool().Exec(
				c.Request.Context(),
				`UPDATE public.pharmacies
				 SET is_suspended = false, updated_at = NOW()
				 WHERE linked_user_id IN (
					SELECT id::text FROM public.users WHERE LOWER(email) = LOWER($1)
					UNION
					SELECT email FROM public.users WHERE LOWER(email) = LOWER($1)
				 )`,
				cleanEmail,
			)
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "تم تسجيل الفاتورة والاشتراك بنجاح",
		"plan":    plan,
	})
}

// SelectActivePharmacies lets a user choose which pharmacies to keep active when plan tier is lower than linked pharmacies count
func (s *SubscriptionService) SelectActivePharmacies(c *gin.Context) {
	var req struct {
		Email       string   `json:"email" binding:"required"`
		ActiveCodes []string `json:"active_pharmacy_codes" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "بيانات التفعيل غير مكتملة"})
		return
	}

	cleanEmail := strings.ToLower(strings.TrimSpace(req.Email))
	if cleanEmail == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "البريد الإلكتروني مطلوب"})
		return
	}

	// 1. Authoritative check of user's allowed pharmacies
	var activeSubCount int
	var subPlanType string
	_ = s.router.Pool().QueryRow(
		c.Request.Context(),
		`SELECT 
			COUNT(*),
			COALESCE(MAX(plan_type), '')
		 FROM (
			SELECT plan_type
			FROM public.subscriptions 
			WHERE LOWER(TRIM(user_email)) = LOWER(TRIM($1))
			  AND status = 'active'
			  AND (end_date IS NULL OR end_date >= CURRENT_DATE)
			ORDER BY created_at DESC 
			LIMIT 1
		 ) latest_sub`,
		cleanEmail,
	).Scan(&activeSubCount, &subPlanType)

	allowedPharmacies := 0
	if activeSubCount > 0 {
		if strings.Contains(subPlanType, "5") {
			allowedPharmacies = 5
		} else if strings.Contains(subPlanType, "4") {
			allowedPharmacies = 4
		} else if strings.Contains(subPlanType, "3") {
			allowedPharmacies = 3
		} else if strings.Contains(subPlanType, "2") {
			allowedPharmacies = 2
		} else {
			allowedPharmacies = 1
		}
	} else {
		// Check public.users
		var userPlan int
		var isSubActive bool
		var expiresAt *time.Time
		_ = s.router.Pool().QueryRow(
			c.Request.Context(),
			`SELECT COALESCE(subscription_plan, 0), COALESCE(is_subscription_active, false), subscription_expires_at
			 FROM public.users WHERE LOWER(email) = LOWER($1) LIMIT 1`,
			cleanEmail,
		).Scan(&userPlan, &isSubActive, &expiresAt)

		if isSubActive && expiresAt != nil && expiresAt.After(time.Now()) && userPlan > 0 {
			allowedPharmacies = userPlan
		}
	}

	if allowedPharmacies <= 0 {
		c.JSON(http.StatusPaymentRequired, gin.H{
			"error": "انتهت باقة اشتراكك. يرجى تجديد الاشتراك أولاً لتحديد الصيدليات النشطة.",
		})
		return
	}

	if len(req.ActiveCodes) > allowedPharmacies {
		label := "صيدليات"
		if allowedPharmacies == 1 {
			label = "صيدلية واحدة"
		} else if allowedPharmacies == 2 {
			label = "صيدليتين"
		}
		c.JSON(http.StatusBadRequest, gin.H{
			"error": fmt.Sprintf("باقتك الحالية تسمح بتفعيل %d %s فقط. يرجى تقليل الاختيار أو ترقية باقتك.", allowedPharmacies, label),
		})
		return
	}

	userIDsQuery := `
		SELECT id::text FROM public.users WHERE LOWER(email) = LOWER($1)
		UNION
		SELECT email FROM public.users WHERE LOWER(email) = LOWER($1)
		UNION
		SELECT google_id FROM public.users WHERE LOWER(email) = LOWER($1) AND google_id IS NOT NULL AND google_id <> ''
		UNION
		SELECT apple_id FROM public.users WHERE LOWER(email) = LOWER($1) AND apple_id IS NOT NULL AND apple_id <> ''
	`

	// First suspend all user's pharmacies
	_, err := s.router.Pool().Exec(
		c.Request.Context(),
		`UPDATE public.pharmacies
		 SET is_suspended = true, updated_at = NOW()
		 WHERE linked_user_id IN (`+userIDsQuery+`)`,
		cleanEmail,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "فشل تحديث حالة الصيدليات"})
		return
	}

	// Then activate selected ones
	if len(req.ActiveCodes) > 0 {
		_, err = s.router.Pool().Exec(
			c.Request.Context(),
			`UPDATE public.pharmacies
			 SET is_suspended = false, updated_at = NOW()
			 WHERE linked_user_id IN (`+userIDsQuery+`)
			   AND code = ANY($2)`,
			cleanEmail, req.ActiveCodes,
		)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "فشل تفعيل الصيدليات المختارة"})
			return
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"success":            true,
		"message":            "تم تحديد وتفعيل الصيدليات بنجاح",
		"active_codes":       req.ActiveCodes,
		"allowed_pharmacies": allowedPharmacies,
	})
}

