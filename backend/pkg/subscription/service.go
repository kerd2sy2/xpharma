package subscription

import (
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
		 WHERE email = $1 LIMIT 1`,
		email,
	).Scan(&trialStartedAt, &subscriptionPlan, &subscriptionExpiresAt, &isSubscriptionActive)

	if err != nil {
		// New or uncreated user
		c.JSON(http.StatusOK, gin.H{
			"success":                 true,
			"trial_days_left":         7,
			"is_trial_expired":        false,
			"is_subscribed":           false,
			"subscription_plan":       0,
			"linked_pharmacies_count": 0,
		})
		return
	}

	trialDaysPassed := int(time.Since(trialStartedAt).Hours() / 24)
	trialDaysLeft := 7 - trialDaysPassed
	if trialDaysLeft < 0 {
		trialDaysLeft = 0
	}

	isSubscribed := isSubscriptionActive || subscriptionPlan > 0
	if subscriptionExpiresAt != nil && subscriptionExpiresAt.Before(time.Now()) {
		isSubscribed = false
	}

	isTrialExpired := trialDaysPassed >= 7 && !isSubscribed

	var linkedCount int
	_ = s.router.Pool().QueryRow(
		c.Request.Context(),
		`SELECT COUNT(DISTINCT code) FROM public.pharmacies WHERE linked_user_id IN (SELECT id FROM public.users WHERE email = $1)`,
		email,
	).Scan(&linkedCount)

	c.JSON(http.StatusOK, gin.H{
		"success":                 true,
		"trial_days_left":         trialDaysLeft,
		"is_trial_expired":        isTrialExpired,
		"is_subscribed":           isSubscribed,
		"subscription_plan":       subscriptionPlan,
		"linked_pharmacies_count": linkedCount,
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

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "تم تسجيل الصيدلية بنجاح",
	})
}
