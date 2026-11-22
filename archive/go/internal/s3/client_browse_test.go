package s3

import (
	"encoding/xml"
	"fmt"
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

func setupBrowseTestS3App(t *testing.T) (*gin.Engine, *storage.FileStorage, string, string) {
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

	// Create test bucket
	if err := store.CreateBucket("browse-bucket"); err != nil {
		t.Fatalf("Failed to create test bucket: %v", err)
	}

	key := um.GenerateKey("admin")

	s3Handler := &S3Handler{Storage: store}

	s3App := gin.New()
	s3Group := s3App.Group("")
	s3Group.Use(auth.S3AuthMiddleware(um, nil, store))

	// Register routes exactly like main.go
	s3Group.GET("/", s3Handler.ListBuckets)

	s3Group.HEAD("/:bucket", s3Handler.HeadBucket)
	s3Group.PUT("/:bucket", s3Handler.PutBucket)
	s3Group.DELETE("/:bucket", s3Handler.DeleteBucket)
	s3Group.GET("/:bucket", s3Handler.ListObjects)
	s3Group.POST("/:bucket", s3Handler.PostBucket)

	s3Group.HEAD("/:bucket/*key", s3Handler.HeadObject)
	s3Group.GET("/:bucket/*key", s3Handler.GetObject)
	s3Group.PUT("/:bucket/*key", s3Handler.PutObject)
	s3Group.POST("/:bucket/*key", s3Handler.PostObject)
	s3Group.DELETE("/:bucket/*key", s3Handler.DeleteObject)

	return s3App, store, key.AccessKeyID, key.SecretAccessKey
}

func signS3Request(req *http.Request, keyID, secretKey string) {
	now := time.Now().UTC()
	dateStr := now.Format("20060102")
	amzDate := now.Format("20060102T150405Z")
	req.Header.Set("X-Amz-Date", amzDate)
	req.Header.Set("X-Amz-Content-Sha256", "UNSIGNED-PAYLOAD")
	req.Header.Set("Host", "localhost:9000")
	req.Host = "localhost:9000"

	headers := req.Header
	signedHeaders := []string{"host", "x-amz-content-sha256", "x-amz-date"}
	canonicalReq := auth.BuildCanonicalRequest(req.Method, req.URL.Path, req.URL.Query(), headers, signedHeaders, "UNSIGNED-PAYLOAD", req.Host)
	scope := dateStr + "/us-east-1/s3/aws4_request"
	stringToSign := auth.BuildStringToSign("AWS4-HMAC-SHA256", amzDate, scope, canonicalReq)
	sig := auth.CalculateSignature(secretKey, dateStr, "us-east-1", "s3", stringToSign)

	authHeader := fmt.Sprintf("AWS4-HMAC-SHA256 Credential=%s/%s, SignedHeaders=%s, Signature=%s",
		keyID, scope, strings.Join(signedHeaders, ";"), sig)
	req.Header.Set("Authorization", authHeader)
}

func TestBrowseBucket_TrailingSlash(t *testing.T) {
	app, store, keyID, secretKey := setupBrowseTestS3App(t)

	// Put an object in browse-bucket
	if _, err := store.PutObject("browse-bucket", "hello.txt", strings.NewReader("Hello world"), ""); err != nil {
		t.Fatalf("Failed to put test object: %v", err)
	}

	// Test 1: GET /browse-bucket/ (with trailing slash)
	req := httptest.NewRequest("GET", "/browse-bucket/", nil)
	signS3Request(req, keyID, secretKey)
	w := httptest.NewRecorder()
	app.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("Expected 200 OK for GET /browse-bucket/, got %d: %s", w.Code, w.Body.String())
	}

	var res ListBucketResult
	if err := xml.Unmarshal(w.Body.Bytes(), &res); err != nil {
		t.Fatalf("Failed to unmarshal XML response: %v, body: %s", err, w.Body.String())
	}
	if res.Name != "browse-bucket" {
		t.Errorf("Expected bucket name 'browse-bucket', got '%s'", res.Name)
	}
	if len(res.Contents) != 1 || res.Contents[0].Key != "hello.txt" {
		t.Errorf("Expected 1 object with key 'hello.txt', got %+v", res.Contents)
	}

	// Test 2: GET /browse-bucket/?delimiter=/
	req2 := httptest.NewRequest("GET", "/browse-bucket/?delimiter=/", nil)
	signS3Request(req2, keyID, secretKey)
	w2 := httptest.NewRecorder()
	app.ServeHTTP(w2, req2)

	if w2.Code != http.StatusOK {
		t.Fatalf("Expected 200 OK for GET /browse-bucket/?delimiter=/, got %d: %s", w2.Code, w2.Body.String())
	}

	// Test 3: HEAD /browse-bucket/ (with trailing slash)
	req3 := httptest.NewRequest("HEAD", "/browse-bucket/", nil)
	signS3Request(req3, keyID, secretKey)
	w3 := httptest.NewRecorder()
	app.ServeHTTP(w3, req3)

	if w3.Code != http.StatusOK {
		t.Fatalf("Expected 200 OK for HEAD /browse-bucket/, got %d", w3.Code)
	}

	// Test 4: HEAD /browse-bucket (without trailing slash)
	req4 := httptest.NewRequest("HEAD", "/browse-bucket", nil)
	signS3Request(req4, keyID, secretKey)
	w4 := httptest.NewRecorder()
	app.ServeHTTP(w4, req4)

	if w4.Code != http.StatusOK {
		t.Fatalf("Expected 200 OK for HEAD /browse-bucket, got %d", w4.Code)
	}
}

