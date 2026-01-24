package storage

import (
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/GravSpace/GravSpace/internal/cache"
	"github.com/GravSpace/GravSpace/internal/crypto"
	"github.com/GravSpace/GravSpace/internal/database"
	"github.com/GravSpace/GravSpace/internal/metrics"
)

// Object represents a stored object version
type Object struct {
	Key             string
	VersionID       string
	Size            int64
	IsLatest        bool
	ModTime         time.Time
	EncryptionType  string
	RetainUntilDate *time.Time
	LegalHold       bool
	LockMode        string
}

// CORSConfiguration represents the S3 CORS configuration
type CORSConfiguration struct {
	CORSRules []CORSRule `json:"cors_rules"`
}

// CORSRule represents a single CORS rule
type CORSRule struct {
	AllowedOrigins []string `json:"allowed_origins"`
	AllowedMethods []string `json:"allowed_methods"`
	AllowedHeaders []string `json:"allowed_headers"`
	MaxAgeSeconds  int      `json:"max_age_seconds"`
	ExposeHeaders  []string `json:"expose_headers"`
}

// LifecycleConfiguration represents S3 Lifecycle configuration
type LifecycleConfiguration struct {
	Rules []LifecycleRule `json:"rules"`
}

// LifecycleRule represents a single lifecycle rule
type LifecycleRule struct {
	ID         string            `json:"id"`
	Status     string            `json:"status"` // "Enabled" or "Disabled"
	Filter     LifecycleFilter   `json:"filter"`
	Expiration ElementExpiration `json:"expiration"`
}

type LifecycleFilter struct {
	Prefix string `json:"prefix"`
}

type ElementExpiration struct {
	Days int `json:"days"`
}

// Part represents a part of a multipart upload
type Part struct {
	PartNumber int
	ETag       string
	Size       int64
}

// Storage defines the interface for object storage
type Storage interface {
	CreateBucket(name string) error
	BucketExists(name string) (bool, error)
	ListBuckets() ([]string, error)
	DeleteBucket(name string) error
	GetBucketInfo(name string) (*database.BucketRow, error)
	SetBucketVersioning(name string, enabled bool) error
	SetBucketObjectLock(name string, enabled bool) error
	PutObject(bucket, key string, reader io.Reader, encryptionType string) (string, error)
	GetObject(bucket, key, versionID string) (io.ReadCloser, string, error)
	StatObject(bucket, key, versionID string) (*Object, error)
	DeleteObject(bucket, key, versionID string) error
	ListObjects(bucket, prefix, delimiter string) ([]Object, []string, error)
	ListVersions(bucket, key string) ([]Object, error)
	SetObjectRetention(bucket, key, versionID string, retainUntil time.Time, mode string) error
	SetObjectLegalHold(bucket, key, versionID string, hold bool) error

	// Multipart Upload
	InitiateMultipartUpload(bucket, key string) (string, error)
	UploadPart(bucket, key, uploadID string, partNumber int, reader io.Reader) (string, error)
	CompleteMultipartUpload(bucket, key, uploadID string, parts []Part) (string, error)
	AbortMultipartUpload(bucket, key, uploadID string) error

	// Tagging
	PutObjectTagging(bucket, key, versionID string, tags map[string]string) error
	GetObjectTagging(bucket, key, versionID string) (map[string]string, error)

	// CORS
	PutBucketCors(bucket string, cors CORSConfiguration) error
	GetBucketCors(bucket string) (*CORSConfiguration, error)
	DeleteBucketCors(bucket string) error

	// Lifecycle
	PutBucketLifecycle(bucket string, lifecycle LifecycleConfiguration) error
	GetBucketLifecycle(bucket string) (*LifecycleConfiguration, error)
	DeleteBucketLifecycle(bucket string) error
	StartLifecycleWorker()
}

// FileStorage implements Storage using the local filesystem
type FileStorage struct {
	Root       string
	DB         *database.Database
	Cache      cache.Cache
	SyncWorker *SyncWorker
}

