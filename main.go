package main

import (
	"log"

	"github.com/GravSpace/GravSpace/internal/auth"
	"github.com/GravSpace/GravSpace/internal/s3"
	"github.com/GravSpace/GravSpace/internal/storage"
	"github.com/labstack/echo/v4"
	"github.com/labstack/echo/v4/middleware"
)

func main() {
	e := echo.New()

	// Middleware
	e.Use(middleware.Logger())
	e.Use(middleware.Recover())
	e.Use(middleware.CORS())

	// Initialize Storage and Auth
	store, err := storage.NewFileStorage("./data")
	if err != nil {
		log.Fatal(err)
	}

	um, err := auth.NewUserManager("./data/users.json")
	if err != nil {
		log.Fatal(err)
	}

	s3Handler := &s3.S3Handler{Storage: store}
	store.StartLifecycleWorker()
	adminHandler := &s3.AdminHandler{UserManager: um}

	// Admin Routes
	admin := e.Group("/admin")
	admin.GET("/stats", adminHandler.GetSystemStats)
	admin.GET("/users", adminHandler.ListUsers)
	admin.POST("/users", adminHandler.CreateUser)
	admin.DELETE("/users/:username", adminHandler.DeleteUser)
	admin.POST("/users/:username/keys", adminHandler.GenerateKey)
	admin.POST("/users/:username/policies", adminHandler.AddPolicy)
	admin.DELETE("/users/:username/policies/:name", adminHandler.RemovePolicy)
	admin.GET("/presign", adminHandler.GeneratePresignURL)

	// S3 API Routes (Protected)
	s3 := e.Group("")
	s3.Use(auth.S3AuthMiddleware(um))

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
