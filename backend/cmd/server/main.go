package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
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
		pharmaGroup.GET("/statement", queryService.GetStatement)
		pharmaGroup.GET("/products", queryService.GetRecentProducts)
	}

	// Mobile Auth / Linking
	authGroup := r.Group("/v1/auth")
	{
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

			superAdminEmail := os.Getenv("SUPER_ADMIN_EMAIL")
			if superAdminEmail == "" {
				superAdminEmail = "kerd2sy@gmail.com"
			}

			role := "user"
			if profile.Email == superAdminEmail {
				role = "superadmin"
			}

			token, err := tokenService.GenerateToken(auth.Claims{
				UserID: profile.Sub,
				Email:  profile.Email,
				Role:   role,
			}, 30*24*time.Hour)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "فشل إنشاء الجلسة"})
				return
			}

			c.JSON(http.StatusOK, gin.H{
				"success": true,
				"token":   token,
				"profile": profile,
				"role":    role,
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
