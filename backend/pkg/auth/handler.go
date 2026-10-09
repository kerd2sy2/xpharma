package auth

import (
	"context"
	"encoding/json"
	"log"
	"math"
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
	otpService   *OTPService
}

func NewAuthHandler(router *db.TenantRouter, tokenService *TokenService) *AuthHandler {
	// Ensure provider check constraint accommodates phone/otp login
	_, _ = router.Pool().Exec(
		context.Background(),
		`ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_provider_check;
		 ALTER TABLE public.users ADD CONSTRAINT users_provider_check CHECK (provider IN ('google', 'apple', 'email', 'phone', 'otp'));`,
	)

	return &AuthHandler{
		router:       router,
		tokenService: tokenService,
		otpService:   NewOTPService(),
	}
}

// resolveUserSubscription returns active plan, remaining days (max 30), and expired status
func (h *AuthHandler) resolveUserSubscription(ctx context.Context, email string) (plan int, daysLeft int, isExpired bool) {
	cleanEmail := strings.ToLower(strings.TrimSpace(email))
	if cleanEmail == "" {
		return 0, 0, true
	}

	var activeSubCount int
	var subPlanType string
	var subEndDate time.Time
	_ = h.router.Pool().QueryRow(
		ctx,
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
		cleanEmail,
	).Scan(&activeSubCount, &subPlanType, &subEndDate)

	if activeSubCount > 0 {
		if strings.Contains(subPlanType, "5") {
			plan = 5
		} else if strings.Contains(subPlanType, "4") {
			plan = 4
		} else if strings.Contains(subPlanType, "3") {
			plan = 3
		} else if strings.Contains(subPlanType, "2") {
			plan = 2
		} else {
			plan = 1
		}

		if !subEndDate.IsZero() {
			hoursLeft := time.Until(subEndDate).Hours()
			if hoursLeft <= 0 {
				daysLeft = 0
			} else {
				daysLeft = int(math.Ceil(hoursLeft / 24.0))
				if daysLeft > 30 {
					daysLeft = 30
				}
			}
		} else {
			daysLeft = 30
		}
		isExpired = false
		return
	}

	// Fallback check against public.users
	var userPlan int
	var isSubActive bool
	var expiresAt *time.Time
	_ = h.router.Pool().QueryRow(
		ctx,
		`SELECT COALESCE(subscription_plan, 0), COALESCE(is_subscription_active, false), subscription_expires_at
		 FROM public.users WHERE LOWER(email) = LOWER($1) LIMIT 1`,
		cleanEmail,
	).Scan(&userPlan, &isSubActive, &expiresAt)

	if isSubActive && expiresAt != nil && expiresAt.After(time.Now()) && userPlan > 0 {
		plan = userPlan
		hoursLeft := time.Until(*expiresAt).Hours()
		if hoursLeft <= 0 {
			daysLeft = 0
		} else {
			daysLeft = int(math.Ceil(hoursLeft / 24.0))
			if daysLeft > 30 {
				daysLeft = 30
			}
		}
		isExpired = false
		return
	}

	// No active subscription: expired!
	return 0, 0, true
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
		googleClientID = "689660111938-7s2nne8stcvnqlff73h5jvm3q3oo0k97.apps.googleusercontent.com"
	}

	profile, err := VerifyGoogleToken(req.IDToken, googleClientID)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "فشل التحقق من حساب Google: " + err.Error()})
		return
	}

	emailClean := strings.ToLower(strings.TrimSpace(profile.Email))
	incomingDeviceID := strings.TrimSpace(req.DeviceID)
	incomingDeviceName := strings.TrimSpace(req.DeviceName)

	var existingDeviceID, existingDeviceName, existingPhone string
	var trialStartedAt time.Time
	var subscriptionPlan int
	_ = h.router.Pool().QueryRow(
		c.Request.Context(),
		`SELECT COALESCE(device_id, ''), COALESCE(device_name, ''), COALESCE(phone, ''), COALESCE(trial_started_at, NOW()), COALESCE(subscription_plan, 0)
		 FROM public.users WHERE email = $1 LIMIT 1`,
		emailClean,
	).Scan(&existingDeviceID, &existingDeviceName, &existingPhone, &trialStartedAt, &subscriptionPlan)

	isLegacyMigration := existingDeviceID != "" &&
		strings.HasPrefix(existingDeviceID, "XPH-ANDROID-") &&
		!strings.HasPrefix(existingDeviceID, "XPH-HW-") &&
		existingDeviceName != "" &&
		strings.EqualFold(strings.TrimSpace(existingDeviceName), strings.TrimSpace(incomingDeviceName))

	if existingDeviceID != "" && existingDeviceID != incomingDeviceID && !isLegacyMigration {
		c.JSON(http.StatusConflict, gin.H{
			"success":           false,
			"code":              "DEVICE_MISMATCH",
			"error":             "نأسف لقد تم تسجيل الدخول بواسطة جوجل بجهاز آخر. يرجى تسجيل الخروج ثم تسجيل الدخول مرة أخرى.",
			"registered_device": existingDeviceName,
			"current_device":    incomingDeviceName,
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

	// -------------------------------------------------------------
	// 2-Factor Authentication (OTP via SMS) Enforcement
	// -------------------------------------------------------------
	// Case 1: First-time Google user (No registered phone number)
	if existingPhone == "" {
		ticket, err := h.tokenService.GenerateTicket(emailClean, profile.Sub, incomingDeviceID, incomingDeviceName, "setup_phone")
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "فشل إنشاء رمز التحقق"})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"success":             true,
			"requires_phone":      true,
			"verification_ticket": ticket,
			"email":               emailClean,
			"name":                profile.Name,
			"message":             "يرجى إدخال رقم الهاتف لاستلام رمز التحقق لمرة واحدة (SMS)",
		})
		return
	}

	// Case 2: Returning user with registered phone - Send OTP automatically via SMS
	ticket, err := h.tokenService.GenerateTicket(emailClean, profile.Sub, incomingDeviceID, incomingDeviceName, "verify_otp")
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "فشل إنشاء رمز التحقق"})
		return
	}

	sendErr := h.otpService.SendOTP(c.Request.Context(), existingPhone)
	if sendErr != nil {
		log.Printf("[Google 2FA] Warning: Failed to send OTP to %s: %v", existingPhone, sendErr)
	}

	c.JSON(http.StatusOK, gin.H{
		"success":             true,
		"requires_otp":        true,
		"phone_masked":        MaskPhone(existingPhone),
		"verification_ticket": ticket,
		"email":               emailClean,
		"name":                profile.Name,
		"message":             "تم إرسال رمز التحقق إلى رقم هاتفك المسجل لتأكيد الدخول",
	})
}