func NewFileStorage(root string, db *database.Database) (*FileStorage, error) {
	if err := os.MkdirAll(root, 0755); err != nil {
		return nil, err
	}

	// Initialize cache
	c := cache.NewInMemoryCache()

	// Create storage instance
	s := &FileStorage{
		Root:  root,
		DB:    db,
		Cache: c,
	}

	// Initialize and start sync worker (every 5 minutes by default)
	syncInterval := 5 * time.Minute
	if intervalEnv := os.Getenv("SYNC_WORKER_INTERVAL"); intervalEnv != "" {
		if minutes, err := strconv.Atoi(intervalEnv); err == nil {
			syncInterval = time.Duration(minutes) * time.Minute
		}
	}
	s.SyncWorker = NewSyncWorker(s, syncInterval)
	s.SyncWorker.Start()
	fmt.Printf("Starting filesystem sync worker with interval: %v\n", syncInterval)

	return s, nil
}

func (s *FileStorage) CreateBucket(name string) error {
	if err := os.MkdirAll(filepath.Join(s.Root, name), 0755); err != nil {
		return err
	}

	// Create in database
	if s.DB != nil {
		s.DB.CreateBucket(name, "admin")
		metrics.BucketsTotal.Inc()
	}

	// Invalidate bucket list cache
	s.Cache.Delete(cache.BucketListKey())

	return nil
}

func (s *FileStorage) BucketExists(name string) (bool, error) {
	_, err := os.Stat(filepath.Join(s.Root, name))
	if err == nil {
		return true, nil
	}
	if os.IsNotExist(err) {
		return false, nil
	}
	return false, err
}

func (s *FileStorage) GetBucketInfo(name string) (*database.BucketRow, error) {
	if s.DB == nil {
		return nil, fmt.Errorf("database not available")
	}
	return s.DB.GetBucket(name)
}

func (s *FileStorage) SetBucketVersioning(name string, enabled bool) error {
	if s.DB == nil {
		return fmt.Errorf("database not available")
	}
	return s.DB.SetBucketVersioning(name, enabled)
}

func (s *FileStorage) SetBucketObjectLock(name string, enabled bool) error {
	if s.DB == nil {
		return fmt.Errorf("database not available")
	}
	return s.DB.SetBucketObjectLock(name, enabled)
}

func (s *FileStorage) SetObjectRetention(bucket, key, versionID string, retainUntil time.Time, mode string) error {
	if s.DB == nil {
		return fmt.Errorf("database not available")
	}
	return s.DB.SetObjectRetention(bucket, key, versionID, retainUntil, mode)
}

func (s *FileStorage) SetObjectLegalHold(bucket, key, versionID string, hold bool) error {
	if s.DB == nil {
		return fmt.Errorf("database not available")
	}
	return s.DB.SetObjectLegalHold(bucket, key, versionID, hold)
}

func (s *FileStorage) ListBuckets() ([]string, error) {
	// Try cache first
	if cached, ok := s.Cache.Get(cache.BucketListKey()); ok {
		metrics.RecordCacheHit("bucket_list")
		if buckets, ok := cached.([]string); ok {
			return buckets, nil
		}
	}
	metrics.RecordCacheMiss("bucket_list")

	// Try database
	if s.DB != nil {
		buckets, err := s.DB.ListBuckets()
		if err == nil {
			// Cache for 5 minutes
			s.Cache.Set(cache.BucketListKey(), buckets, 5*time.Minute)
			return buckets, nil
		}
	}

	// Fallback to filesystem
	entries, err := os.ReadDir(s.Root)
	if err != nil {
		return nil, err
	}
	var buckets []string
	for _, entry := range entries {
		if entry.IsDir() && entry.Name() != ".versions" {
			buckets = append(buckets, entry.Name())
		}
	}

	// Cache the result
	s.Cache.Set(cache.BucketListKey(), buckets, 5*time.Minute)
	return buckets, nil
}

