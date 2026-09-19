package subscription

import (
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"xpharma-backend/pkg/db"
)

type SubscriptionService struct {
	router *db.TenantRouter
}

func NewSubscriptionService(router *db.TenantRouter) *SubscriptionService {
	return &SubscriptionService{
		router: router,
	}
}

// PharmacyItem represents a linked pharmacy
type PharmacyItem struct {
	Code string `json:"code"`
	Name string `json:"name"`
}

// GetStatus returns the subscription and trial status for a given user email
func (s *SubscriptionService) GetStatus(c *gin.Context) {
	email := strings.ToLower(strings.TrimSpace(c.Query("email")))
	if email == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "البريد الإلكتروني مطلوب"})
		return
	}

	var trialStartedAt time.Time
	var subscriptionPlan int
	var subscriptionExpiresAt *time.Time
	var isSubscriptionActive bool

	err := s.router.Pool().QueryRow(
		c.Request.Context(),
		`SELECT 
			COALESCE(trial_started_at, NOW()), 
			COALESCE(subscription_plan, 0),
			subscription_expires_at,
			COALESCE(is_subscription_active, false)
		 FROM public.users 
		 WHERE LOWER(email) = LOWER($1) LIMIT 1`,
		email,
	).Scan(&trialStartedAt, &subscriptionPlan, &subscriptionExpiresAt, &isSubscriptionActive)

	if err != nil {
		// New or uncreated user: default 7 days trial, 2 pharmacies allowed
		c.JSON(http.StatusOK, gin.H{
			"success":                 true,
			"trial_days_left":         7,
			"is_trial_expired":        false,
			"is_subscribed":           false,
			"subscription_plan":       0,
			"allowed_pharmacies":      2,
			"linked_pharmacies_count": 0,
			"linked_pharmacies":       []PharmacyItem{},
			"can_add_pharmacy":        true,
		})
		return
	}

	trialDaysPassed := int(time.Since(trialStartedAt).Hours() / 24)
	trialDaysLeft := 7 - trialDaysPassed
	if trialDaysLeft < 0 {
		trialDaysLeft = 0
	}

	isSubscribed := (isSubscriptionActive || subscriptionPlan > 0)
	if subscriptionExpiresAt != nil && subscriptionExpiresAt.Before(time.Now()) {
		isSubscribed = false
	}

	isTrialExpired := trialDaysPassed >= 7 && !isSubscribed

	// Allowed pharmacies: 2 during trial, or subscribedPlan count when subscribed
	allowedPharmacies := 2
	if isSubscribed && subscriptionPlan > 0 {
		allowedPharmacies = subscriptionPlan
	}

	// Fetch distinct linked pharmacies
	rows, err := s.router.Pool().Query(
		c.Request.Context(),
		`SELECT DISTINCT COALESCE(code, ''), COALESCE(name, '') 
		 FROM public.pharmacies 
		 WHERE linked_user_id IN (SELECT id FROM public.users WHERE LOWER(email) = LOWER($1))`,
		email,
	)
	linkedList := make([]PharmacyItem, 0)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var p PharmacyItem
			if scanErr := rows.Scan(&p.Code, &p.Name); scanErr == nil {
				linkedList = append(linkedList, p)
			}
		}
	}

	linkedCount := len(linkedList)
	canAddPharmacy := !isTrialExpired && (linkedCount < allowedPharmacies)

	c.JSON(http.StatusOK, gin.H{
		"success":                 true,
		"trial_days_left":         trialDaysLeft,
		"is_trial_expired":        isTrialExpired,
		"is_subscribed":           isSubscribed,
		"subscription_plan":       subscriptionPlan,
		"allowed_pharmacies":      allowedPharmacies,
		"linked_pharmacies_count": linkedCount,
		"linked_pharmacies":       linkedList,
		"can_add_pharmacy":        canAddPharmacy,
	})
}

// RegisterPharmacy registers a pharmacy code globally for subscription management
func (s *SubscriptionService) RegisterPharmacy(c *gin.Context) {
	var req struct {
		Code  string `json:"code" binding:"required"`
		Name  string `json:"name" binding:"required"`
		Email string `json:"email"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "كود واسم الصيدلية مطلوبان"})
		return
	}

	cleanEmail := strings.ToLower(strings.TrimSpace(req.Email))
	if cleanEmail != "" {
		var userID string
		_ = s.router.Pool().QueryRow(c.Request.Context(), `SELECT id FROM public.users WHERE LOWER(email) = LOWER($1) LIMIT 1`, cleanEmail).Scan(&userID)
		if userID != "" {
			_, _ = s.router.Pool().Exec(
				c.Request.Context(),
				`UPDATE public.pharmacies SET linked_user_id = $1, updated_at = NOW() WHERE LOWER(code) = LOWER($2)`,
				userID, strings.TrimSpace(req.Code),
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
	} else if req.Amount >= 300 {
		plan = 5
	} else if req.Amount >= 250 {
		plan = 4
	} else if req.Amount >= 200 {
		plan = 3
	} else if req.Amount >= 150 {
		plan = 2
	} else if req.Amount >= 100 {
		plan = 1
	}

	// 1. Insert into public.subscriptions
	_, _ = s.router.Pool().Exec(
		c.Request.Context(),
		`INSERT INTO public.subscriptions (
			user_email, user_name, user_phone, plan_type, amount, payment_method,
			status, order_id, transaction_id, card_brand, masked_card, receipt_ref,
			notes, start_date, end_date, created_at, updated_at
		) VALUES (
			$1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
			CURRENT_DATE, CURRENT_DATE + INTERVAL '30 days', NOW(), NOW()
		)`,
		req.UserEmail, req.UserName, req.UserPhone, fmt.Sprintf("%d صيدليات", plan),
		req.Amount, req.PaymentMethod, req.Status, req.OrderID, req.TransactionID,
		req.CardBrand, req.MaskedCard, req.ReceiptRef, req.Notes,
	)

	// 2. Update public.users
	if req.UserEmail != "" {
		_, _ = s.router.Pool().Exec(
			c.Request.Context(),
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
		"message": "تم تسجيل الفاتورة والاشتراك بنجاح",
		"plan":    plan,
	})
}

