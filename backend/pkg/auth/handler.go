package auth

import (
	"encoding/json"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"xpharma-backend/pkg/db"
)

type AuthHandler struct {
	router       *db.TenantRouter
	tokenService *TokenService
}

func NewAuthHandler(router *db.TenantRouter, tokenService *TokenService) *AuthHandler {
	return &AuthHandler{
		router:       router,
		tokenService: tokenService,
	}
}

func (h *AuthHandler) GoogleLogin(c *gin.Context) {
	var req struct {
		IDToken    string `json:"id_token" binding:"required"`
		DeviceID   string `json:"device_id"`
		DeviceName string `json:"device_name"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	googleClientID := os.Getenv("GOOGLE_CLIENT_ID")
	if googleClientID == "" {
		googleClientID = "691858081100-sc5nk157i5vjejhr52pgm8kkh1ofore6.apps.googleusercontent.com"
	}

	profile, err := VerifyGoogleToken(req.IDToken, googleClientID)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "فشل التحقق من حساب Google: " + err.Error()})
		return
	}

	emailClean := strings.ToLower(strings.TrimSpace(profile.Email))
	incomingDeviceID := strings.TrimSpace(req.DeviceID)
	incomingDeviceName := strings.TrimSpace(req.DeviceName)

	var existingDeviceID, existingDeviceName string
	var trialStartedAt time.Time
	var subscriptionPlan int
	_ = h.router.Pool().QueryRow(
		c.Request.Context(),
		`SELECT COALESCE(device_id, ''), COALESCE(device_name, ''), COALESCE(trial_started_at, NOW()), COALESCE(subscription_plan, 0)
		 FROM public.users WHERE email = $1 LIMIT 1`,
		emailClean,
	).Scan(&existingDeviceID, &existingDeviceName, &trialStartedAt, &subscriptionPlan)

	isLegacyMigration := existingDeviceID != "" &&
		strings.HasPrefix(existingDeviceID, "XPH-ANDROID-") &&
		!strings.HasPrefix(existingDeviceID, "XPH-HW-") &&
		existingDeviceName != "" &&
		strings.EqualFold(strings.TrimSpace(existingDeviceName), strings.TrimSpace(incomingDeviceName))

	if existingDeviceID != "" && existingDeviceID != incomingDeviceID && !isLegacyMigration {
		c.JSON(http.StatusConflict, gin.H{
			"success":           false,
			"code":              "DEVICE_MISMATCH",
			"error":             "هذا الحساب مسجل ومفعل بالفعل على هاتف آخر. لا يمكن فتح الحساب على أكثر من جهاز في نفس الوقت. تواصل مع الدعم الفني إذا كان هاتفك القديم به مشكلة وترغب في نقل الحساب إلى جهازك الجديد.",
			"registered_device": existingDeviceName,
		})
		return
	}

	role := "user"
	superAdminEmail := os.Getenv("SUPER_ADMIN_EMAIL")
	if superAdminEmail == "" {
		superAdminEmail = "kerd2sy@gmail.com"
	}

	if emailClean == strings.ToLower(strings.TrimSpace(superAdminEmail)) {
		role = "superadmin"
	}

	rawJSON, _ := json.Marshal(profile)
	emailVerified := profile.EmailVerified == "true"
	var dbUserID, dbRole string
	var isActive bool

	upsertGoogleUserQuery := `
		INSERT INTO public.users (
			google_id, email, email_verified, name, avatar_url, provider, role, raw_profile, device_id, device_name, trial_started_at, last_login_at, updated_at
		) VALUES (
			$1, $2, $3, $4, $5, 'google', $6, $7, $8, $9, NOW(), NOW(), NOW()
		)
		ON CONFLICT (email) DO UPDATE SET
			google_id = EXCLUDED.google_id,
			name = EXCLUDED.name,
			avatar_url = EXCLUDED.avatar_url,
			email_verified = EXCLUDED.email_verified,
			raw_profile = EXCLUDED.raw_profile,
			device_id = CASE 
				WHEN public.users.device_id IS NULL OR public.users.device_id = '' THEN EXCLUDED.device_id
				WHEN public.users.device_id LIKE 'XPH-ANDROID-%' AND NOT public.users.device_id LIKE 'XPH-HW-%' AND LOWER(TRIM(COALESCE(public.users.device_name, ''))) = LOWER(TRIM(COALESCE(EXCLUDED.device_name, ''))) THEN EXCLUDED.device_id
				ELSE public.users.device_id 
			END,
			device_name = CASE 
				WHEN public.users.device_name IS NULL OR public.users.device_name = '' THEN EXCLUDED.device_name
				WHEN public.users.device_id LIKE 'XPH-ANDROID-%' AND NOT public.users.device_id LIKE 'XPH-HW-%' AND LOWER(TRIM(COALESCE(public.users.device_name, ''))) = LOWER(TRIM(COALESCE(EXCLUDED.device_name, ''))) THEN EXCLUDED.device_name
				ELSE public.users.device_name 
			END,
			last_login_at = NOW(),
			updated_at = NOW()
		RETURNING id, role, is_active, COALESCE(device_id, ''), COALESCE(trial_started_at, NOW()), COALESCE(subscription_plan, 0);
	`
	err = h.router.Pool().QueryRow(
		c.Request.Context(),
		upsertGoogleUserQuery,
		profile.Sub,
		emailClean,
		emailVerified,
		profile.Name,
		profile.Picture,
		role,
		rawJSON,
		incomingDeviceID,
		incomingDeviceName,
	).Scan(&dbUserID, &dbRole, &isActive, &existingDeviceID, &trialStartedAt, &subscriptionPlan)

	if err != nil {
		log.Printf("Warning: Failed to persist google user in database: %v", err)
		dbUserID = profile.Sub
		dbRole = role
		isActive = true
	}

	if !isActive {
		c.JSON(http.StatusForbidden, gin.H{"error": "تم تعطيل هذا الحساب. يرجى مراجعة إدارة المنصة"})
		return
	}

	if (existingDeviceID == "" || isLegacyMigration) && incomingDeviceID != "" {
		_, _ = h.router.Pool().Exec(
			c.Request.Context(),
			`UPDATE public.users SET device_id = $1, device_name = $2, updated_at = NOW() WHERE email = $3`,
			incomingDeviceID, incomingDeviceName, emailClean,
		)
		existingDeviceID = incomingDeviceID
	}

	trialDaysPassed := int(time.Since(trialStartedAt).Hours() / 24)
	trialDaysLeft := 7 - trialDaysPassed
	if trialDaysLeft < 0 {
		trialDaysLeft = 0
	}
	isTrialExpired := trialDaysPassed >= 7 && subscriptionPlan == 0

	var pharmacyID, tenantID, pharmaCode string
	_ = h.router.Pool().QueryRow(
		c.Request.Context(),
		`SELECT id, tenant_id, code FROM public.pharmacies WHERE linked_user_id = $1 OR linked_user_id = $2 LIMIT 1`,
		dbUserID, profile.Sub,
	).Scan(&pharmacyID, &tenantID, &pharmaCode)

	token, err := h.tokenService.GenerateToken(Claims{
		UserID:     dbUserID,
		Email:      profile.Email,
		Role:       dbRole,
		TenantID:   tenantID,
		PharmacyID: pharmacyID,
		PharmaCode: pharmaCode,
	}, 30*24*time.Hour)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "فشل إنشاء الجلسة"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success":           true,
		"token":             token,
		"trial_days_left":   trialDaysLeft,
		"is_trial_expired":  isTrialExpired,
		"subscription_plan": subscriptionPlan,
		"device_id":         existingDeviceID,
		"user": gin.H{
			"id":                dbUserID,
			"email":             profile.Email,
			"name":              profile.Name,
			"photo":             profile.Picture,
			"role":              dbRole,
			"provider":          "google",
			"tenant_id":         tenantID,
			"pharmacy_id":       pharmacyID,
			"device_id":         existingDeviceID,
			"trial_days_left":   trialDaysLeft,
			"is_trial_expired":  isTrialExpired,
			"subscription_plan": subscriptionPlan,
		},
		"profile": profile,
		"role":    dbRole,
	})
}

func (h *AuthHandler) AppleLogin(c *gin.Context) {
	var req struct {
		IdentityToken string `json:"identity_token" binding:"required"`
		UserID        string `json:"user_id"`
		Email         string `json:"email"`
		Name          string `json:"name"`
		DeviceID      string `json:"device_id"`
		DeviceName    string `json:"device_name"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	appleEmail := strings.ToLower(strings.TrimSpace(req.Email))
	if appleEmail == "" {
		appleEmail = req.UserID + "@apple.id"
	}
	userName := req.Name
	if userName == "" {
		userName = "مستخدم Apple"
	}

	incomingDeviceID := strings.TrimSpace(req.DeviceID)
	incomingDeviceName := strings.TrimSpace(req.DeviceName)

	var existingDeviceID, existingDeviceName string
	var trialStartedAt time.Time
	var subscriptionPlan int
	_ = h.router.Pool().QueryRow(
		c.Request.Context(),
		`SELECT COALESCE(device_id, ''), COALESCE(device_name, ''), COALESCE(trial_started_at, NOW()), COALESCE(subscription_plan, 0)
		 FROM public.users WHERE email = $1 LIMIT 1`,
		appleEmail,
	).Scan(&existingDeviceID, &existingDeviceName, &trialStartedAt, &subscriptionPlan)

	if existingDeviceID != "" && existingDeviceID != incomingDeviceID {
		c.JSON(http.StatusConflict, gin.H{
			"success":           false,
			"code":              "DEVICE_MISMATCH",
			"error":             "هذا الحساب مسجل ومفعل بالفعل على هاتف آخر. لا يمكن فتح الحساب على أكثر من جهاز في نفس الوقت. تواصل مع الدعم الفني إذا كان هاتفك القديم به مشكلة وترغب في نقل الحساب إلى جهازك الجديد.",
			"registered_device": existingDeviceName,
		})
		return
	}

	role := "user"
	rawJSON, _ := json.Marshal(req)
	var dbUserID, dbRole string
	var isActive bool

	upsertAppleUserQuery := `
		INSERT INTO public.users (
			apple_id, email, email_verified, name, provider, role, raw_profile, device_id, device_name, trial_started_at, last_login_at, updated_at
		) VALUES (
			$1, $2, true, $3, 'apple', $4, $5, $6, $7, NOW(), NOW(), NOW()
		)
		ON CONFLICT (email) DO UPDATE SET
			apple_id = COALESCE(EXCLUDED.apple_id, public.users.apple_id),
			name = CASE WHEN EXCLUDED.name <> 'مستخدم Apple' THEN EXCLUDED.name ELSE public.users.name END,
			raw_profile = EXCLUDED.raw_profile,
			device_id = COALESCE(public.users.device_id, EXCLUDED.device_id),
			device_name = COALESCE(public.users.device_name, EXCLUDED.device_name),
			last_login_at = NOW(),
			updated_at = NOW()
		RETURNING id, role, is_active, COALESCE(device_id, ''), COALESCE(trial_started_at, NOW()), COALESCE(subscription_plan, 0);
	`
	err := h.router.Pool().QueryRow(
		c.Request.Context(),
		upsertAppleUserQuery,
		req.UserID,
		appleEmail,
		userName,
		role,
		rawJSON,
		incomingDeviceID,
		incomingDeviceName,
	).Scan(&dbUserID, &dbRole, &isActive, &existingDeviceID, &trialStartedAt, &subscriptionPlan)

	if err != nil {
		log.Printf("Warning: Failed to persist apple user in database: %v", err)
		dbUserID = req.UserID
		dbRole = role
		isActive = true
	}

	if !isActive {
		c.JSON(http.StatusForbidden, gin.H{"error": "تم تعطيل هذا الحساب. يرجى مراجعة إدارة المنصة"})
		return
	}

	if existingDeviceID == "" && incomingDeviceID != "" {
		_, _ = h.router.Pool().Exec(
			c.Request.Context(),
			`UPDATE public.users SET device_id = $1, device_name = $2, updated_at = NOW() WHERE email = $3`,
			incomingDeviceID, incomingDeviceName, appleEmail,
		)
		existingDeviceID = incomingDeviceID
	}

	trialDaysPassed := int(time.Since(trialStartedAt).Hours() / 24)
	trialDaysLeft := 7 - trialDaysPassed
	if trialDaysLeft < 0 {
		trialDaysLeft = 0
	}
	isTrialExpired := trialDaysPassed >= 7 && subscriptionPlan == 0

	var pharmacyID, tenantID, pharmaCode string
	_ = h.router.Pool().QueryRow(
		c.Request.Context(),
		`SELECT id, tenant_id, code FROM public.pharmacies WHERE linked_user_id = $1 OR linked_user_id = $2 LIMIT 1`,
		dbUserID, req.UserID,
	).Scan(&pharmacyID, &tenantID, &pharmaCode)

	token, err := h.tokenService.GenerateToken(Claims{
		UserID:     dbUserID,
		Email:      appleEmail,
		Role:       dbRole,
		TenantID:   tenantID,
		PharmacyID: pharmacyID,
		PharmaCode: pharmaCode,
	}, 30*24*time.Hour)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "فشل إنشاء الجلسة"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success":           true,
		"token":             token,
		"trial_days_left":   trialDaysLeft,
		"is_trial_expired":  isTrialExpired,
		"subscription_plan": subscriptionPlan,
		"device_id":         existingDeviceID,
		"user": gin.H{
			"id":                dbUserID,
			"email":             appleEmail,
			"name":              userName,
			"role":              dbRole,
			"provider":          "apple",
			"tenant_id":         tenantID,
			"pharmacy_id":       pharmacyID,
			"device_id":         existingDeviceID,
			"trial_days_left":   trialDaysLeft,
			"is_trial_expired":  isTrialExpired,
			"subscription_plan": subscriptionPlan,
		},
		"role": dbRole,
	})
}

