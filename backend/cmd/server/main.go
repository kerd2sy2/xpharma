package main

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"
	"xpharma-backend/pkg/auth"
	"xpharma-backend/pkg/db"
	"xpharma-backend/pkg/ingestion"
	"xpharma-backend/pkg/query"
)

func main() {
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		dbURL = "postgres://postgres@localhost:5432/xpharma?sslmode=disable"
	}

	jwtSecret := os.Getenv("JWT_SECRET")
	if jwtSecret == "" {
		jwtSecret = "xpharma-cloud-super-secret-jwt-key-2026"
	}

	port := os.Getenv("PORT")
	if port == "" {
		port = "5000"
	}

	log.Printf("[xpharma] Initializing Tenant Connection Router...")
	router, err := db.NewTenantRouter(dbURL)
	if err != nil {
		log.Fatalf("[xpharma] Fatal DB Error: %v", err)
	}
	defer router.Close()

	tokenService := auth.NewTokenService(jwtSecret)
	ingestionService := ingestion.NewIngestionService(router)
	queryService := query.NewQueryService(router)

	r := gin.Default()

	// CORS Middleware
	r.Use(func(c *gin.Context) {
		c.Writer.Header().Set("Access-Control-Allow-Origin", "*")
		c.Writer.Header().Set("Access-Control-Allow-Credentials", "true")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization, accept, origin, Cache-Control, X-Requested-With, X-Agent-Key, Idempotency-Key")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS, GET, PUT, PATCH, DELETE")

		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}
		c.Next()
	})

	// Health Check
	r.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"status":  "healthy",
			"service": "xpharma-backend",
			"time":    time.Now().Format(time.RFC3339),
		})
	})

	// Sync Ingestion API (for Windows Agent)
	syncGroup := r.Group("/v1/sync")
	{
		syncGroup.POST("/ingest", ingestionService.HandleIngest)
	}

	// Mobile Pharmacy Queries (Protected by JWT)
	pharmaGroup := r.Group("/v1/pharmacy")
	pharmaGroup.Use(tokenService.AuthMiddleware("pharmacist", "superadmin"))
	{
		pharmaGroup.GET("/balance", queryService.GetBalance)
		pharmaGroup.GET("/purchases", queryService.GetPurchases)
		pharmaGroup.GET("/returns", queryService.GetReturns)
		pharmaGroup.GET("/receipts", queryService.GetReceipts)
		pharmaGroup.GET("/statement", queryService.GetStatement)
		pharmaGroup.GET("/products", queryService.GetRecentProducts)
	}

	// Public / Pharmacist Warehouse Listing
	r.GET("/v1/warehouses", func(c *gin.Context) {
		userID := c.Query("user_id")

		query := `
			SELECT 
				t.id, 
				t.name, 
				t.slug, 
				t.status,
				COALESCE(p.id::text, '') AS linked_pharmacy_id,
				COALESCE(p.name, '') AS linked_pharmacy_name,
				COALESCE(p.code, '') AS linked_pharmacy_code
			FROM public.tenants t
			LEFT JOIN public.pharmacies p ON p.tenant_id = t.id AND (p.linked_user_id = $1 AND $1 <> '')
			WHERE t.status = 'active'
			ORDER BY t.name ASC
		`
		rows, err := router.Pool().Query(c.Request.Context(), query, userID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		defer rows.Close()

		var warehouses []map[string]interface{}
		for rows.Next() {
			var id, name, slug, status, linkedPharmaID, linkedPharmaName, linkedPharmaCode string
			if err := rows.Scan(&id, &name, &slug, &status, &linkedPharmaID, &linkedPharmaName, &linkedPharmaCode); err != nil {
				continue
			}

			isLinked := linkedPharmaID != ""
			var pharmaToken string
			if isLinked {
				pharmaToken, _ = tokenService.GenerateToken(auth.Claims{
					UserID:     userID,
					TenantID:   id,
					PharmacyID: linkedPharmaID,
					PharmaCode: linkedPharmaCode,
					Role:       "pharmacist",
				}, 30*24*time.Hour)
			}

			warehouses = append(warehouses, map[string]interface{}{
				"id":                   id,
				"name":                 name,
				"slug":                 slug,
				"status":               status,
				"is_linked":            isLinked,
				"linked_pharmacy_id":   linkedPharmaID,
				"linked_pharmacy_name": linkedPharmaName,
				"linked_pharmacy_code": linkedPharmaCode,
				"pharmacy_token":       pharmaToken,
			})
		}

		c.JSON(http.StatusOK, gin.H{
			"success":    true,
			"warehouses": warehouses,
		})
	})

	// Mobile Auth / Linking
	authGroup := r.Group("/v1/auth")
	{
		authGroup.POST("/verify-pharmacy", func(c *gin.Context) {
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
			err := router.Pool().QueryRow(c.Request.Context(), lookupQuery, req.TenantID, code).Scan(&pharmacyID, &name, &dbPhone, &isActive)
			if err != nil {
				c.JSON(http.StatusNotFound, gin.H{"error": "كود الصيدلية غير مسجل في قاعدة هذا المستودع. يرجى التأكد من صحة الكود."})
				return
			}

			if !isActive {
				c.JSON(http.StatusForbidden, gin.H{"error": "حساب الصيدلية غير نشط في هذا المستودع"})
				return
			}

			if phone != "" && dbPhone != "" {
				cleanInputPhone := strings.ReplaceAll(strings.ReplaceAll(phone, " ", ""), "-", "")
				cleanDBPhone := strings.ReplaceAll(strings.ReplaceAll(dbPhone, " ", ""), "-", "")
				if !strings.Contains(cleanDBPhone, cleanInputPhone) && !strings.Contains(cleanInputPhone, cleanDBPhone) {
					c.JSON(http.StatusUnauthorized, gin.H{"error": "رقم الهاتف غير مطابق لبيانات الصيدلية المسجلة لدى المستودع"})
					return
				}
			}

			linkedUID := req.UserID
			if linkedUID == "" && req.Email != "" {
				var foundUserID string
				_ = router.Pool().QueryRow(c.Request.Context(), `SELECT id FROM public.users WHERE email = $1 LIMIT 1`, req.Email).Scan(&foundUserID)
				if foundUserID != "" {
					linkedUID = foundUserID
				}
			}

			if linkedUID != "" {
				updateQuery := `UPDATE public.pharmacies SET linked_user_id = $1, updated_at = NOW() WHERE id = $2`
				_, _ = router.Pool().Exec(c.Request.Context(), updateQuery, linkedUID, pharmacyID)
			}

			token, err := tokenService.GenerateToken(auth.Claims{
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
		})
		authGroup.POST("/link-pharmacy", func(c *gin.Context) {
			var req struct {
				LinkCode string `json:"link_code" binding:"required"`
				UserID   string `json:"user_id" binding:"required"`
				Email    string `json:"email"`
			}
			if err := c.ShouldBindJSON(&req); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
				return
			}

			// Look up pharmacy by link code in central public schema
			var pharmacyID, tenantID, code, name string
			lookupQuery := `
				SELECT id, tenant_id, code, name 
				FROM public.pharmacies 
				WHERE link_code = $1 AND is_active = true
			`
			err := router.Pool().QueryRow(c.Request.Context(), lookupQuery, req.LinkCode).Scan(&pharmacyID, &tenantID, &code, &name)
			if err != nil {
				c.JSON(http.StatusNotFound, gin.H{"error": "كود الربط غير صحيح أو الصيدلية غير مفعلة"})
				return
			}

			// Update linked user
			updateQuery := `UPDATE public.pharmacies SET linked_user_id = $1, updated_at = NOW() WHERE id = $2`
			_, _ = router.Pool().Exec(c.Request.Context(), updateQuery, req.UserID, pharmacyID)

			// Generate JWT Token
			token, err := tokenService.GenerateToken(auth.Claims{
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
		})

		authGroup.POST("/google", func(c *gin.Context) {
			var req struct {
				IDToken string `json:"id_token" binding:"required"`
			}
			if err := c.ShouldBindJSON(&req); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
				return
			}

			googleClientID := os.Getenv("GOOGLE_CLIENT_ID")
			if googleClientID == "" {
				googleClientID = "691858081100-sc5nk157i5vjejhr52pgm8kkh1ofore6.apps.googleusercontent.com"
			}

			profile, err := auth.VerifyGoogleToken(req.IDToken, googleClientID)
			if err != nil {
				c.JSON(http.StatusUnauthorized, gin.H{"error": "فشل التحقق من حساب Google: " + err.Error()})
				return
			}

			role := "user"
			superAdminEmail := os.Getenv("SUPER_ADMIN_EMAIL")
			if superAdminEmail == "" {
				superAdminEmail = "kerd2sy@gmail.com"
			}

			if strings.ToLower(strings.TrimSpace(profile.Email)) == strings.ToLower(strings.TrimSpace(superAdminEmail)) {
				role = "superadmin"
			}

			// Store / Update Google user in public.users table
			rawJSON, _ := json.Marshal(profile)
			emailVerified := profile.EmailVerified == "true"
			var dbUserID, dbRole string
			var isActive bool

			upsertGoogleUserQuery := `
				INSERT INTO public.users (
					google_id, email, email_verified, name, avatar_url, provider, role, raw_profile, last_login_at, updated_at
				) VALUES (
					$1, $2, $3, $4, $5, 'google', $6, $7, NOW(), NOW()
				)
				ON CONFLICT (email) DO UPDATE SET
					google_id = EXCLUDED.google_id,
					name = EXCLUDED.name,
					avatar_url = EXCLUDED.avatar_url,
					email_verified = EXCLUDED.email_verified,
					raw_profile = EXCLUDED.raw_profile,
					last_login_at = NOW(),
					updated_at = NOW()
				RETURNING id, role, is_active;
			`
			err = router.Pool().QueryRow(
				c.Request.Context(),
				upsertGoogleUserQuery,
				profile.Sub,
				strings.ToLower(strings.TrimSpace(profile.Email)),
				emailVerified,
				profile.Name,
				profile.Picture,
				role,
				rawJSON,
			).Scan(&dbUserID, &dbRole, &isActive)

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

			// Check if this user is linked to any pharmacy in central registry
			var pharmacyID, tenantID, pharmaCode string
			_ = router.Pool().QueryRow(
				c.Request.Context(),
				`SELECT id, tenant_id, code FROM public.pharmacies WHERE linked_user_id = $1 OR linked_user_id = $2 LIMIT 1`,
				dbUserID, profile.Sub,
			).Scan(&pharmacyID, &tenantID, &pharmaCode)

			token, err := tokenService.GenerateToken(auth.Claims{
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
				"success": true,
				"token":   token,
				"user": gin.H{
					"id":          dbUserID,
					"email":       profile.Email,
					"name":        profile.Name,
					"photo":       profile.Picture,
					"role":        dbRole,
					"provider":    "google",
					"tenant_id":   tenantID,
					"pharmacy_id": pharmacyID,
				},
				"profile": profile,
				"role":    dbRole,
			})
		})

		authGroup.POST("/apple", func(c *gin.Context) {
			var req struct {
				IdentityToken string `json:"identity_token" binding:"required"`
				UserID        string `json:"user_id"`
				Email         string `json:"email"`
				Name          string `json:"name"`
			}
			if err := c.ShouldBindJSON(&req); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
				return
			}

			role := "user"
			appleEmail := strings.ToLower(strings.TrimSpace(req.Email))
			if appleEmail == "" {
				appleEmail = req.UserID + "@apple.id"
			}
			userName := req.Name
			if userName == "" {
				userName = "مستخدم Apple"
			}

			rawJSON, _ := json.Marshal(req)
			var dbUserID, dbRole string
			var isActive bool

			upsertAppleUserQuery := `
				INSERT INTO public.users (
					apple_id, email, email_verified, name, provider, role, raw_profile, last_login_at, updated_at
				) VALUES (
					$1, $2, true, $3, 'apple', $4, $5, NOW(), NOW()
				)
				ON CONFLICT (email) DO UPDATE SET
					apple_id = COALESCE(EXCLUDED.apple_id, public.users.apple_id),
					name = CASE WHEN EXCLUDED.name <> 'مستخدم Apple' THEN EXCLUDED.name ELSE public.users.name END,
					raw_profile = EXCLUDED.raw_profile,
					last_login_at = NOW(),
					updated_at = NOW()
				RETURNING id, role, is_active;
			`
			err := router.Pool().QueryRow(
				c.Request.Context(),
				upsertAppleUserQuery,
				req.UserID,
				appleEmail,
				userName,
				role,
				rawJSON,
			).Scan(&dbUserID, &dbRole, &isActive)

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

			var pharmacyID, tenantID, pharmaCode string
			_ = router.Pool().QueryRow(
				c.Request.Context(),
				`SELECT id, tenant_id, code FROM public.pharmacies WHERE linked_user_id = $1 OR linked_user_id = $2 LIMIT 1`,
				dbUserID, req.UserID,
			).Scan(&pharmacyID, &tenantID, &pharmaCode)

			token, err := tokenService.GenerateToken(auth.Claims{
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
				"success": true,
				"token":   token,
				"user": gin.H{
					"id":          dbUserID,
					"email":       appleEmail,
					"name":        userName,
					"role":        dbRole,
					"provider":    "apple",
					"tenant_id":   tenantID,
					"pharmacy_id": pharmacyID,
				},
				"role": dbRole,
			})
		})
	}

	srv := &http.Server{
		Addr:    ":" + port,
		Handler: r,
	}

	go func() {
		log.Printf("[xpharma] Server listening on port :%s", port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("[xpharma] Listen error: %s\n", err)
		}
	}()

	// Graceful Shutdown
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	log.Println("[xpharma] Shutting down server...")

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := srv.Shutdown(ctx); err != nil {
		log.Fatal("[xpharma] Server forced to shutdown:", err)
	}
	log.Println("[xpharma] Server exiting")
}