// issueUserSession sets up trial subscription and issues production JWT token
func (h *AuthHandler) issueUserSession(c *gin.Context, emailClean, incomingDeviceID, incomingDeviceName string) {
	var dbUserID, dbRole, dbName, dbAvatar, dbPhone string
	var trialStartedAt time.Time
	var subscriptionPlan int
	var isActive bool = true

	err := h.router.Pool().QueryRow(
		c.Request.Context(),
		`SELECT id, role, is_active, COALESCE(name, ''), COALESCE(avatar_url, ''), COALESCE(phone, ''), COALESCE(trial_started_at, NOW()), COALESCE(subscription_plan, 0)
		 FROM public.users WHERE email = $1 LIMIT 1`,
		emailClean,
	).Scan(&dbUserID, &dbRole, &isActive, &dbName, &dbAvatar, &dbPhone, &trialStartedAt, &subscriptionPlan)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "فشل العثور على بيانات المستخدم"})
		return
	}

	if !isActive {
		c.JSON(http.StatusForbidden, gin.H{"error": "تم تعطيل هذا الحساب. يرجى مراجعة إدارة المنصة"})
		return
	}

	// Ensure 30-day free trial subscription (1 pharmacy, 0 EGP) is automatically activated
	_, _ = h.router.Pool().Exec(
		c.Request.Context(),
		`INSERT INTO public.subscriptions (
			tenant_id, user_email, user_name, user_phone, plan_type, amount, payment_method,
			status, start_date, end_date, created_at, updated_at, notes
		)
		SELECT 
			(SELECT id FROM public.tenants LIMIT 1),
			LOWER(TRIM($1)),
			$2,
			$3,
			'1 صيدلية (فترة تجريبية مجانية)',
			0,
			'free_trial',
			'active',
			CURRENT_DATE,
			CURRENT_DATE + INTERVAL '30 days',
			NOW(),
			NOW(),
			'فترة تجريبية مجانية 30 يوماً لصيدلية واحدة مفعلة تلقائياً'
		WHERE NOT EXISTS (
			SELECT 1 FROM public.subscriptions WHERE LOWER(TRIM(user_email)) = LOWER(TRIM($1))
		)`,
		emailClean, dbName, dbPhone,
	)

	// Ensure users table is synchronized with trial plan (1 pharmacy)
	_, _ = h.router.Pool().Exec(
		c.Request.Context(),
		`UPDATE public.users
		 SET subscription_plan = 1,
		     is_subscription_active = TRUE,
		     subscription_expires_at = COALESCE(subscription_expires_at, NOW() + INTERVAL '30 days'),
		     updated_at = NOW()
		 WHERE LOWER(email) = LOWER($1) AND (subscription_plan IS NULL OR subscription_plan = 0)`,
		emailClean,
	)

	subPlan, trialDaysLeft, isTrialExpired := h.resolveUserSubscription(c.Request.Context(), emailClean)

	var pharmacyID, tenantID, pharmaCode string
	_ = h.router.Pool().QueryRow(
		c.Request.Context(),
		`SELECT id, tenant_id, code FROM public.pharmacies WHERE linked_user_id = $1 LIMIT 1`,
		dbUserID,
	).Scan(&pharmacyID, &tenantID, &pharmaCode)

	token, err := h.tokenService.GenerateToken(Claims{
		UserID:     dbUserID,
		Email:      emailClean,
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
		"subscription_plan": subPlan,
		"device_id":         incomingDeviceID,
		"user": gin.H{
			"id":                dbUserID,
			"email":             emailClean,
			"phone":             dbPhone,
			"name":              dbName,
			"photo":             dbAvatar,
			"role":              dbRole,
			"provider":          "google",
			"tenant_id":         tenantID,
			"pharmacy_id":       pharmacyID,
			"device_id":         incomingDeviceID,
			"trial_days_left":   trialDaysLeft,
			"is_trial_expired":  isTrialExpired,
			"subscription_plan": subPlan,
		},
		"role": dbRole,
	})
}