func (s *FileStorage) DeleteBucket(name string) error {
	if err := os.RemoveAll(filepath.Join(s.Root, name)); err != nil {
		return err
	}

	// Delete from database
	if s.DB != nil {
		s.DB.DeleteBucket(name)
		metrics.BucketsTotal.Dec()
	}

	// Invalidate caches
	s.Cache.Delete(cache.BucketListKey())
	s.Cache.Delete(cache.BucketCORSKey(name))
	s.Cache.Delete(cache.BucketLifecycleKey(name))

	return nil
}

func (s *FileStorage) PutObject(bucket, key string, reader io.Reader, encryptionType string) (string, error) {
	// If key is a folder placeholder (ends in /), just create the directory
	if strings.HasSuffix(key, "/") {
		objectDir := filepath.Join(s.Root, bucket, key)
		if err := os.MkdirAll(objectDir, 0755); err != nil {
			return "", err
		}
		return "", nil
	}

	// Check if the existing object has a lock (before overwriting)
	if s.DB != nil {
		existingObj, _ := s.DB.GetObject(bucket, key, "")
		if existingObj != nil {
			// Check for legal hold
			if existingObj.LegalHold {
				return "", fmt.Errorf("object is under legal hold and cannot be overwritten")
			}

			// Check for retention period
			if existingObj.RetainUntilDate != nil && time.Now().Before(*existingObj.RetainUntilDate) {
				return "", fmt.Errorf("object is under %s retention until %s and cannot be overwritten",
					existingObj.LockMode, existingObj.RetainUntilDate.Format(time.RFC3339))
			}
		}
	}

	// Check if versioning is enabled for this bucket
	versioningEnabled := false
	if s.DB != nil {
		bucketInfo, err := s.DB.GetBucket(bucket)
		if err == nil && bucketInfo != nil {
			versioningEnabled = bucketInfo.VersioningEnabled
		}
	}

	versionID := fmt.Sprintf("%d", time.Now().UnixNano())
	var path string
	var size int64

	if versioningEnabled {
		// Versioned storage: create directory structure
		objectDir := filepath.Join(s.Root, bucket, key)
		if err := os.MkdirAll(objectDir, 0755); err != nil {
			return "", err
		}
		path = filepath.Join(objectDir, versionID)
	} else {
		// Non-versioned storage: simple file
		objectDir := filepath.Join(s.Root, bucket, filepath.Dir(key))
		if err := os.MkdirAll(objectDir, 0755); err != nil {
			return "", err
		}
		path = filepath.Join(s.Root, bucket, key)
		versionID = "simple"
	}

	file, err := os.Create(path)
	if err != nil {
		return "", err
	}
	defer file.Close()

	// Copy data and track size
	var writeCloser io.WriteCloser = file
	var errW error
	if encryptionType == "AES256" {
		writeCloser, errW = crypto.EncryptStream(crypto.GetMasterKey(), file)
		if errW != nil {
			return "", errW
		}
	}

	size, err = io.Copy(writeCloser, reader)
	if err != nil {
		return "", err
	}
	if writeCloser != file {
		writeCloser.Close()
	}

	// Update latest pointer only for versioned storage
	if versioningEnabled {
		objectDir := filepath.Join(s.Root, bucket, key)
		err = os.WriteFile(filepath.Join(objectDir, "latest"), []byte(versionID), 0644)
		if err != nil {
			return "", err
		}
	}

	// Save metadata to database
	if s.DB != nil {
		contentType := "application/octet-stream"
		objectRow := &database.ObjectRow{
			Bucket:         bucket,
			Key:            key,
			VersionID:      versionID,
			Size:           size,
			ETag:           &versionID,
			ContentType:    &contentType,
			IsLatest:       true,
			EncryptionType: &encryptionType,
		}
		s.DB.CreateObject(objectRow)
		metrics.ObjectsTotal.WithLabelValues(bucket).Inc()
		metrics.StorageBytes.WithLabelValues(bucket).Add(float64(size))
	}

	// Invalidate object list cache for this bucket
	s.Cache.Delete(cache.ObjectListKey(bucket, ""))

	return versionID, nil
}