func TestBrowseBucket_Location(t *testing.T) {
	app, _, keyID, secretKey := setupBrowseTestS3App(t)

	// Test 1: GET /browse-bucket?location
	req := httptest.NewRequest("GET", "/browse-bucket?location", nil)
	signS3Request(req, keyID, secretKey)
	w := httptest.NewRecorder()
	app.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("Expected 200 OK for ?location, got %d: %s", w.Code, w.Body.String())
	}
	var loc LocationConstraintResult
	if err := xml.Unmarshal(w.Body.Bytes(), &loc); err != nil {
		t.Fatalf("Failed to parse location XML: %v, body: %s", err, w.Body.String())
	}
	if loc.Region == "" {
		t.Errorf("Expected non-empty region in LocationConstraint, got empty")
	}

	// Test 2: GET /browse-bucket/?location (with trailing slash)
	req2 := httptest.NewRequest("GET", "/browse-bucket/?location", nil)
	signS3Request(req2, keyID, secretKey)
	w2 := httptest.NewRecorder()
	app.ServeHTTP(w2, req2)

	if w2.Code != http.StatusOK {
		t.Fatalf("Expected 200 OK for /?location, got %d: %s", w2.Code, w2.Body.String())
	}
	var loc2 LocationConstraintResult
	if err := xml.Unmarshal(w2.Body.Bytes(), &loc2); err != nil {
		t.Fatalf("Failed to parse location XML: %v, body: %s", err, w2.Body.String())
	}
	if loc2.Region == "" {
		t.Errorf("Expected non-empty region in LocationConstraint, got empty")
	}
}

func TestBrowseBucket_ACL(t *testing.T) {
	app, _, keyID, secretKey := setupBrowseTestS3App(t)

	// Test 1: GET /browse-bucket?acl
	req := httptest.NewRequest("GET", "/browse-bucket?acl", nil)
	signS3Request(req, keyID, secretKey)
	w := httptest.NewRecorder()
	app.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("Expected 200 OK for ?acl, got %d: %s", w.Code, w.Body.String())
	}
	var acl AccessControlPolicy
	if err := xml.Unmarshal(w.Body.Bytes(), &acl); err != nil {
		t.Fatalf("Failed to parse ACL XML: %v, body: %s", err, w.Body.String())
	}
	if acl.Owner.ID == "" {
		t.Errorf("Expected non-empty owner ID in ACL, got empty")
	}

	// Test 2: GET /browse-bucket/?acl (with trailing slash)
	req2 := httptest.NewRequest("GET", "/browse-bucket/?acl", nil)
	signS3Request(req2, keyID, secretKey)
	w2 := httptest.NewRecorder()
	app.ServeHTTP(w2, req2)

	if w2.Code != http.StatusOK {
		t.Fatalf("Expected 200 OK for /?acl, got %d: %s", w2.Code, w2.Body.String())
	}
	var acl2 AccessControlPolicy
	if err := xml.Unmarshal(w2.Body.Bytes(), &acl2); err != nil {
		t.Fatalf("Failed to parse ACL XML: %v, body: %s", err, w2.Body.String())
	}
	if acl2.Owner.ID == "" {
		t.Errorf("Expected non-empty owner ID in ACL, got empty")
	}
}

