package s3

import (
	"bytes"
	"io"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/GravSpace/GravSpace/internal/auth"
	"github.com/GravSpace/GravSpace/internal/database"
	"github.com/GravSpace/GravSpace/internal/storage"
	"github.com/gin-gonic/gin"
)

func setupTestS3App(t *testing.T) (*AdminHandler, *gin.Engine, *storage.FileStorage, *auth.UserManager, *database.Database) {
	gin.SetMode(gin.TestMode)

	root := t.TempDir()
	dbPath := filepath.Join(root, "test.db")
	db, err := database.NewDatabase(dbPath)
	if err != nil {
		t.Fatalf("Failed to initialize database: %v", err)
	}

	dataPath := filepath.Join(root, "data")
	store, err := storage.NewFileStorage(dataPath, db)
	if err != nil {
		t.Fatalf("Failed to initialize storage: %v", err)
	}

	um, err := auth.NewUserManager(db)
	if err != nil {
		t.Fatalf("Failed to initialize user manager: %v", err)
	}
	if err := um.Initialize(); err != nil {
		t.Fatalf("Failed to initialize users: %v", err)
	}

	adminHandler := &AdminHandler{
		UserManager: um,
		Storage:     store,
		S3Port:      "9000",
	}

	s3Handler := &S3Handler{Storage: store}

	s3App := gin.New()
	s3Group := s3App.Group("")
	s3Group.Use(auth.S3AuthMiddleware(um, nil, store))
	s3Group.GET("/:bucket/*key", s3Handler.GetObject)
	s3Group.PUT("/:bucket/*key", s3Handler.PutObject)

	return adminHandler, s3App, store, um, db
}

func TestPresignedURL_SpecialCharacters(t *testing.T) {
	adminHandler, s3App, store, _, _ := setupTestS3App(t)

	bucket := "test-bucket"
	if err := store.CreateBucket(bucket); err != nil {
		t.Fatalf("Failed to create bucket: %v", err)
	}

	key := "docs/my file (1) & test.txt"
	content := []byte("Special character content")
	_, err := store.PutObject(bucket, key, bytes.NewReader(content), "")
	if err != nil {
		t.Fatalf("Failed to put object: %v", err)
	}

	presignedURL, err := adminHandler.GeneratePresignedURL(bucket, key, "", time.Hour, "", false)
	if err != nil {
		t.Fatalf("Failed to generate presigned URL: %v", err)
	}
	t.Logf("Generated presigned URL: %s", presignedURL)

	req, err := http.NewRequest("GET", presignedURL, nil)
	if err != nil {
		t.Fatalf("Failed to create request: %v", err)
	}

	w := httptest.NewRecorder()
	s3App.ServeHTTP(w, req)

	t.Logf("Response status: %d, body: %s", w.Code, w.Body.String())
	if w.Code != http.StatusOK {
		t.Fatalf("Expected 200 OK for special characters, got %d: %s", w.Code, w.Body.String())
	}
}

func TestPresignedURL_Expired(t *testing.T) {
	adminHandler, s3App, store, _, _ := setupTestS3App(t)

	bucket := "test-bucket"
	if err := store.CreateBucket(bucket); err != nil {
		t.Fatalf("Failed to create bucket: %v", err)
	}

	key := "test.txt"
	_, err := store.PutObject(bucket, key, bytes.NewReader([]byte("data")), "")
	if err != nil {
		t.Fatalf("Failed to put object: %v", err)
	}

	// Generate with 1 second expiry
	presignedURL, err := adminHandler.GeneratePresignedURL(bucket, key, "", 1*time.Second, "", false)
	if err != nil {
		t.Fatalf("Failed to generate presigned URL: %v", err)
	}

	// Sleep 2 seconds so it expires
	time.Sleep(2 * time.Second)

	req, err := http.NewRequest("GET", presignedURL, nil)
	if err != nil {
		t.Fatalf("Failed to create request: %v", err)
	}

	w := httptest.NewRecorder()
	s3App.ServeHTTP(w, req)

	t.Logf("Expired response status: %d, body: %s", w.Code, w.Body.String())
	if w.Code == http.StatusOK {
		t.Fatalf("Expected expired presigned URL to be rejected, but got 200 OK!")
	}
	if !strings.Contains(w.Body.String(), "RequestExpired") && !strings.Contains(w.Body.String(), "AccessDenied") {
		t.Fatalf("Expected RequestExpired or AccessDenied, got %s", w.Body.String())
	}
}

func TestPresignedURL_Revoked(t *testing.T) {
	adminHandler, s3App, store, _, db := setupTestS3App(t)

	bucket := "test-bucket"
	if err := store.CreateBucket(bucket); err != nil {
		t.Fatalf("Failed to create bucket: %v", err)
	}

	key := "test.txt"
	_, err := store.PutObject(bucket, key, bytes.NewReader([]byte("data")), "")
	if err != nil {
		t.Fatalf("Failed to put object: %v", err)
	}

	presignedURL, err := adminHandler.GeneratePresignedURL(bucket, key, "", time.Hour, "", false)
	if err != nil {
		t.Fatalf("Failed to generate presigned URL: %v", err)
	}

	// Extract signature
	req, _ := http.NewRequest("GET", presignedURL, nil)
	sig := req.URL.Query().Get("X-Amz-Signature")
	if sig == "" {
		t.Fatalf("Missing signature in presigned URL")
	}

	// Save to DB and revoke
	row := &database.PresignedURLRow{
		Bucket:    bucket,
		Key:       key,
		URL:       presignedURL,
		Signature: sig,
		ExpiresAt: time.Now().Add(time.Hour),
	}
	if err := db.CreatePresignedURL(row); err != nil {
		t.Fatalf("Failed to create presigned URL row: %v", err)
	}

	// Revoke signature
	if err := db.RevokeSignature(sig); err != nil {
		t.Fatalf("Failed to revoke signature: %v", err)
	}

	w := httptest.NewRecorder()
	s3App.ServeHTTP(w, req)

	t.Logf("Revoked response status: %d, body: %s", w.Code, w.Body.String())
	if w.Code == http.StatusOK {
		t.Fatalf("Expected revoked presigned URL to be rejected, but got 200 OK!")
	}
}