// GoogleSendPhoneOTP sends OTP to phone number entered by first-time Google user
func (h *AuthHandler) GoogleSendPhoneOTP(c *gin.Context) {
	var req struct {
		VerificationTicket string `json:"verification_ticket" binding:"required"`
		Phone              string `json:"phone" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "البيانات غير مكتملة"})
		return
	}

	_, err := h.tokenService.VerifyTicket(req.VerificationTicket)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "انتهت صلاحية الجلسة، يرجى إعادة تسجيل الدخول بحساب Google"})
		return
	}

	phoneClean := NormalizePhone(req.Phone)
	if len(phoneClean) < 9 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "رقم الهاتف غير صالح"})
		return
	}

	err = h.otpService.SendOTP(c.Request.Context(), phoneClean)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "تم إرسال رمز التحقق بنجاح إلى " + phoneClean,
	})
}

// GoogleVerifyPhoneOTP verifies OTP for first-time user and binds phone to account
func (h *AuthHandler) GoogleVerifyPhoneOTP(c *gin.Context) {
	var req struct {
		VerificationTicket string `json:"verification_ticket" binding:"required"`
		Phone              string `json:"phone" binding:"required"`
		OTP                string `json:"otp" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "البيانات غير مكتملة"})
		return
	}

	claims, err := h.tokenService.VerifyTicket(req.VerificationTicket)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "انتهت صلاحية الجلسة، يرجى إعادة تسجيل الدخول بحساب Google"})
		return
	}

	phoneClean := NormalizePhone(req.Phone)
	verified, err := h.otpService.VerifyOTP(c.Request.Context(), phoneClean, req.OTP)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "فشل التحقق من رمز التحقق: " + err.Error()})
		return
	}
	if !verified {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "رمز التحقق غير صحيح أو انتهت صلاحيته"})
		return
	}

	// Link phone number and bind this device to user
	_, err = h.router.Pool().Exec(
		c.Request.Context(),
		`UPDATE public.users 
		 SET phone = $1, device_id = $2, device_name = $3, last_login_at = NOW(), updated_at = NOW() 
		 WHERE email = $4`,
		phoneClean, claims.DeviceID, claims.DeviceName, claims.Email,
	)

	// Issue full session
	h.issueUserSession(c, claims.Email, claims.DeviceID, claims.DeviceName)
}