func TestBrowseBucket_NoSuchBucket(t *testing.T) {
	app, _, keyID, secretKey := setupBrowseTestS3App(t)

	// Test 1: GET /nonexistent-bucket
	req := httptest.NewRequest("GET", "/nonexistent-bucket", nil)
	signS3Request(req, keyID, secretKey)
	w := httptest.NewRecorder()
	app.ServeHTTP(w, req)

	if w.Code != http.StatusNotFound {
		t.Fatalf("Expected 404 Not Found for nonexistent bucket, got %d: %s", w.Code, w.Body.String())
	}
	var errRes S3Error
	if err := xml.Unmarshal(w.Body.Bytes(), &errRes); err != nil {
		t.Fatalf("Failed to parse S3Error XML: %v, body: %s", err, w.Body.String())
	}
	if errRes.Code != "NoSuchBucket" {
		t.Errorf("Expected error code 'NoSuchBucket', got '%s'", errRes.Code)
	}

	// Test 2: GET /nonexistent-bucket/ (with trailing slash)
	req2 := httptest.NewRequest("GET", "/nonexistent-bucket/", nil)
	signS3Request(req2, keyID, secretKey)
	w2 := httptest.NewRecorder()
	app.ServeHTTP(w2, req2)

	if w2.Code != http.StatusNotFound {
		t.Fatalf("Expected 404 Not Found for nonexistent bucket with slash, got %d: %s", w2.Code, w2.Body.String())
	}

	// Test 3: HEAD /nonexistent-bucket
	req3 := httptest.NewRequest("HEAD", "/nonexistent-bucket", nil)
	signS3Request(req3, keyID, secretKey)
	w3 := httptest.NewRecorder()
	app.ServeHTTP(w3, req3)

	if w3.Code != http.StatusNotFound {
		t.Fatalf("Expected 404 Not Found for HEAD nonexistent bucket, got %d", w3.Code)
	}

	// Test 4: HEAD /nonexistent-bucket/
	req4 := httptest.NewRequest("HEAD", "/nonexistent-bucket/", nil)
	signS3Request(req4, keyID, secretKey)
	w4 := httptest.NewRecorder()
	app.ServeHTTP(w4, req4)

	if w4.Code != http.StatusNotFound {
		t.Fatalf("Expected 404 Not Found for HEAD nonexistent bucket with slash, got %d", w4.Code)
	}
}

func TestBrowseBucket_ObjectOperationsStillWork(t *testing.T) {
	app, store, keyID, secretKey := setupBrowseTestS3App(t)

	// Put object
	if _, err := store.PutObject("browse-bucket", "sub/folder/data.json", strings.NewReader(`{"key":"val"}`), ""); err != nil {
		t.Fatalf("Failed to put test object: %v", err)
	}

	// GET object
	req := httptest.NewRequest("GET", "/browse-bucket/sub/folder/data.json", nil)
	signS3Request(req, keyID, secretKey)
	w := httptest.NewRecorder()
	app.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("Expected 200 OK for GET object, got %d: %s", w.Code, w.Body.String())
	}
	body, _ := io.ReadAll(w.Body)
	if string(body) != `{"key":"val"}` {
		t.Errorf("Expected content '{\"key\":\"val\"}', got '%s'", string(body))
	}
	lastModified := w.Header().Get("Last-Modified")
	if _, err := time.Parse(http.TimeFormat, lastModified); err != nil {
		t.Errorf("Last-Modified format in GET object is invalid: %s (err: %v)", lastModified, err)
	}

	// HEAD object
	req2 := httptest.NewRequest("HEAD", "/browse-bucket/sub/folder/data.json", nil)
	signS3Request(req2, keyID, secretKey)
	w2 := httptest.NewRecorder()
	app.ServeHTTP(w2, req2)

	if w2.Code != http.StatusOK {
		t.Fatalf("Expected 200 OK for HEAD object, got %d", w2.Code)
	}
	if w2.Header().Get("Content-Length") == "" {
		t.Errorf("Expected non-empty Content-Length header")
	}
	lastModifiedHead := w2.Header().Get("Last-Modified")
	if _, err := time.Parse(http.TimeFormat, lastModifiedHead); err != nil {
		t.Errorf("Last-Modified format in HEAD object is invalid: %s (err: %v)", lastModifiedHead, err)
	}
}