func (s *FileStorage) GetObject(bucket, key, versionID string) (io.ReadCloser, string, error) {
	fullPath := filepath.Join(s.Root, bucket, key)
	info, err := os.Stat(fullPath)
	if err == nil && !info.IsDir() {
		// Legacy file support: if it's a simple file, return it directly.
		reader, err := os.Open(fullPath)
		if err != nil {
			return nil, "", err
		}
		return reader, "legacy", nil
	}

	objectDir := fullPath
	if versionID == "" {
		data, err := os.ReadFile(filepath.Join(objectDir, "latest"))
		if err != nil {
			return nil, "", err
		}
		versionID = string(data)
	}

	reader, err := os.Open(filepath.Join(objectDir, versionID))
	if err != nil {
		return nil, "", err
	}

	// Check if encrypted
	if s.DB != nil {
		obj, _ := s.DB.GetObject(bucket, key, versionID)
		if obj != nil && obj.EncryptionType != nil && *obj.EncryptionType == "AES256" {
			decryptedReader, err := crypto.DecryptStream(crypto.GetMasterKey(), reader)
			if err != nil {
				reader.Close()
				return nil, "", err
			}
			return decryptedReader, versionID, nil
		}
	}

	return reader, versionID, nil
}

func (s *FileStorage) StatObject(bucket, key, versionID string) (*Object, error) {
	fullPath := filepath.Join(s.Root, bucket, key)
	info, err := os.Stat(fullPath)
	if err == nil && !info.IsDir() {
		return &Object{
			Key:       key,
			VersionID: "legacy",
			Size:      info.Size(),
			IsLatest:  true,
			ModTime:   info.ModTime(),
		}, nil
	}

	objectDir := fullPath
	if versionID == "" {
		data, err := os.ReadFile(filepath.Join(objectDir, "latest"))
		if err != nil {
			return nil, err
		}
		versionID = string(data)
	}

	path := filepath.Join(objectDir, versionID)
	info, err = os.Stat(path)
	if err != nil {
		return nil, err
	}

	encryptionType := ""
	if s.DB != nil {
		obj, _ := s.DB.GetObject(bucket, key, versionID)
		if obj != nil && obj.EncryptionType != nil {
			encryptionType = *obj.EncryptionType
		}
	}

	return &Object{
		Key:            key,
		VersionID:      versionID,
		Size:           info.Size(),
		IsLatest:       true,
		ModTime:        info.ModTime(),
		EncryptionType: encryptionType,
	}, nil
}

func (s *FileStorage) DeleteObject(bucket, key, versionID string) error {
	objectDir := filepath.Join(s.Root, bucket, key)

	// Delete from database
	if s.DB != nil {
		// Get object to check for locks before deleting
		obj, _ := s.DB.GetObject(bucket, key, versionID)
		if obj != nil {
			// Check for legal hold
			if obj.LegalHold {
				return fmt.Errorf("object is under legal hold and cannot be deleted")
			}

			// Check for retention period
			if obj.RetainUntilDate != nil && time.Now().Before(*obj.RetainUntilDate) {
				return fmt.Errorf("object is under %s retention until %s and cannot be deleted",
					obj.LockMode, obj.RetainUntilDate.Format(time.RFC3339))
			}

			metrics.ObjectsTotal.WithLabelValues(bucket).Dec()
			metrics.StorageBytes.WithLabelValues(bucket).Sub(float64(obj.Size))
		}
		s.DB.DeleteObject(bucket, key, versionID)
	}

	// Invalidate cache
	s.Cache.Delete(cache.ObjectListKey(bucket, ""))
	s.Cache.Delete(cache.ObjectMetadataKey(bucket, key, versionID))

	if versionID == "" {
		// Delete everything for this key if no version specified
		return os.RemoveAll(objectDir)
	}
	return os.Remove(filepath.Join(objectDir, versionID))
}

