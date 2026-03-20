package main

import (
	"flag"
	"fmt"
	"log"
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
	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/gofiber/fiber/v2/middleware/logger"
	"github.com/gofiber/fiber/v2/middleware/recover"
	"github.com/golang-jwt/jwt"
	"github.com/joho/godotenv"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	"github.com/valyala/fasthttp/fasthttpadaptor"
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

	// Initialize Apps
	adminApp := fiber.New(fiber.Config{
		DisableStartupMessage: true,
		AppName:               "GravSpace Admin API",
		StrictRouting:         true,
		CaseSensitive:         true,
	})
	s3App := fiber.New(fiber.Config{
		DisableStartupMessage: true,
		AppName:               "GravSpace S3 API",
		StrictRouting:         true,
		CaseSensitive:         true,
	})

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
		// Use 9001 as default to avoid conflict with PHP-FPM (9000)
		s3Port = "9000"
	}

	// Middleware config
	corsOrigins := os.Getenv("CORS_ORIGINS")
	allowedOrigins := "*"
	if corsOrigins != "" {
		allowedOrigins = corsOrigins
	}

	corsConfig := cors.Config{
		AllowOrigins:     allowedOrigins,
		AllowHeaders:     "Origin, Content-Type, Accept, Authorization, x-amz-date, x-amz-content-sha256, x-amz-server-side-encryption",
		AllowMethods:     "GET, HEAD, PUT, POST, DELETE, OPTIONS",
		ExposeHeaders:    "x-amz-version-id, x-amz-server-side-encryption, ETag, Content-Length, Last-Modified",
		AllowCredentials: true,
	}

	// Apply global middleware to both
	adminApp.Use(recover.New())
	adminApp.Use(logger.New())
	adminApp.Use(cors.New(corsConfig))

	s3App.Use(recover.New())
	s3App.Use(logger.New())
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
	adminApp.Get("/health/live", healthChecker.LivenessHandler)
	adminApp.Get("/health/ready", healthChecker.ReadinessHandler)
	adminApp.Get("/health/startup", healthChecker.StartupHandler)

	// Metrics endpoint (no auth required)
	adminApp.Get("/metrics", func(c *fiber.Ctx) error {
		handler := fasthttpadaptor.NewFastHTTPHandler(promhttp.Handler())
		handler(c.Context())
		return nil
	})

	// Start metrics updater
	metrics.StartMetricsUpdater()

	// Auth Routes
	adminApp.Post("/login", func(c *fiber.Ctx) error {
		var login struct {
			Username string `json:"username"`
			Password string `json:"password"`
		}
		if err := c.BodyParser(&login); err != nil {
			return err
		}

		user, err := um.Authenticate(login.Username, login.Password)
		if err != nil {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Unauthorized"})
		}

		// Create token
		token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
			"username": user.Username,
			"exp":      time.Now().Add(time.Hour * 72).Unix(),
		})

		t, err := token.SignedString([]byte(jwtSecret))
		if err != nil {
			return err
		}

		return c.JSON(fiber.Map{
			"token":    t,
			"username": user.Username,
		})
	})

	// JWT Middleware for Admin
	jwtMid := func(c *fiber.Ctx) error {
		authHeader := c.Get("Authorization")
		if authHeader == "" {
			authHeader = c.Query("token")
		}
		if authHeader == "" {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Missing token"})
		}

		tokenString := strings.TrimPrefix(authHeader, "Bearer ")
		token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
			return []byte(jwtSecret), nil
		})

		if err != nil || !token.Valid {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Invalid token"})
		}

		c.Locals("user", token)
		return c.Next()
	}

	// Admin Routes
	admin := adminApp.Group("/admin", jwtMid)

	// General Admin Routes
	admin.Post("/auth/verify", adminHandler.VerifyAdminPassword)
	admin.Get("/buckets", adminHandler.ListBuckets)
	admin.Put("/buckets/:bucket", adminHandler.CreateBucket)
	admin.Delete("/buckets/:bucket", adminHandler.DeleteBucket)
	admin.Get("/buckets/:bucket/info", adminHandler.GetBucketInfo)
	admin.Put("/buckets/:bucket/versioning", adminHandler.SetBucketVersioning)
	admin.Put("/buckets/:bucket/object-lock", adminHandler.SetBucketObjectLock)
	admin.Put("/buckets/:bucket/retention", adminHandler.SetObjectRetention)
	admin.Put("/buckets/:bucket/retention/default", adminHandler.SetBucketDefaultRetention)
	admin.Put("/buckets/:bucket/quota", adminHandler.SetBucketQuota)
	admin.Put("/buckets/:bucket/legal-hold", adminHandler.SetObjectLegalHold)
	admin.Get("/buckets/:bucket/objects", adminHandler.ListObjects)
	admin.Get("/buckets/:bucket/objects/*", adminHandler.GetObject)
	admin.Get("/buckets/:bucket/download/*", adminHandler.DownloadObject)
	admin.Put("/buckets/:bucket/objects/*", adminHandler.PutObject)
	admin.Delete("/buckets/:bucket/objects/*", adminHandler.DeleteObject)
	admin.Post("/buckets/:bucket/objects/share", adminHandler.ShareObject)
	admin.Get("/buckets/:bucket/tags/*", adminHandler.GetObjectTagging)
	admin.Put("/buckets/:bucket/tags/*", adminHandler.PutObjectTagging)
	admin.Get("/buckets/:bucket/webhooks", adminHandler.ListWebhooks)
	admin.Post("/buckets/:bucket/webhooks", adminHandler.CreateWebhook)
	admin.Delete("/buckets/:bucket/webhooks/:id", adminHandler.DeleteWebhook)
	admin.Get("/buckets/:bucket/website", adminHandler.GetBucketWebsite)
	admin.Put("/buckets/:bucket/website", adminHandler.SetBucketWebsite)
	admin.Delete("/buckets/:bucket/website", adminHandler.DeleteBucketWebsite)
	admin.Put("/buckets/:bucket/soft-delete", adminHandler.SetBucketSoftDelete)
	admin.Get("/trash", adminHandler.ListTrash)
	admin.Post("/trash/restore", adminHandler.RestoreObject)
	admin.Post("/trash/restore-bulk", adminHandler.BulkRestoreObjects)
	admin.Delete("/trash", adminHandler.DeleteTrashObject)
	admin.Delete("/trash-bulk", adminHandler.BulkDeleteTrashObjects)
	admin.Delete("/trash/empty", adminHandler.EmptyTrash)

	// Restricted Admin Routes (IAM & System)
	iam := admin.Group("", auth.AdminOnlyMiddleware)

	iam.Get("/stats", adminHandler.GetSystemStats)
	iam.Get("/audit-logs", adminHandler.GetAuditLogs)
	iam.Get("/analytics/storage", adminHandler.GetStorageAnalytics)
	iam.Get("/analytics/requests", adminHandler.GetActionAnalytics)
	iam.Get("/settings", adminHandler.GetSystemSettings)
	iam.Post("/settings", adminHandler.UpdateSystemSettings)
	iam.Get("/users", adminHandler.ListUsers)
	iam.Post("/users", adminHandler.CreateUser)
	iam.Delete("/users/:username", adminHandler.DeleteUser)
	iam.Post("/users/:username/password", adminHandler.UpdatePassword)
	iam.Post("/users/:username/keys", adminHandler.GenerateKey)
	iam.Delete("/users/:username/keys/:id", adminHandler.DeleteKey)
	iam.Post("/users/:username/policies", adminHandler.AddPolicy)
	iam.Post("/users/:username/policies/attach", adminHandler.AttachPolicyTemplate)
	iam.Delete("/users/:username/policies/:name", adminHandler.RemovePolicy)
	iam.Get("/presign", adminHandler.GeneratePresignURL)

	iam.Get("/policies", adminHandler.ListPolicies)
	iam.Post("/policies", adminHandler.CreatePolicy)
	iam.Delete("/policies/:name", adminHandler.DeletePolicy)

	// S3 API Routes (Protected)
	s3Group := s3App.Group("")
	s3Group.Use(auth.S3AuthMiddleware(um, auditLogger, store))

	// List Buckets
	s3Group.Get("/", s3Handler.ListBuckets)

	// Bucket operations
	s3Group.Head("/:bucket", s3Handler.HeadBucket)
	s3Group.Put("/:bucket", s3Handler.PutBucket)
	s3Group.Delete("/:bucket", s3Handler.DeleteBucket)
	s3Group.Get("/:bucket", s3Handler.ListObjects)
	s3Group.Post("/:bucket", s3Handler.PostBucket)

	// Object operations
	s3Group.Head("/:bucket/*", s3Handler.HeadObject)
	s3Group.Get("/:bucket/*", s3Handler.GetObject)
	s3Group.Put("/:bucket/*", s3Handler.PutObject)
	s3Group.Post("/:bucket/*", s3Handler.PostObject)
	s3Group.Delete("/:bucket/*", s3Handler.DeleteObject)

	// Website Static Hosting (Public access handled within handler)
	s3App.Get("/website/:bucket/*", s3Handler.ServeWebsite)
	s3App.Get("/website/:bucket", s3Handler.ServeWebsite)

	// Start both servers
	go func() {
		log.Printf("Starting Admin API on :%s", adminPort)
		if err := adminApp.Listen(":" + adminPort); err != nil {
			log.Fatalf("Admin API failed: %v", err)
		}
	}()

	log.Printf("Starting S3 API on :%s", s3Port)
	if err := s3App.Listen(":" + s3Port); err != nil {
		log.Fatalf("S3 API failed: %v", err)
	}
}
