package main

import (
	"log"

	"github.com/labstack/echo/v4"
	"github.com/labstack/echo/v4/middleware"
	"github.com/rizal/storage-object/internal/auth"
	"github.com/rizal/storage-object/internal/s3"
	"github.com/rizal/storage-object/internal/storage"
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

	// S3 API Routes (Protected)
	s3 := e.Group("")
	s3.Use(auth.S3AuthMiddleware(um))

	// List Buckets
	s3.GET("/", s3Handler.ListBuckets)

	// Bucket operations
	s3.PUT("/:bucket", s3Handler.CreateBucket)
	s3.GET("/:bucket", s3Handler.ListObjects)

	// Object operations
	s3.GET("/:bucket/*", s3Handler.GetObject)
	s3.PUT("/:bucket/*", s3Handler.PutObject)

	// Start server
	e.Logger.Fatal(e.Start(":8080"))
}