func (s *FileStorage) ListObjects(bucket, prefix, delimiter string) ([]Object, []string, error) {
	bucketDir := filepath.Join(s.Root, bucket)
	var objects []Object
	var commonPrefixes []string
	seenPrefixes := make(map[string]bool)

	err := filepath.Walk(bucketDir, func(path string, info os.FileInfo, err error) error {
		if err != nil || path == bucketDir {
			return err
		}

		rel, _ := filepath.Rel(bucketDir, path)

		if !info.IsDir() {
			// Check if it's a standalone file (no 'latest' in its directory)
			parent := filepath.Dir(path)
			if _, err := os.Stat(filepath.Join(parent, "latest")); err == nil {
				return nil // Versioned file, will be handled by its parent directory
			}
			if filepath.Base(path) == "latest" {
				return nil // Control file
			}

			// Filter by prefix
			if prefix != "" && !strings.HasPrefix(rel, prefix) {
				return nil
			}

			obj := Object{
				Key:       rel,
				VersionID: "legacy",
				Size:      info.Size(),
				IsLatest:  true,
				ModTime:   info.ModTime(),
			}

			if s.DB != nil {
				dbObj, _ := s.DB.GetObject(bucket, rel, "legacy")
				if dbObj != nil {
					obj.RetainUntilDate = dbObj.RetainUntilDate
					obj.LegalHold = dbObj.LegalHold
					if dbObj.LockMode != nil {
						obj.LockMode = *dbObj.LockMode
					}
					if dbObj.EncryptionType != nil {
						obj.EncryptionType = *dbObj.EncryptionType
					}
				}
			}

			objects = append(objects, obj)
			return nil
		}

		// It's a directory
		relKey := rel + "/"

		// Filter by prefix
		if prefix != "" {
			if !strings.HasPrefix(relKey, prefix) {
				if strings.HasPrefix(prefix, relKey) {
					return nil // Parent of prefix, continue walking
				}
				return filepath.SkipDir
			}
		}

		// Check if it's an object directory (contains 'latest')
		latestPath := filepath.Join(path, "latest")
		isObject := false
		if _, err := os.Stat(latestPath); err == nil {
			isObject = true
		}

		// Apply delimiter logic
		subKey := relKey[len(prefix):]
		if delimiter != "" {
			idx := strings.Index(subKey, delimiter)
			if idx != -1 {
				// We found a delimiter match.
				// If it's NOT at the very end of subKey, it's definitely a prefix to something deeper.
				// If it IS at the end, it's a prefix ONLY if it's not also an object.
				if idx < len(subKey)-len(delimiter) || !isObject {
					cp := relKey[:len(prefix)+idx+len(delimiter)]
					if !seenPrefixes[cp] {
						commonPrefixes = append(commonPrefixes, cp)
						seenPrefixes[cp] = true
					}
					return filepath.SkipDir
				}
			}
		}

		if isObject {
			data, _ := os.ReadFile(latestPath)
			vid := string(data)
			vinfo, _ := os.Stat(filepath.Join(path, vid))

			obj := Object{
				Key:       rel,
				VersionID: vid,
				Size:      vinfo.Size(),
				IsLatest:  true,
				ModTime:   vinfo.ModTime(),
			}

			if s.DB != nil {
				dbObj, _ := s.DB.GetObject(bucket, rel, vid)
				if dbObj != nil {
					obj.RetainUntilDate = dbObj.RetainUntilDate
					obj.LegalHold = dbObj.LegalHold
					if dbObj.LockMode != nil {
						obj.LockMode = *dbObj.LockMode
					}
					if dbObj.EncryptionType != nil {
						obj.EncryptionType = *dbObj.EncryptionType
					}
				}
			}

			objects = append(objects, obj)
			return filepath.SkipDir
		}

		return nil
	})
	return objects, commonPrefixes, err
}