func (h *AuthHandler) CheckDevice(c *gin.Context) {
	var req struct {
		Email      string `json:"email" binding:"required"`
		DeviceID   string `json:"device_id" binding:"required"`
		DeviceName string `json:"device_name"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "بيانات التحقق غير مكتملة"})
		return
	}

	emailClean := strings.ToLower(strings.TrimSpace(req.Email))
	incomingDeviceID := strings.TrimSpace(req.DeviceID)
	incomingDeviceName := strings.TrimSpace(req.DeviceName)

	var existingDeviceID, existingDeviceName string
	var trialStartedAt time.Time
	var subscriptionPlan int
	err := h.router.Pool().QueryRow(
		c.Request.Context(),
		`SELECT COALESCE(device_id, ''), COALESCE(device_name, ''), COALESCE(trial_started_at, NOW()), COALESCE(subscription_plan, 0)
		 FROM public.users WHERE email = $1 LIMIT 1`,
		emailClean,
	).Scan(&existingDeviceID, &existingDeviceName, &trialStartedAt, &subscriptionPlan)

	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success":           true,
			"bound":             false,
			"trial_days_left":   7,
			"is_trial_expired":  false,
			"subscription_plan": 0,
		})
		return
	}

	isLegacyMigration := existingDeviceID != "" &&
		strings.HasPrefix(existingDeviceID, "XPH-ANDROID-") &&
		!strings.HasPrefix(existingDeviceID, "XPH-HW-") &&
		existingDeviceName != "" &&
		strings.EqualFold(strings.TrimSpace(existingDeviceName), strings.TrimSpace(incomingDeviceName))

	if existingDeviceID != "" && existingDeviceID != incomingDeviceID && !isLegacyMigration {
		c.JSON(http.StatusConflict, gin.H{
			"success":           false,
			"code":              "DEVICE_MISMATCH",
			"error":             "هذا الحساب مسجل ومفعل بالفعل على هاتف آخر. لا يمكن فتح الحساب على أكثر من جهاز في نفس الوقت. تواصل مع الدعم الفني إذا كان هاتفك القديم به مشكلة وترغب في نقل الحساب إلى جهازك الجديد.",
			"registered_device": existingDeviceName,
		})
		return
	}

	if (existingDeviceID == "" || isLegacyMigration) && incomingDeviceID != "" {
		_, _ = h.router.Pool().Exec(
			c.Request.Context(),
			`UPDATE public.users SET device_id = $1, device_name = $2, updated_at = NOW() WHERE email = $3`,
			incomingDeviceID, incomingDeviceName, emailClean,
		)
		existingDeviceID = incomingDeviceID
	}

	trialDaysPassed := int(time.Since(trialStartedAt).Hours() / 24)
	trialDaysLeft := 7 - trialDaysPassed
	if trialDaysLeft < 0 {
		trialDaysLeft = 0
	}
	isTrialExpired := trialDaysPassed >= 7 && subscriptionPlan == 0

	c.JSON(http.StatusOK, gin.H{
		"success":           true,
		"device_id":         existingDeviceID,
		"trial_days_left":   trialDaysLeft,
		"is_trial_expired":  isTrialExpired,
		"subscription_plan": subscriptionPlan,
	})
}

func (h *AuthHandler) ResetDevice(c *gin.Context) {
	var req struct {
		Email string `json:"email" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "البريد الإلكتروني مطلوب"})
		return
	}

	_, err := h.router.Pool().Exec(
		c.Request.Context(),
		`UPDATE public.users SET device_id = NULL, device_name = NULL, updated_at = NOW() WHERE email = $1`,
		strings.ToLower(strings.TrimSpace(req.Email)),
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "فشل فك ربط الجهاز"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "تم فك ربط الجهاز بنجاح. يمكن للصيدلي الآن تسجيل الدخول وتفعيل الحساب على هاتفه الجديد فوراً.",
	})
}