// GoogleVerifyOTP verifies OTP for returning user and issues session
func (h *AuthHandler) GoogleVerifyOTP(c *gin.Context) {
	var req struct {
		VerificationTicket string `json:"verification_ticket" binding:"required"`
		OTP                string `json:"otp" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "البيانات غير مكتملة"})
		return
	}

	claims, err := h.tokenService.VerifyTicket(req.VerificationTicket)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "انتهت صلاحية الجلسة، يرجى إعادة تسجيل الدخول بحساب Google"})
		return
	}

	var userPhone string
	err = h.router.Pool().QueryRow(
		c.Request.Context(),
		`SELECT COALESCE(phone, '') FROM public.users WHERE email = $1 LIMIT 1`,
		claims.Email,
	).Scan(&userPhone)
	if err != nil || userPhone == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "لم يتم العثور على رقم هاتف مسجل لهذا الحساب"})
		return
	}

	verified, err := h.otpService.VerifyOTP(c.Request.Context(), userPhone, req.OTP)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "فشل التحقق من رمز التحقق: " + err.Error()})
		return
	}
	if !verified {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "رمز التحقق غير صحيح أو انتهت صلاحيته"})
		return
	}

	// Update device binding and last login
	_, _ = h.router.Pool().Exec(
		c.Request.Context(),
		`UPDATE public.users 
		 SET device_id = $1, device_name = $2, last_login_at = NOW(), updated_at = NOW() 
		 WHERE email = $3`,
		claims.DeviceID, claims.DeviceName, claims.Email,
	)

	// Issue full session
	h.issueUserSession(c, claims.Email, claims.DeviceID, claims.DeviceName)
}

// GoogleResendOTP resends OTP to registered phone number for returning user
func (h *AuthHandler) GoogleResendOTP(c *gin.Context) {
	var req struct {
		VerificationTicket string `json:"verification_ticket" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "البيانات غير مكتملة"})
		return
	}

	claims, err := h.tokenService.VerifyTicket(req.VerificationTicket)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "انتهت صلاحية الجلسة، يرجى إعادة تسجيل الدخول بحساب Google"})
		return
	}

	var userPhone string
	err = h.router.Pool().QueryRow(
		c.Request.Context(),
		`SELECT COALESCE(phone, '') FROM public.users WHERE email = $1 LIMIT 1`,
		claims.Email,
	).Scan(&userPhone)
	if err != nil || userPhone == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "لم يتم العثور على رقم هاتف مسجل"})
		return
	}

	err = h.otpService.SendOTP(c.Request.Context(), userPhone)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "message": "تمت إعادة إرسال رمز التحقق بنجاح"})
}