func (s *FileStorage) ListVersions(bucket, key string) ([]Object, error) {
	fullPath := filepath.Join(s.Root, bucket, key)
	info, err := os.Stat(fullPath)
	if err != nil {
		return nil, err
	}

	if !info.IsDir() {
		return []Object{
			{
				Key:       key,
				VersionID: "legacy",
				Size:      info.Size(),
				IsLatest:  true,
				ModTime:   info.ModTime(),
			},
		}, nil
	}

	objectDir := fullPath
	entries, err := os.ReadDir(objectDir)
	if err != nil {
		return nil, err
	}

	latestData, _ := os.ReadFile(filepath.Join(objectDir, "latest"))
	latestID := string(latestData)

	var versions []Object
	for _, entry := range entries {
		if !entry.IsDir() && entry.Name() != "latest" {
			info, _ := entry.Info()
			obj := Object{
				Key:       key,
				VersionID: entry.Name(),
				Size:      info.Size(),
				IsLatest:  entry.Name() == latestID,
				ModTime:   info.ModTime(),
			}

			if s.DB != nil {
				dbObj, _ := s.DB.GetObject(bucket, key, entry.Name())
				if dbObj != nil {
					obj.RetainUntilDate = dbObj.RetainUntilDate
					obj.LegalHold = dbObj.LegalHold
					if dbObj.LockMode != nil {
						obj.LockMode = *dbObj.LockMode
					}
					if dbObj.EncryptionType != nil {
						obj.EncryptionType = *dbObj.EncryptionType
					}
				}
			}

			versions = append(versions, obj)
		}
	}

	// Sort by mod time descending (newest first)
	sort.Slice(versions, func(i, j int) bool {
		return versions[i].ModTime.After(versions[j].ModTime)
	})

	return versions, nil
}

func (s *FileStorage) InitiateMultipartUpload(bucket, key string) (string, error) {
	uploadID := fmt.Sprintf("%d", time.Now().UnixNano())
	uploadDir := filepath.Join(s.Root, bucket, ".uploads", uploadID)
	if err := os.MkdirAll(uploadDir, 0755); err != nil {
		return "", err
	}
	// Store the intended key for verification or recovery
	if err := os.WriteFile(filepath.Join(uploadDir, "key"), []byte(key), 0644); err != nil {
		return "", err
	}
	return uploadID, nil
}

func (s *FileStorage) UploadPart(bucket, key, uploadID string, partNumber int, reader io.Reader) (string, error) {
	uploadDir := filepath.Join(s.Root, bucket, ".uploads", uploadID)
	if _, err := os.Stat(uploadDir); os.IsNotExist(err) {
		return "", fmt.Errorf("upload %s not found", uploadID)
	}

	partPath := filepath.Join(uploadDir, fmt.Sprintf("%d", partNumber))
	file, err := os.Create(partPath)
	if err != nil {
		return "", err
	}
	defer file.Close()

	_, err = io.Copy(file, reader)
	if err != nil {
		return "", err
	}

	etag := fmt.Sprintf("part-%d", partNumber) // S3 etags are usually MD5, but we use a simple placeholder
	return etag, nil
}

func (s *FileStorage) CompleteMultipartUpload(bucket, key, uploadID string, parts []Part) (string, error) {
	uploadDir := filepath.Join(s.Root, bucket, ".uploads", uploadID)
	if _, err := os.Stat(uploadDir); os.IsNotExist(err) {
		return "", fmt.Errorf("upload %s not found", uploadID)
	}

	// Create temporary file for assembly
	tempFile, err := os.CreateTemp("", "mpu-assembly-*")
	if err != nil {
		return "", err
	}
	defer os.Remove(tempFile.Name())
	defer tempFile.Close()

	// Sort parts by part number just in case
	sort.Slice(parts, func(i, j int) bool {
		return parts[i].PartNumber < parts[j].PartNumber
	})

	for _, p := range parts {
		partPath := filepath.Join(uploadDir, fmt.Sprintf("%d", p.PartNumber))
		pf, err := os.Open(partPath)
		if err != nil {
			return "", fmt.Errorf("part %d missing: %w", p.PartNumber, err)
		}
		_, err = io.Copy(tempFile, pf)
		pf.Close()
		if err != nil {
			return "", err
		}
	}

	// Seek back to start
	if _, err := tempFile.Seek(0, 0); err != nil {
		return "", err
	}

	// Now PutObject using the assembled stream
	// For multipart, we should ideally retrieve the encryption type from the upload session.
	// For now, we'll pass "" as we don't store it in the session yet.
	vid, err := s.PutObject(bucket, key, tempFile, "")
	if err != nil {
		return "", err
	}

	// Cleanup
	os.RemoveAll(uploadDir)

	return vid, nil
}

