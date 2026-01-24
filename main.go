package main

import (
	"log"
	"net/http"
	"time"

	"github.com/GravSpace/GravSpace/internal/audit"
	"github.com/GravSpace/GravSpace/internal/auth"
	"github.com/GravSpace/GravSpace/internal/database"
	"github.com/GravSpace/GravSpace/internal/health"
	"github.com/GravSpace/GravSpace/internal/metrics"
	"github.com/GravSpace/GravSpace/internal/s3"
	"github.com/GravSpace/GravSpace/internal/storage"
	"github.com/golang-jwt/jwt"
	"github.com/labstack/echo/v4"
	"github.com/labstack/echo/v4/middleware"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

func main() {
	e := echo.New()

	// Middleware
	e.Use(middleware.Logger())
	e.Use(middleware.Recover())
	e.Use(middleware.CORSWithConfig(middleware.CORSConfig{
		AllowOrigins:  []string{"*"},
		AllowHeaders:  []string{echo.HeaderOrigin, echo.HeaderContentType, echo.HeaderAccept, echo.HeaderAuthorization, "x-amz-date", "x-amz-content-sha256", "x-amz-server-side-encryption"},
		AllowMethods:  []string{http.MethodGet, http.MethodHead, http.MethodPut, http.MethodPost, http.MethodDelete, http.MethodOptions},
		ExposeHeaders: []string{"x-amz-version-id", "x-amz-server-side-encryption", "ETag", "Content-Length", "Last-Modified"},
	}))
	e.Use(metrics.Middleware())

	// Initialize Database
	db, err := database.NewDatabase("./data/metadata.db")
	if err != nil {
		log.Fatalf("Failed to initialize database: %v", err)
	}

	// Initialize Storage and Auth
	store, err := storage.NewFileStorage("./data", db)
	if err != nil {
		log.Fatal(err)
	}

	um, err := auth.NewUserManager(db)
	if err != nil {
		log.Fatal(err)
	}

	s3Handler := &s3.S3Handler{Storage: store}
	store.StartLifecycleWorker()
	adminHandler := &s3.AdminHandler{UserManager: um, Storage: store}
	healthChecker := health.NewHealthChecker()

	// Initialize Audit Logger
	auditLogger, err := audit.NewAuditLogger("./data/audit.log")
	if err != nil {
		log.Printf("Warning: Failed to initialize audit logger: %v", err)
		auditLogger = nil // Continue without audit logging
	}
	if auditLogger != nil {
		defer auditLogger.Close()
	}

	// Health Check Routes (no auth required)
	e.GET("/health/live", healthChecker.LivenessHandler)
	e.GET("/health/ready", healthChecker.ReadinessHandler)
	e.GET("/health/startup", healthChecker.StartupHandler)

	// Metrics endpoint (no auth required)
	e.GET("/metrics", echo.WrapHandler(promhttp.Handler()))

	// Start metrics updater
	metrics.StartMetricsUpdater()

	// Auth Routes
	e.POST("/login", func(c echo.Context) error {
		var login struct {
			Username string `json:"username"`
			Password string `json:"password"`
		}
		if err := c.Bind(&login); err != nil {
			return err
		}

		user, err := um.Authenticate(login.Username, login.Password)
		if err != nil {
			return echo.ErrUnauthorized
		}

		// Create token
		token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
			"username": user.Username,
			"exp":      time.Now().Add(time.Hour * 72).Unix(),
		})

		t, err := token.SignedString([]byte("secret")) // Use a proper secret in production
		if err != nil {
			return err
		}

		return c.JSON(http.StatusOK, echo.Map{
			"token":    t,
			"username": user.Username,
		})
	})

	// Admin Routes
	admin := e.Group("/admin")
	// Add JWT middleware here once implemented or use Echo's default
	admin.Use(middleware.JWT([]byte("secret")))

	admin.GET("/stats", adminHandler.GetSystemStats)
	admin.GET("/buckets", adminHandler.ListBuckets)
	admin.PUT("/buckets/:bucket", adminHandler.CreateBucket)
	admin.DELETE("/buckets/:bucket", adminHandler.DeleteBucket)
	admin.GET("/buckets/:bucket/info", adminHandler.GetBucketInfo)
	admin.PUT("/buckets/:bucket/versioning", adminHandler.SetBucketVersioning)
	admin.PUT("/buckets/:bucket/object-lock", adminHandler.SetBucketObjectLock)
	admin.PUT("/buckets/:bucket/retention", adminHandler.SetObjectRetention)
	admin.PUT("/buckets/:bucket/legal-hold", adminHandler.SetObjectLegalHold)
	admin.GET("/buckets/:bucket/objects", adminHandler.ListObjects)
	admin.GET("/buckets/:bucket/objects/*", adminHandler.GetObject)
	admin.GET("/buckets/:bucket/download/*", adminHandler.DownloadObject)
	admin.PUT("/buckets/:bucket/objects/*", adminHandler.PutObject)
	admin.DELETE("/buckets/:bucket/objects/*", adminHandler.DeleteObject)
	admin.GET("/users", adminHandler.ListUsers)
	admin.POST("/users", adminHandler.CreateUser)
	admin.DELETE("/users/:username", adminHandler.DeleteUser)
	admin.POST("/users/:username/password", adminHandler.UpdatePassword)
	admin.POST("/users/:username/keys", adminHandler.GenerateKey)
	admin.DELETE("/users/:username/keys/:id", adminHandler.DeleteKey)
	admin.POST("/users/:username/policies", adminHandler.AddPolicy)
	admin.DELETE("/users/:username/policies/:name", adminHandler.RemovePolicy)
	admin.GET("/presign", adminHandler.GeneratePresignURL)

	// S3 API Routes (Protected)
	s3 := e.Group("")
	s3.Use(auth.S3AuthMiddleware(um, auditLogger))

	// List Buckets
	s3.GET("/", s3Handler.ListBuckets)

	// Bucket operations
	s3.HEAD("/:bucket", s3Handler.HeadBucket)
	s3.PUT("/:bucket", s3Handler.PutBucket)
	s3.DELETE("/:bucket", s3Handler.DeleteBucket)
	s3.GET("/:bucket", s3Handler.ListObjects)
	s3.POST("/:bucket", s3Handler.PostBucket)

	// Object operations
	s3.HEAD("/:bucket/*", s3Handler.HeadObject)
	s3.GET("/:bucket/*", s3Handler.GetObject)
	s3.PUT("/:bucket/*", s3Handler.PutObject)
	s3.POST("/:bucket/*", s3Handler.PostObject)
	s3.DELETE("/:bucket/*", s3Handler.DeleteObject)

	// Start server
	e.Logger.Fatal(e.Start(":8080"))
}