// Logout clears the device binding in database so another device can log in cleanly
func (h *AuthHandler) Logout(c *gin.Context) {
	var req struct {
		Email string `json:"email"`
	}
	_ = c.ShouldBindJSON(&req)

	cleanEmail := strings.ToLower(strings.TrimSpace(req.Email))
	if cleanEmail == "" {
		if claimsVal, exists := c.Get("claims"); exists {
			if claims, ok := claimsVal.(*Claims); ok {
				cleanEmail = strings.ToLower(strings.TrimSpace(claims.Email))
			}
		}
	}

	if cleanEmail != "" {
		_, _ = h.router.Pool().Exec(
			c.Request.Context(),
			`UPDATE public.users SET device_id = NULL, device_name = NULL, updated_at = NOW() WHERE email = $1`,
			cleanEmail,
		)
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "تم تسجيل الخروج وفك ربط الجهاز بنجاح",
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

	// Ensure 30-day free trial subscription (1 pharmacy, 0 EGP) is automatically activated for new users
	_, _ = h.router.Pool().Exec(
		c.Request.Context(),
		`INSERT INTO public.subscriptions (
			tenant_id, user_email, user_name, user_phone, plan_type, amount, payment_method,
			status, start_date, end_date, created_at, updated_at, notes
		)
		SELECT 
			(SELECT id FROM public.tenants LIMIT 1),
			LOWER(TRIM($1)),
			$2,
			$3,
			'1 صيدلية (فترة تجريبية مجانية)',
			0,
			'free_trial',
			'active',
			CURRENT_DATE,
			CURRENT_DATE + INTERVAL '30 days',
			NOW(),
			NOW(),
			'فترة تجريبية مجانية 30 يوماً لصيدلية واحدة مفعلة تلقائياً'
		WHERE NOT EXISTS (
			SELECT 1 FROM public.subscriptions WHERE LOWER(TRIM(user_email)) = LOWER(TRIM($1))
		)`,
		appleEmail, userName, incomingDeviceName,
	)

	// Ensure users table is synchronized with trial plan (1 pharmacy)
	_, _ = h.router.Pool().Exec(
		c.Request.Context(),
		`UPDATE public.users
		 SET subscription_plan = 1,
		     is_subscription_active = TRUE,
		     subscription_expires_at = COALESCE(subscription_expires_at, NOW() + INTERVAL '30 days'),
		     updated_at = NOW()
		 WHERE LOWER(email) = LOWER($1) AND (subscription_plan IS NULL OR subscription_plan = 0)`,
		appleEmail,
	)

	subPlan, trialDaysLeft, isTrialExpired := h.resolveUserSubscription(c.Request.Context(), appleEmail)

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
		"subscription_plan": subPlan,
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
			"subscription_plan": subPlan,
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
			"trial_days_left":   30,
			"is_trial_expired":  false,
			"subscription_plan": 1,
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
			"error":             "نأسف لقد تم تسجيل الدخول بواسطة جوجل بجهاز آخر. يرجى تسجيل الخروج ثم تسجيل الدخول مرة أخرى.",
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

	subPlan, trialDaysLeft, isTrialExpired := h.resolveUserSubscription(c.Request.Context(), emailClean)

	c.JSON(http.StatusOK, gin.H{
		"success":           true,
		"device_id":         existingDeviceID,
		"trial_days_left":   trialDaysLeft,
		"is_trial_expired":  isTrialExpired,
		"subscription_plan": subPlan,
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

// SendOTP handles sending SMS verification code via Authentica SA
func (h *AuthHandler) SendOTP(c *gin.Context) {
	var req struct {
		Phone string `json:"phone" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "رقم الهاتف مطلوب"})
		return
	}

	phoneClean := NormalizePhone(req.Phone)
	if len(phoneClean) < 9 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "رقم الهاتف غير صالح"})
		return
	}

	err := h.otpService.SendOTP(c.Request.Context(), phoneClean)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{
			"success": false,
			"error":   err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "تم إرسال رمز التحقق عبر الرسائل القصيرة بنجاح",
		"phone":   phoneClean,
	})
}

// VerifyOTP validates the OTP code and completes login/registration
func (h *AuthHandler) VerifyOTP(c *gin.Context) {
	var req struct {
		Phone      string `json:"phone" binding:"required"`
		OTP        string `json:"otp" binding:"required"`
		DeviceID   string `json:"device_id"`
		DeviceName string `json:"device_name"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "رقم الهاتف ورمز التحقق مطلوبان"})
		return
	}

	phoneClean := NormalizePhone(req.Phone)
	otpClean := strings.TrimSpace(req.OTP)

	verified, err := h.otpService.VerifyOTP(c.Request.Context(), phoneClean, otpClean)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "تعذر التحقق من الرمز: " + err.Error()})
		return
	}

	if !verified {
		c.JSON(http.StatusUnauthorized, gin.H{
			"success": false,
			"error":   "رمز التحقق غير صحيح أو انتهت صلاحيته",
		})
		return
	}

	incomingDeviceID := strings.TrimSpace(req.DeviceID)
	incomingDeviceName := strings.TrimSpace(req.DeviceName)
	phoneEmail := phoneClean + "@phone.xpharma.cloud"

	var existingDeviceID, existingDeviceName, dbUserID, dbRole, dbName, dbEmail string
	var trialStartedAt time.Time
	var subscriptionPlan int
	var isActive bool = true

	queryErr := h.router.Pool().QueryRow(
		c.Request.Context(),
		`SELECT id, role, is_active, COALESCE(device_id, ''), COALESCE(device_name, ''), COALESCE(trial_started_at, NOW()), COALESCE(subscription_plan, 0), COALESCE(name, ''), email
		 FROM public.users 
		 WHERE phone = $1 OR email = $2 OR email = $1
		 LIMIT 1`,
		phoneClean, phoneEmail,
	).Scan(&dbUserID, &dbRole, &isActive, &existingDeviceID, &existingDeviceName, &trialStartedAt, &subscriptionPlan, &dbName, &dbEmail)

	if queryErr == nil {
		isLegacyMigration := existingDeviceID != "" &&
			strings.HasPrefix(existingDeviceID, "XPH-ANDROID-") &&
			!strings.HasPrefix(existingDeviceID, "XPH-HW-") &&
			existingDeviceName != "" &&
			strings.EqualFold(strings.TrimSpace(existingDeviceName), strings.TrimSpace(incomingDeviceName))

		if existingDeviceID != "" && existingDeviceID != incomingDeviceID && !isLegacyMigration {
			c.JSON(http.StatusConflict, gin.H{
				"success":           false,
				"code":              "DEVICE_MISMATCH",
				"error":             "هذا الحساب مسجل ومفعل بالفعل على هاتف آخر. لا يمكن فتح الحساب على أكثر من جهاز في نفس الوقت. تواصل مع الدعم الفني لنقل الحساب إلى جهازك الجديد.",
				"registered_device": existingDeviceName,
			})
			return
		}

		if !isActive {
			c.JSON(http.StatusForbidden, gin.H{"error": "تم تعطيل هذا الحساب. يرجى مراجعة إدارة المنصة"})
			return
		}

		if (existingDeviceID == "" || isLegacyMigration) && incomingDeviceID != "" {
			existingDeviceID = incomingDeviceID
			existingDeviceName = incomingDeviceName
		}

		_, _ = h.router.Pool().Exec(
			c.Request.Context(),
			`UPDATE public.users SET last_login_at = NOW(), updated_at = NOW(), phone = $1, device_id = COALESCE(NULLIF($2, ''), device_id), device_name = COALESCE(NULLIF($3, ''), device_name) WHERE id = $4`,
			phoneClean, incomingDeviceID, incomingDeviceName, dbUserID,
		)
	} else {
		dbRole = "user"
		dbName = "صيدلي (" + phoneClean + ")"
		dbEmail = phoneEmail

		insertQuery := `
			INSERT INTO public.users (
				phone, email, email_verified, name, provider, role, device_id, device_name, trial_started_at, last_login_at, created_at, updated_at
			) VALUES (
				$1, $2, TRUE, $3, 'phone', $4, $5, $6, NOW(), NOW(), NOW(), NOW()
			)
			RETURNING id, role, is_active, COALESCE(device_id, ''), COALESCE(trial_started_at, NOW()), COALESCE(subscription_plan, 0)
		`
		err = h.router.Pool().QueryRow(
			c.Request.Context(),
			insertQuery,
			phoneClean,
			phoneEmail,
			dbName,
			dbRole,
			incomingDeviceID,
			incomingDeviceName,
		).Scan(&dbUserID, &dbRole, &isActive, &existingDeviceID, &trialStartedAt, &subscriptionPlan)

		if err != nil {
			log.Printf("[OTP] Warning: could not persist phone user: %v", err)
			dbUserID = phoneClean
		}

		existingDeviceID = incomingDeviceID
	}

	// 30-day trial automatically active in subscriptions
	_, _ = h.router.Pool().Exec(
		c.Request.Context(),
		`INSERT INTO public.subscriptions (
			tenant_id, user_email, user_name, user_phone, plan_type, amount, payment_method,
			status, start_date, end_date, created_at, updated_at, notes
		)
		SELECT 
			(SELECT id FROM public.tenants LIMIT 1),
			LOWER(TRIM($1)),
			$2,
			$3,
			'1 صيدلية (فترة تجريبية مجانية)',
			0,
			'free_trial',
			'active',
			CURRENT_DATE,
			CURRENT_DATE + INTERVAL '30 days',
			NOW(),
			NOW(),
			'فترة تجريبية مجانية 30 يوماً مفعلة تلقائياً عبر التحقق برقم الهاتف'
		WHERE NOT EXISTS (
			SELECT 1 FROM public.subscriptions WHERE LOWER(TRIM(user_email)) = LOWER(TRIM($1)) OR user_phone = $3
		)`,
		dbEmail, dbName, phoneClean,
	)

	subPlan, trialDaysLeft, isTrialExpired := h.resolveUserSubscription(c.Request.Context(), dbEmail)

	var pharmacyID, tenantID, pharmaCode string
	_ = h.router.Pool().QueryRow(
		c.Request.Context(),
		`SELECT id, tenant_id, code FROM public.pharmacies WHERE linked_user_id = $1 OR linked_user_id = $2 LIMIT 1`,
		dbUserID, phoneClean,
	).Scan(&pharmacyID, &tenantID, &pharmaCode)

	token, err := h.tokenService.GenerateToken(Claims{
		UserID:     dbUserID,
		Email:      dbEmail,
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
		"subscription_plan": subPlan,
		"device_id":         existingDeviceID,
		"user": gin.H{
			"id":                dbUserID,
			"email":             dbEmail,
			"phone":             phoneClean,
			"name":              dbName,
			"role":              dbRole,
			"provider":          "phone",
			"tenant_id":         tenantID,
			"pharmacy_id":       pharmacyID,
			"device_id":         existingDeviceID,
			"trial_days_left":   trialDaysLeft,
			"is_trial_expired":  isTrialExpired,
			"subscription_plan": subPlan,
		},
		"role": dbRole,
	})
}

