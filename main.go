package main

import (
	"flag"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"

	"os"

	"github.com/GravSpace/GravSpace/internal/audit"
	"github.com/GravSpace/GravSpace/internal/auth"
	"github.com/GravSpace/GravSpace/internal/database"
	"github.com/GravSpace/GravSpace/internal/health"
	"github.com/GravSpace/GravSpace/internal/metrics"
	"github.com/GravSpace/GravSpace/internal/notifications"
	"github.com/GravSpace/GravSpace/internal/s3"
	"github.com/GravSpace/GravSpace/internal/storage"
	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt"
	"github.com/joho/godotenv"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

// Version information (set via ldflags during build)
var (
	Version   = "dev"
	BuildTime = "unknown"
	GitCommit = "unknown"
)

func main() {
	// Load .env file
	if err := godotenv.Load(); err != nil {
		log.Println("Note: .env file not found, using system environment variables")
	}

	// Parse command line flags
	versionFlag := flag.Bool("version", false, "Print version information")
	flag.BoolVar(versionFlag, "v", false, "Print version information (shorthand)")
	flag.Parse()

	// Handle version flag
	if *versionFlag {
		fmt.Printf("GravSpace v%s\n", Version)
		fmt.Printf("Build Time: %s\n", BuildTime)
		fmt.Printf("Git Commit: %s\n", GitCommit)
		fmt.Printf("Go Version: %s\n", "1.24")
		os.Exit(0)
	}

	// Initialize Apps with Gin
	gin.SetMode(gin.ReleaseMode)
	adminApp := gin.Default()
	s3App := gin.Default()

	// Log startup information
	log.Printf("Starting GravSpace v%s", Version)

	// Environment variables
	jwtSecret := os.Getenv("JWT_SECRET")
	if jwtSecret == "" {
		jwtSecret = "secret" // Fallback for dev, should be set in prod
		log.Println("Warning: JWT_SECRET not set, using default 'secret'")
	}

	adminPort := os.Getenv("ADMIN_PORT")
	if adminPort == "" {
		adminPort = "8080"
	}

	s3Port := os.Getenv("S3_PORT")
	if s3Port == "" {
		// Use 9000 as default
		s3Port = "9000"
	}

	// Middleware config
	corsOrigins := os.Getenv("CORS_ORIGINS")
	allowedOrigins := []string{"*"}
	if corsOrigins != "" {
		allowedOrigins = strings.Split(corsOrigins, ",")
	}

	corsConfig := cors.Config{
		AllowOrigins:     allowedOrigins,
		AllowHeaders:     []string{"Origin", "Content-Type", "Accept", "Authorization", "x-amz-date", "x-amz-content-sha256", "x-amz-server-side-encryption"},
		AllowMethods:     []string{"GET", "HEAD", "PUT", "POST", "DELETE", "OPTIONS"},
		ExposeHeaders:    []string{"x-amz-version-id", "x-amz-server-side-encryption", "ETag", "Content-Length", "Last-Modified"},
		AllowCredentials: true,
		MaxAge:           12 * time.Hour,
	}

	// Apply Gin middleware
	adminApp.Use(gin.Recovery())
	adminApp.Use(gin.Logger())
	adminApp.Use(cors.New(corsConfig))

	s3App.Use(gin.Recovery())
	s3App.Use(gin.Logger())
	s3App.Use(cors.New(corsConfig))

	// Initialize Database
	db, err := database.NewDatabase("./db/metadata.db")
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

	if err := um.Initialize(); err != nil {
		log.Printf("Warning: Failed to initialize users: %v", err)
	}

	// Initialize Notifications Dispatcher
	dispatcher := notifications.NewDispatcher(db, 5)
	dispatcher.Start()
	store.Notifications = dispatcher

	s3Handler := &s3.S3Handler{Storage: store}
	adminHandler := &s3.AdminHandler{UserManager: um, Storage: store, S3Port: s3Port}
	healthChecker := health.NewHealthChecker()

	// Start Background Workers in a goroutine
	go func() {
		// Small delay to allow listeners to start first
		time.Sleep(1 * time.Second)

		log.Println("Initializing Background Workers...")

		// Filesystem Sync
		if store.SyncWorker != nil {
			store.SyncWorker.Start()
		}

		// Lifecycle Management
		store.StartLifecycleWorker()

		// Analytics
		analyticsWorker := storage.NewAnalyticsWorker(db, store, store.Jobs)
		analyticsWorker.Start()

		// Trash Cleanup
		trashWorker := storage.NewTrashWorker(db, store)
		trashWorker.Start()
	}()

	// Initialize Audit Logger
	auditLogger, err := audit.NewAuditLogger("./logs/audit.log", db)
	if err != nil {
		log.Printf("Warning: Failed to initialize audit logger: %v", err)
		auditLogger = nil // Continue without audit logging
	}
	if auditLogger != nil {
		defer auditLogger.Close()
	}

	// Health Check Routes (no auth required)
	adminApp.GET("/health/live", healthChecker.LivenessHandler)
	adminApp.GET("/health/ready", healthChecker.ReadinessHandler)
	adminApp.GET("/health/startup", healthChecker.StartupHandler)

	// Metrics endpoint (no auth required)
	adminApp.GET("/metrics", gin.WrapH(promhttp.Handler()))

	// Start metrics updater
	metrics.StartMetricsUpdater()

	// Auth Routes
	adminApp.POST("/login", func(c *gin.Context) {
		var login struct {
			Username string `json:"username"`
			Password string `json:"password"`
		}
		if err := c.ShouldBindJSON(&login); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		user, err := um.Authenticate(login.Username, login.Password)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
			return
		}

		// Create token
		token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
			"username": user.Username,
			"exp":      time.Now().Add(time.Hour * 72).Unix(),
		})

		t, err := token.SignedString([]byte(jwtSecret))
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"token":    t,
			"username": user.Username,
		})
	})

	// JWT Middleware for Admin
	jwtMid := func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			authHeader = c.Query("token")
		}
		if authHeader == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Missing token"})
			c.Abort()
			return
		}

		tokenString := strings.TrimPrefix(authHeader, "Bearer ")
		token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
			return []byte(jwtSecret), nil
		})

		if err != nil || !token.Valid {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid token"})
			c.Abort()
			return
		}

		c.Set("user", token)
		c.Next()
	}

	// Admin Routes
	admin := adminApp.Group("/admin", jwtMid)

	// General Admin Routes
	admin.POST("/auth/verify", adminHandler.VerifyAdminPassword)
	admin.GET("/buckets", adminHandler.ListBuckets)
	admin.PUT("/buckets/:bucket", adminHandler.CreateBucket)
	admin.DELETE("/buckets/:bucket", adminHandler.DeleteBucket)
	admin.GET("/buckets/:bucket/info", adminHandler.GetBucketInfo)
	admin.PUT("/buckets/:bucket/versioning", adminHandler.SetBucketVersioning)
	admin.PUT("/buckets/:bucket/object-lock", adminHandler.SetBucketObjectLock)
	admin.PUT("/buckets/:bucket/retention", adminHandler.SetObjectRetention)
	admin.PUT("/buckets/:bucket/retention/default", adminHandler.SetBucketDefaultRetention)
	admin.PUT("/buckets/:bucket/quota", adminHandler.SetBucketQuota)
	admin.PUT("/buckets/:bucket/legal-hold", adminHandler.SetObjectLegalHold)
	admin.GET("/buckets/:bucket/objects", adminHandler.ListObjects)
	admin.GET("/buckets/:bucket/objects/*key", adminHandler.GetObject)
	admin.GET("/buckets/:bucket/download/*key", adminHandler.DownloadObject)
	admin.PUT("/buckets/:bucket/objects/*key", adminHandler.PutObject)
	admin.DELETE("/buckets/:bucket/objects/*key", adminHandler.DeleteObject)
	admin.POST("/buckets/:bucket/objects/share", adminHandler.ShareObject)
	admin.GET("/buckets/:bucket/tags/*key", adminHandler.GetObjectTagging)
	admin.PUT("/buckets/:bucket/tags/*key", adminHandler.PutObjectTagging)
	admin.GET("/buckets/:bucket/webhooks", adminHandler.ListWebhooks)
	admin.POST("/buckets/:bucket/webhooks", adminHandler.CreateWebhook)
	admin.DELETE("/buckets/:bucket/webhooks/:id", adminHandler.DeleteWebhook)
	admin.GET("/buckets/:bucket/website", adminHandler.GetBucketWebsite)
	admin.PUT("/buckets/:bucket/website", adminHandler.SetBucketWebsite)
	admin.DELETE("/buckets/:bucket/website", adminHandler.DeleteBucketWebsite)
	admin.PUT("/buckets/:bucket/soft-delete", adminHandler.SetBucketSoftDelete)
	admin.GET("/trash", adminHandler.ListTrash)
	admin.POST("/trash/restore", adminHandler.RestoreObject)
	admin.POST("/trash/restore-bulk", adminHandler.BulkRestoreObjects)
	admin.DELETE("/trash", adminHandler.DeleteTrashObject)
	admin.DELETE("/trash-bulk", adminHandler.BulkDeleteTrashObjects)
	admin.DELETE("/trash/empty", adminHandler.EmptyTrash)

	// Restricted Admin Routes (IAM & System)
	iam := admin.Group("", auth.AdminOnlyMiddleware)

	iam.GET("/stats", adminHandler.GetSystemStats)
	iam.GET("/audit-logs", adminHandler.GetAuditLogs)
	iam.GET("/analytics/storage", adminHandler.GetStorageAnalytics)
	iam.GET("/analytics/requests", adminHandler.GetActionAnalytics)
	iam.GET("/settings", adminHandler.GetSystemSettings)
	iam.POST("/settings", adminHandler.UpdateSystemSettings)
	iam.GET("/users", adminHandler.ListUsers)
	iam.POST("/users", adminHandler.CreateUser)
	iam.DELETE("/users/:username", adminHandler.DeleteUser)
	iam.POST("/users/:username/password", adminHandler.UpdatePassword)
	iam.POST("/users/:username/keys", adminHandler.GenerateKey)
	iam.DELETE("/users/:username/keys/:id", adminHandler.DeleteKey)
	iam.POST("/users/:username/policies", adminHandler.AddPolicy)
	iam.POST("/users/:username/policies/attach", adminHandler.AttachPolicyTemplate)
	iam.DELETE("/users/:username/policies/:name", adminHandler.RemovePolicy)
	iam.GET("/presign", adminHandler.GeneratePresignURL)

	iam.GET("/policies", adminHandler.ListPolicies)
	iam.POST("/policies", adminHandler.CreatePolicy)
	iam.DELETE("/policies/:name", adminHandler.DeletePolicy)

	// S3 API Routes (Protected)
	s3Group := s3App.Group("")
	s3Group.Use(auth.S3AuthMiddleware(um, auditLogger, store))

	// List Buckets
	s3Group.GET("/", s3Handler.ListBuckets)

	// Bucket operations
	s3Group.HEAD("/:bucket", s3Handler.HeadBucket)
	s3Group.PUT("/:bucket", s3Handler.PutBucket)
	s3Group.DELETE("/:bucket", s3Handler.DeleteBucket)
	s3Group.GET("/:bucket", s3Handler.ListObjects)
	s3Group.POST("/:bucket", s3Handler.PostBucket)

	// Object operations
	s3Group.HEAD("/:bucket/*key", s3Handler.HeadObject)
	s3Group.GET("/:bucket/*key", s3Handler.GetObject)
	s3Group.PUT("/:bucket/*key", s3Handler.PutObject)
	s3Group.POST("/:bucket/*key", s3Handler.PostObject)
	s3Group.DELETE("/:bucket/*key", s3Handler.DeleteObject)

	// Website Static Hosting (Public access handled within handler)
	s3App.GET("/website/:bucket/*key", s3Handler.ServeWebsite)
	s3App.GET("/website/:bucket", s3Handler.ServeWebsite)

	// Start both servers
	go func() {
		log.Printf("Starting Admin API on :%s", adminPort)
		if err := adminApp.Run(":" + adminPort); err != nil {
			log.Fatalf("Admin API failed: %v", err)
		}
	}()

	log.Printf("Starting S3 API on :%s", s3Port)
	if err := s3App.Run(":" + s3Port); err != nil {
		log.Fatalf("S3 API failed: %v", err)
	}
}