func (s *FileStorage) AbortMultipartUpload(bucket, key, uploadID string) error {
	uploadDir := filepath.Join(s.Root, bucket, ".uploads", uploadID)
	return os.RemoveAll(uploadDir)
}

func (s *FileStorage) PutObjectTagging(bucket, key, versionID string, tags map[string]string) error {
	objectDir := filepath.Join(s.Root, bucket, key)
	if versionID == "" {
		data, err := os.ReadFile(filepath.Join(objectDir, "latest"))
		if err != nil {
			return err
		}
		versionID = string(data)
	}

	// S3 tags are stored per version. We'll put them in the same directory as the version file.
	// But wait, the current engine stores versions as files *inside* an object directory.
	// Let's refine: data/bucket/key/V1 (file), data/bucket/key/V1.tags (json)
	tagsPath := filepath.Join(objectDir, versionID+".tags")

	// Convert map[string]string to JSON
	// Simple implementation for now
	var lines []string
	for k, v := range tags {
		lines = append(lines, fmt.Sprintf("%q:%q", k, v))
	}
	json := "{" + strings.Join(lines, ",") + "}"
	return os.WriteFile(tagsPath, []byte(json), 0644)
}

func (s *FileStorage) GetObjectTagging(bucket, key, versionID string) (map[string]string, error) {
	objectDir := filepath.Join(s.Root, bucket, key)
	if versionID == "" {
		data, err := os.ReadFile(filepath.Join(objectDir, "latest"))
		if err != nil {
			return nil, err
		}
		versionID = string(data)
	}

	tagsPath := filepath.Join(objectDir, versionID+".tags")
	if _, err := os.Stat(tagsPath); os.IsNotExist(err) {
		return make(map[string]string), nil
	}

	data, err := os.ReadFile(tagsPath)
	if err != nil {
		return nil, err
	}

	// Very simple "parser" for our simple "json"
	tags := make(map[string]string)
	content := strings.Trim(string(data), "{}")
	if content == "" {
		return tags, nil
	}
	pairs := strings.Split(content, ",")
	for _, p := range pairs {
		kv := strings.Split(p, ":")
		if len(kv) == 2 {
			k := strings.Trim(kv[0], "\"")
			v := strings.Trim(kv[1], "\"")
			tags[k] = v
		}
	}
	return tags, nil
}

func (s *FileStorage) PutBucketCors(bucket string, cors CORSConfiguration) error {
	path := filepath.Join(s.Root, bucket, "cors.json")
	data, err := json.MarshalIndent(cors, "", "  ")
	if err != nil {
		return err
	}

	// Invalidate cache
	s.Cache.Delete(cache.BucketCORSKey(bucket))

	return os.WriteFile(path, data, 0644)
}

