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
	"xpharma-backend/pkg/subscription"
	"xpharma-backend/pkg/warehouse"
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

	// Initialize Domain Services (Microservices Modules)
	tokenService := auth.NewTokenService(jwtSecret)
	authHandler := auth.NewAuthHandler(router, tokenService)
	warehouseService := warehouse.NewWarehouseService(router, tokenService)
	subscriptionService := subscription.NewSubscriptionService(router)
	ingestionService := ingestion.NewIngestionService(router)
	queryService := query.NewQueryService(router)

	r := gin.Default()

	// Global CORS Middleware
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

	// 1. Health Check
	r.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"status":  "healthy",
			"service": "xpharma-backend",
			"time":    time.Now().Format(time.RFC3339),
		})
	})

	// 2. Sync Ingestion Module (Windows Agent)
	syncGroup := r.Group("/v1/sync")
	{
		syncGroup.POST("/ingest", ingestionService.HandleIngest)
	}

	// 3. Query Service Module (Mobile Pharmacy Protected Queries)
	pharmaGroup := r.Group("/v1/pharmacy")
	pharmaGroup.Use(tokenService.AuthMiddleware("pharmacist", "superadmin"))
	{
		pharmaGroup.GET("/balance", queryService.GetBalance)
		pharmaGroup.GET("/purchases", queryService.GetPurchases)
		pharmaGroup.GET("/purchases/:id", queryService.GetInvoiceDetails)
		pharmaGroup.GET("/returns", queryService.GetReturns)
		pharmaGroup.GET("/returns/:id", queryService.GetReturnDetails)
		pharmaGroup.GET("/receipts", queryService.GetReceipts)
		pharmaGroup.GET("/statement", queryService.GetStatement)
		pharmaGroup.GET("/products", queryService.GetRecentProducts)
	}

	// 4. Warehouse Module
	warehouseGroup := r.Group("/v1/warehouses")
	{
		warehouseGroup.GET("", warehouseService.GetWarehouses)
		warehouseGroup.POST("/request", warehouseService.RequestWarehouse)
	}

	// 5. Auth & Device Module
	authGroup := r.Group("/v1/auth")
	{
		authGroup.POST("/verify-pharmacy", warehouseService.VerifyPharmacy)
		authGroup.POST("/link-pharmacy", warehouseService.LinkPharmacy)
		authGroup.POST("/google", authHandler.GoogleLogin)
		authGroup.POST("/apple", authHandler.AppleLogin)
		authGroup.POST("/check-device", authHandler.CheckDevice)
		authGroup.POST("/reset-device", authHandler.ResetDevice)
	}

	// 6. Subscription Module
	subGroup := r.Group("/v1/subscription")
	{
		subGroup.GET("/status", subscriptionService.GetStatus)
		subGroup.POST("/register-pharmacy", subscriptionService.RegisterPharmacy)
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