func TestPresignedURL_RevokedByID(t *testing.T) {
	adminHandler, s3App, store, _, db := setupTestS3App(t)

	bucket := "test-bucket"
	if err := store.CreateBucket(bucket); err != nil {
		t.Fatalf("Failed to create bucket: %v", err)
	}

	key := "test-revoke-id.txt"
	_, err := store.PutObject(bucket, key, bytes.NewReader([]byte("data")), "")
	if err != nil {
		t.Fatalf("Failed to put object: %v", err)
	}

	presignedURL, err := adminHandler.GeneratePresignedURL(bucket, key, "", time.Hour, "", false)
	if err != nil {
		t.Fatalf("Failed to generate presigned URL: %v", err)
	}

	req, _ := http.NewRequest("GET", presignedURL, nil)
	sig := req.URL.Query().Get("X-Amz-Signature")

	row := &database.PresignedURLRow{
		Bucket:    bucket,
		Key:       key,
		URL:       presignedURL,
		Signature: sig,
		Method:    "GET",
		ExpiresAt: time.Now().Add(time.Hour),
	}
	if err := db.CreatePresignedURL(row); err != nil {
		t.Fatalf("Failed to create presigned URL row: %v", err)
	}

	urls, err := db.ListPresignedURLs()
	if err != nil || len(urls) == 0 {
		t.Fatalf("Failed to list presigned URLs: %v", err)
	}
	targetID := urls[0].ID

	// Revoke via ID
	if err := db.RevokePresignedURLByID(targetID); err != nil {
		t.Fatalf("Failed to revoke by ID: %v", err)
	}

	w := httptest.NewRecorder()
	s3App.ServeHTTP(w, req)

	if w.Code == http.StatusOK {
		t.Fatalf("Expected revoked URL (by ID) to be rejected, but got 200 OK")
	}
}

func TestPresignedURL_PUT(t *testing.T) {
	adminHandler, s3App, store, _, _ := setupTestS3App(t)

	bucket := "test-bucket"
	if err := store.CreateBucket(bucket); err != nil {
		t.Fatalf("Failed to create bucket: %v", err)
	}

	key := "uploaded/via-presigned.txt"
	presignedURL, err := adminHandler.GeneratePresignedURLWithMethod("PUT", bucket, key, "", time.Hour, "", false)
	if err != nil {
		t.Fatalf("Failed to generate PUT presigned URL: %v", err)
	}

	uploadContent := []byte("Presigned PUT content body")
	req, err := http.NewRequest("PUT", presignedURL, bytes.NewReader(uploadContent))
	if err != nil {
		t.Fatalf("Failed to create PUT request: %v", err)
	}

	w := httptest.NewRecorder()
	s3App.ServeHTTP(w, req)

	t.Logf("PUT response status: %d, body: %s", w.Code, w.Body.String())
	if w.Code != http.StatusOK && w.Code != http.StatusCreated {
		t.Fatalf("Expected 200/201 on presigned PUT, got %d: %s", w.Code, w.Body.String())
	}

	// Verify object exists in storage
	reader, _, err := store.GetObject(bucket, key, "")
	if err != nil {
		t.Fatalf("Uploaded object not found in storage: %v", err)
	}
	defer reader.Close()
	readBytes, err := io.ReadAll(reader)
	if err != nil {
		t.Fatalf("Failed to read uploaded object: %v", err)
	}
	if !bytes.Equal(readBytes, uploadContent) {
		t.Errorf("Expected content %q, got %q", string(uploadContent), string(readBytes))
	}
}

func TestPresignedURL_HostFallback(t *testing.T) {
	adminHandler, s3App, store, _, _ := setupTestS3App(t)

	bucket := "test-bucket"
	if err := store.CreateBucket(bucket); err != nil {
		t.Fatalf("Failed to create bucket: %v", err)
	}

	key := "test-host.txt"
	_, err := store.PutObject(bucket, key, bytes.NewReader([]byte("host test")), "")
	if err != nil {
		t.Fatalf("Failed to put object: %v", err)
	}

	// Signed with localhost:9000
	presignedURL, err := adminHandler.GeneratePresignedURL(bucket, key, "", time.Hour, "", false)
	if err != nil {
		t.Fatalf("Failed to generate presigned URL: %v", err)
	}

	// Accessed with Host: 127.0.0.1:9000
	req, err := http.NewRequest("GET", presignedURL, nil)
	if err != nil {
		t.Fatalf("Failed to create request: %v", err)
	}
	req.Host = "127.0.0.1:9000"

	w := httptest.NewRecorder()
	s3App.ServeHTTP(w, req)

	t.Logf("Host fallback response status: %d", w.Code)
	if w.Code != http.StatusOK {
		t.Fatalf("Expected 200 OK with host fallback, got %d: %s", w.Code, w.Body.String())
	}
}