func (s *FileStorage) GetBucketCors(bucket string) (*CORSConfiguration, error) {
	// Try cache first
	if cached, ok := s.Cache.Get(cache.BucketCORSKey(bucket)); ok {
		metrics.RecordCacheHit("bucket_cors")
		if cors, ok := cached.(*CORSConfiguration); ok {
			return cors, nil
		}
	}
	metrics.RecordCacheMiss("bucket_cors")

	path := filepath.Join(s.Root, bucket, "cors.json")
	if _, err := os.Stat(path); os.IsNotExist(err) {
		return nil, fmt.Errorf("CORS configuration not found")
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var cors CORSConfiguration
	if err := json.Unmarshal(data, &cors); err != nil {
		return nil, err
	}

	// Cache for 30 minutes
	s.Cache.Set(cache.BucketCORSKey(bucket), &cors, 30*time.Minute)

	return &cors, nil
}

func (s *FileStorage) DeleteBucketCors(bucket string) error {
	// Invalidate cache
	s.Cache.Delete(cache.BucketCORSKey(bucket))

	path := filepath.Join(s.Root, bucket, "cors.json")
	return os.Remove(path)
}

func (s *FileStorage) PutBucketLifecycle(bucket string, lifecycle LifecycleConfiguration) error {
	path := filepath.Join(s.Root, bucket, "lifecycle.json")
	data, err := json.MarshalIndent(lifecycle, "", "  ")
	if err != nil {
		return err
	}

	// Invalidate cache
	s.Cache.Delete(cache.BucketLifecycleKey(bucket))

	return os.WriteFile(path, data, 0644)
}

func (s *FileStorage) GetBucketLifecycle(bucket string) (*LifecycleConfiguration, error) {
	// Try cache first
	if cached, ok := s.Cache.Get(cache.BucketLifecycleKey(bucket)); ok {
		metrics.RecordCacheHit("bucket_lifecycle")
		if lifecycle, ok := cached.(*LifecycleConfiguration); ok {
			return lifecycle, nil
		}
	}
	metrics.RecordCacheMiss("bucket_lifecycle")

	path := filepath.Join(s.Root, bucket, "lifecycle.json")
	if _, err := os.Stat(path); os.IsNotExist(err) {
		return nil, fmt.Errorf("Lifecycle configuration not found")
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var lifecycle LifecycleConfiguration
	if err := json.Unmarshal(data, &lifecycle); err != nil {
		return nil, err
	}

	// Cache for 30 minutes
	s.Cache.Set(cache.BucketLifecycleKey(bucket), &lifecycle, 30*time.Minute)

	return &lifecycle, nil
}

func (s *FileStorage) DeleteBucketLifecycle(bucket string) error {
	// Invalidate cache
	s.Cache.Delete(cache.BucketLifecycleKey(bucket))

	path := filepath.Join(s.Root, bucket, "lifecycle.json")
	return os.Remove(path)
}

func (s *FileStorage) StartLifecycleWorker() {
	// Get interval from environment variable, default to 1 hour
	intervalStr := os.Getenv("LIFECYCLE_WORKER_INTERVAL")
	interval := 1 * time.Hour
	if intervalStr != "" {
		if minutes, err := strconv.Atoi(intervalStr); err == nil {
			interval = time.Duration(minutes) * time.Minute
		}
	}

	fmt.Printf("Starting lifecycle worker with interval: %v\n", interval)

	go func() {
		ticker := time.NewTicker(interval)
		for range ticker.C {
			s.ProcessLifecycleRules()
		}
	}()
}

func (s *FileStorage) ProcessLifecycleRules() {
	buckets, err := s.ListBuckets()
	if err != nil {
		return
	}

	for _, bucket := range buckets {
		config, err := s.GetBucketLifecycle(bucket)
		if err != nil {
			continue
		}

		for _, rule := range config.Rules {
			if rule.Status != "Enabled" {
				continue
			}

			// Simple walk through objects
			bucketPath := filepath.Join(s.Root, bucket)
			filepath.Walk(bucketPath, func(path string, info os.FileInfo, err error) error {
				if err != nil || info.IsDir() {
					return nil
				}

				// Skip hidden files/internal files
				rel, _ := filepath.Rel(bucketPath, path)
				if strings.HasPrefix(rel, ".") || rel == "lifecycle.json" || rel == "cors.json" || rel == "tags.json" {
					return nil
				}

				// Check prefix
				if !strings.HasPrefix(rel, rule.Filter.Prefix) {
					return nil
				}

				// Check expiration
				if rule.Expiration.Days > 0 {
					expiryDate := info.ModTime().Add(time.Duration(rule.Expiration.Days) * 24 * time.Hour)
					if time.Now().After(expiryDate) {
						os.Remove(path)
						// Also cleanup empty version directories if any
						dir := filepath.Dir(path)
						if dir != bucketPath {
							entries, _ := os.ReadDir(dir)
							if len(entries) == 0 {
								os.Remove(dir)
							}
						}
					}
				}

				return nil
			})
		}
	}
}
