package storage

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/GravSpace/GravSpace/internal/cache"
	"github.com/GravSpace/GravSpace/internal/crypto"
	"github.com/GravSpace/GravSpace/internal/database"
	"github.com/GravSpace/GravSpace/internal/metrics"
	"github.com/GravSpace/GravSpace/internal/notification" // Added this import
	"github.com/GravSpace/GravSpace/internal/notifications"
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

var bufferPool = sync.Pool{
	New: func() interface{} {
		return make([]byte, 32*1024) // 32KB buffer
	},
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

// WebsiteConfiguration represents S3 Website configuration
type WebsiteConfiguration struct {
	IndexDocument *IndexDocument `json:"index_document,omitempty"`
	ErrorDocument *ErrorDocument `json:"error_document,omitempty"`
}

type IndexDocument struct {
	Suffix string `json:"suffix"`
}

type ErrorDocument struct {
	Key string `json:"key"`
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
	GetBucketObjectLock(name string) (enabled bool, mode string, days int, err error)
	PutObject(bucket, key string, reader io.Reader, encryptionType string) (string, error)
	GetObject(bucket, key, versionID string) (io.ReadCloser, *Object, error)
	StatObject(bucket, key, versionID string) (*Object, error)
	DeleteObject(bucket, key, versionID string, bypassGovernance bool) error
	ListObjects(bucket, prefix, delimiter, search string) ([]Object, []string, error)
	ListVersions(bucket, key string) ([]Object, error)
	SetObjectRetention(bucket, key, versionID string, retainUntil time.Time, mode string) error
	SetObjectLegalHold(bucket, key, versionID string, hold bool) error
	SetBucketDefaultRetention(bucket, mode string, days int) error

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

	// Website
	PutBucketWebsite(bucket string, website WebsiteConfiguration) error
	GetBucketWebsite(bucket string) (*WebsiteConfiguration, error)
	DeleteBucketWebsite(bucket string) error

	// Soft Delete & Recycle Bin
	SetBucketSoftDelete(bucket string, enabled bool, retentionDays int) error
	ListTrash(bucket, search string) ([]*database.ObjectRow, error)
	EmptyTrash(bucket string) error
	RestoreObject(bucket, key, versionID string) error
	DeleteTrashObject(bucket, key, versionID string) error

	// Stats
	StartLifecycleWorker()
	GetGlobalStats() (count int, size int64, err error)
	GetBucketStats(bucket string) (count int, size int64, err error)
}

// FileStorage implements Storage using the local filesystem
type FileStorage struct {
	Root          string
	DB            *database.Database
	Cache         cache.Cache
	Notifier      *notification.NotificationService
	mu            sync.Mutex // For synchronizing access if needed
	SyncWorker    *SyncWorker
	Notifications *notifications.Dispatcher
}

func NewFileStorage(root string, db *database.Database) (*FileStorage, error) {
	if err := os.MkdirAll(root, 0755); err != nil {
		return nil, err
	}

	// Initialize cache
	var c cache.Cache
	redisURL := os.Getenv("REDIS_URL")
	if redisURL != "" {
		fmt.Printf("Using Redis cache at %s\n", redisURL)
		var err error
		c, err = cache.NewRedisCache(redisURL)
		if err != nil {
			fmt.Printf("Failed to connect to Redis: %v. Falling back to in-memory cache.\n", err)
			c = cache.NewInMemoryCache()
		}
	} else {
		c = cache.NewInMemoryCache()
	}

	// Create storage instance
	s := &FileStorage{
		Root:          root,
		DB:            db,
		Cache:         c,
		Notifier:      notification.NewNotificationService(db),
		Notifications: notifications.NewDispatcher(db, 5), // 5 workers
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
	if s.Cache != nil {
		s.Cache.Delete(cache.BucketListKey())
	}

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

func (s *FileStorage) GetBucketObjectLock(name string) (bool, string, int, error) {
	if s.DB == nil {
		return false, "", 0, fmt.Errorf("database not available")
	}
	bucket, err := s.DB.GetBucket(name)
	if err != nil {
		return false, "", 0, err
	}
	if bucket == nil {
		return false, "", 0, os.ErrNotExist
	}
	return bucket.ObjectLockEnabled, bucket.DefaultRetentionMode, bucket.DefaultRetentionDays, nil
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

func (s *FileStorage) SetBucketDefaultRetention(bucket, mode string, days int) error {
	if s.DB == nil {
		return fmt.Errorf("database not available")
	}
	return s.DB.SetBucketDefaultRetention(bucket, mode, days)
}

func (s *FileStorage) ListBuckets() ([]string, error) {
	// Try cache first
	var buckets []string
	if s.Cache != nil {
		if ok := s.Cache.Get(cache.BucketListKey(), &buckets); ok {
			metrics.RecordCacheHit("bucket_list")
			return buckets, nil
		}
		metrics.RecordCacheMiss("bucket_list")
	}

	// Try database
	if s.DB != nil {
		dbBuckets, err := s.DB.ListBuckets()
		if err != nil {
			return nil, err
		}
		if s.Cache != nil {
			s.Cache.Set(cache.BucketListKey(), dbBuckets, 15*time.Minute)
		}
		return dbBuckets, nil
	}

	// Fallback to filesystem
	entries, err := os.ReadDir(s.Root)
	if err != nil {
		return nil, err
	}
	var results []string
	for _, entry := range entries {
		if entry.IsDir() && entry.Name() != ".versions" {
			results = append(results, entry.Name())
		}
	}

	// Cache the result
	if s.Cache != nil {
		s.Cache.Set(cache.BucketListKey(), results, 5*time.Minute)
	}
	return results, nil
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
	if s.Cache != nil {
		s.Cache.Delete(cache.BucketListKey())
		s.Cache.Delete(cache.BucketCORSKey(name))
		s.Cache.Delete(cache.BucketLifecycleKey(name))
		s.Cache.Delete(cache.BucketWebsiteKey(name)) // Invalidate website cache
	}

	return nil
}

func (s *FileStorage) PutObject(bucket, key string, reader io.Reader, encryptionType string) (string, error) {
	// If key is a folder placeholder (ends in /), create directory and add to DB
	if strings.HasSuffix(key, "/") {
		objectDir := filepath.Join(s.Root, bucket, key)
		if err := os.MkdirAll(objectDir, 0755); err != nil {
			return "", err
		}
		if s.DB != nil {
			contentType := "application/x-directory"
			objectRow := &database.ObjectRow{
				Bucket:      bucket,
				Key:         key,
				VersionID:   "folder",
				Size:        0,
				IsLatest:    true,
				ContentType: &contentType,
			}
			s.DB.CreateObject(objectRow)
		}
		return "", nil
	}

	// Check if versioning is enabled and get object lock defaults
	versioningEnabled := false
	var defaultRetentionMode string
	var defaultRetentionDays int
	if s.DB != nil {
		bucketInfo, err := s.DB.GetBucket(bucket)
		if err == nil && bucketInfo != nil {
			versioningEnabled = bucketInfo.VersioningEnabled
			if bucketInfo.ObjectLockEnabled {
				defaultRetentionMode = bucketInfo.DefaultRetentionMode
				defaultRetentionDays = bucketInfo.DefaultRetentionDays
			}
		}
	}

	// Check if the existing object has a lock (before overwriting)
	// ONLY block if versioning is disabled. If versioning is enabled, a new version is created.
	if !versioningEnabled && s.DB != nil {
		existingObj, _ := s.DB.GetObject(bucket, key, "")
		if existingObj != nil {
			// Check for legal hold
			if existingObj.LegalHold {
				return "", fmt.Errorf("object is under legal hold and cannot be overwritten")
			}

			// Check for retention period
			if existingObj.RetainUntilDate != nil && time.Now().Before(*existingObj.RetainUntilDate) {
				lockMode := ""
				if existingObj.LockMode != nil {
					lockMode = *existingObj.LockMode
				}
				return "", fmt.Errorf("object is under %s retention until %s and cannot be overwritten",
					lockMode, existingObj.RetainUntilDate.Format(time.RFC3339))
			}
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

	buf := bufferPool.Get().([]byte)
	size, err = io.CopyBuffer(writeCloser, reader, buf)
	bufferPool.Put(buf)
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
		// Apply default retention if set
		var retainUntil *time.Time
		var lockMode *string
		if defaultRetentionMode != "" && defaultRetentionDays > 0 {
			t := time.Now().AddDate(0, 0, defaultRetentionDays)
			retainUntil = &t
			m := defaultRetentionMode
			lockMode = &m
		}

		objectRow := &database.ObjectRow{
			Bucket:          bucket,
			Key:             key,
			VersionID:       versionID,
			Size:            size,
			ETag:            &versionID,
			ContentType:     &contentType,
			IsLatest:        true,
			EncryptionType:  &encryptionType,
			RetainUntilDate: retainUntil,
			LockMode:        lockMode,
		}
		s.DB.CreateObject(objectRow)
		metrics.ObjectsTotal.WithLabelValues(bucket).Inc()
		metrics.StorageBytes.WithLabelValues(bucket).Add(float64(size))

		// Trigger Webhook
		if s.Notifications != nil {
			s.Notifications.Dispatch(notifications.Event{
				Bucket:    bucket,
				Key:       key,
				VersionID: versionID,
				Size:      size,
				ETag:      versionID,
				EventName: "ObjectCreated:Put",
			})
		}
	}

	// Invalidate object list cache for this bucket and all parent prefixes
	if s.Cache != nil {
		s.Cache.Delete(cache.ObjectListKey(bucket, ""))
		// Invalidate cache for all parent directories
		parts := strings.Split(key, "/")
		for i := 1; i < len(parts); i++ {
			prefix := strings.Join(parts[:i], "/") + "/"
			s.Cache.Delete(cache.ObjectListKey(bucket, prefix))
		}
	}

	return versionID, nil
}

func (s *FileStorage) GetObject(bucket, key, versionID string) (io.ReadCloser, *Object, error) {
	// 1. Get metadata first (from DB or Stat)
	obj, err := s.StatObject(bucket, key, versionID)
	if err != nil {
		return nil, nil, err
	}

	// Adjust versionID if it was empty (StatObject resolved it)
	versionID = obj.VersionID

	fullPath := filepath.Join(s.Root, bucket, key)
	var reader *os.File
	if versionID == "legacy" {
		reader, err = os.Open(fullPath)
	} else {
		reader, err = os.Open(filepath.Join(fullPath, versionID))
	}

	if err != nil {
		return nil, nil, err
	}

	// Check if encrypted
	if obj.EncryptionType == "AES256" {
		decryptedReader, err := crypto.DecryptStream(crypto.GetMasterKey(), reader)
		if err != nil {
			reader.Close()
			return nil, nil, err
		}
		return decryptedReader, obj, nil
	}

	return reader, obj, nil
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

func (s *FileStorage) DeleteObject(bucket, key, versionID string, bypassGovernance bool) error {

	// Check if soft delete is enabled for this bucket
	softDeleteEnabled := false
	if s.DB != nil {
		bucketInfo, err := s.DB.GetBucket(bucket)
		if err == nil && bucketInfo != nil {
			softDeleteEnabled = bucketInfo.SoftDeleteEnabled
		}
	}

	// Delete from database
	if s.DB != nil {
		if strings.HasSuffix(key, "/") && versionID == "" {
			// Folder deletion: delete prefix recursively from DB
			var err error
			if softDeleteEnabled {
				err = s.DB.SoftDeletePrefix(bucket, key)
			} else {
				err = s.DB.DeletePrefix(bucket, key)
			}
			if err != nil {
				return err
			}
		} else {
			// Specific file or version deletion
			obj, _ := s.DB.GetObject(bucket, key, versionID)
			if obj != nil {
				// Check for legal hold
				if obj.LegalHold {
					return fmt.Errorf("object is under legal hold and cannot be deleted")
				}

				// Check for retention period
				if obj.RetainUntilDate != nil && time.Now().Before(*obj.RetainUntilDate) {
					lockMode := ""
					if obj.LockMode != nil {
						lockMode = *obj.LockMode
					}

					// GOVERNANCE mode can be bypassed if the user has permission (handled by bypassGovernance flag)
					if lockMode == "GOVERNANCE" && bypassGovernance {
						// Allow deletion
					} else {
						return fmt.Errorf("object is under %s retention until %s and cannot be deleted",
							lockMode, obj.RetainUntilDate.Format(time.RFC3339))
					}
				}

				metrics.ObjectsTotal.WithLabelValues(bucket).Dec()
				metrics.StorageBytes.WithLabelValues(bucket).Sub(float64(obj.Size))

				if softDeleteEnabled {
					s.DB.SoftDeleteObject(bucket, key, obj.VersionID)
				} else {
					s.DB.DeleteObject(bucket, key, obj.VersionID)
				}

				// Update versionID for the rest of the function (filesystem move/delete)
				versionID = obj.VersionID
			} else {
				// Object might already be in trash or doesn't exist
				if !softDeleteEnabled {
					s.DB.DeleteObject(bucket, key, versionID)
				}
			}

			// Trigger Webhook for file deletion
			if s.Notifications != nil {
				s.Notifications.Dispatch(notifications.Event{
					Bucket:    bucket,
					Key:       key,
					VersionID: versionID,
					Size:      0, // Might not be available if obj is nil
					ETag:      versionID,
					EventName: "ObjectRemoved:Delete",
				})
			}
		}
	}

	// Invalidate cache for this bucket and all parent prefixes
	if s.Cache != nil {
		s.Cache.Delete(cache.ObjectListKey(bucket, ""))
		s.Cache.Delete(cache.ObjectMetadataKey(bucket, key, versionID))
		// Invalidate cache for all parent directories
		parts := strings.Split(key, "/")
		for i := 1; i < len(parts); i++ {
			prefix := strings.Join(parts[:i], "/") + "/"
			s.Cache.Delete(cache.ObjectListKey(bucket, prefix))
		}
	}

	srcPath := filepath.Join(s.Root, bucket, key)
	trashPath := filepath.Join(s.Root, ".trash", bucket, key)

	if versionID == "folder" {
		// Folder placeholders are just the directory itself
	} else if versionID != "" && versionID != "simple" {
		srcPath = filepath.Join(srcPath, versionID)
		trashPath = filepath.Join(trashPath, versionID)
	} else if versionID == "simple" {
		trashPath = filepath.Join(trashPath, "simple")
	}

	if softDeleteEnabled {
		if err := os.MkdirAll(filepath.Dir(trashPath), 0755); err != nil {
			return err
		}
		return os.Rename(srcPath, trashPath)
	}

	if versionID == "" {
		// Delete everything for this key if no version specified (recursive)
		return os.RemoveAll(srcPath)
	}
	return os.Remove(srcPath)
}

func (s *FileStorage) RestoreObject(bucket, key, versionID string) error {
	srcPath := filepath.Join(s.Root, ".trash", bucket, key)
	dstPath := filepath.Join(s.Root, bucket, key)

	if versionID == "folder" {
		// Folder placeholders are just the directory itself
	} else if versionID != "" && versionID != "simple" {
		srcPath = filepath.Join(srcPath, versionID)
		dstPath = filepath.Join(dstPath, versionID)
	} else if versionID == "simple" {
		srcPath = filepath.Join(srcPath, "simple")
	}

	if err := os.MkdirAll(filepath.Dir(dstPath), 0755); err != nil {
		return err
	}

	if err := os.Rename(srcPath, dstPath); err != nil {
		return err
	}

	if s.DB != nil {
		var err error
		if strings.HasSuffix(key, "/") && versionID == "folder" {
			err = s.DB.RestorePrefix(bucket, key)
		} else {
			err = s.DB.RestoreObject(bucket, key, versionID)
		}
		if err != nil {
			return err
		}
		// Logic to update metrics (approximate)
		obj, _ := s.DB.GetObject(bucket, key, versionID)
		if obj != nil {
			metrics.ObjectsTotal.WithLabelValues(bucket).Inc()
			metrics.StorageBytes.WithLabelValues(bucket).Add(float64(obj.Size))
		}
	}

	// Invalidate cache
	if s.Cache != nil {
		s.Cache.Delete(cache.ObjectListKey(bucket, ""))
	}
	return nil
}

func (s *FileStorage) SetBucketSoftDelete(bucket string, enabled bool, retentionDays int) error {
	if s.DB == nil {
		return fmt.Errorf("database not available")
	}
	return s.DB.SetBucketSoftDelete(bucket, enabled, retentionDays)
}

func (s *FileStorage) ListTrash(bucket, search string) ([]*database.ObjectRow, error) {
	if s.DB == nil {
		return nil, fmt.Errorf("database not available")
	}
	return s.DB.ListTrashObjects(bucket, search)
}

func (s *FileStorage) EmptyTrash(bucket string) error {
	if s.DB == nil {
		return fmt.Errorf("database not available")
	}

	// 1. Get all objects in trash (manually handle filesystem deletion)
	objects, err := s.DB.ListTrashObjects(bucket, "")
	if err != nil {
		return err
	}

	for _, obj := range objects {
		// Calculate physical path in the .trash directory
		var physicalPath string
		var objectDir string
		if obj.VersionID == "folder" {
			physicalPath = filepath.Join(s.Root, ".trash", obj.Bucket, obj.Key)
			objectDir = physicalPath
		} else if obj.VersionID == "simple" {
			objectDir = filepath.Join(s.Root, ".trash", obj.Bucket, obj.Key)
			physicalPath = filepath.Join(objectDir, "simple")
		} else { // Actual version ID
			objectDir = filepath.Join(s.Root, ".trash", obj.Bucket, obj.Key)
			physicalPath = filepath.Join(objectDir, obj.VersionID)
		}

		// Delete version file from filesystem
		os.RemoveAll(physicalPath)

		// Delete parent directory if it's empty (this handles clearing the object directory)
		if objectDir != "" {
			os.Remove(objectDir)
		}
	}

	// 2. Purge records from database
	return s.DB.EmptyTrash(bucket)
}

func (s *FileStorage) DeleteTrashObject(bucket, key, versionID string) error {
	trashPath := filepath.Join(s.Root, ".trash", bucket, key)

	if versionID == "folder" {
		// Folder placeholders are just the directory itself
	} else if versionID != "" && versionID != "simple" {
		trashPath = filepath.Join(trashPath, versionID)
	} else if versionID == "simple" {
		trashPath = filepath.Join(trashPath, "simple")
	}

	if s.DB != nil {
		if err := s.DB.DeleteObject(bucket, key, versionID); err != nil {
			log.Printf("Error deleting object from DB: %v", err)
		}
	}

	if versionID == "" {
		return os.RemoveAll(trashPath)
	}
	return os.Remove(trashPath)
}

func (s *FileStorage) ListObjects(bucket, prefix, delimiter, search string) ([]Object, []string, error) {
	// Try cache first (only if no search query)
	if search == "" && s.Cache != nil {
		cacheKey := cache.ObjectListKey(bucket, prefix)
		var cached struct {
			Objects        []Object
			CommonPrefixes []string
		}
		if s.Cache.Get(cacheKey, &cached) {
			return cached.Objects, cached.CommonPrefixes, nil
		}
	}

	// Try database first if available - it's much faster
	if s.DB != nil {
		// Use a high limit for now or implement pagination
		dbObjects, err := s.DB.ListObjects(bucket, prefix, search, 10000)
		if err == nil {
			var objects []Object
			var commonPrefixes []string
			seenPrefixes := make(map[string]bool)

			for _, o := range dbObjects {
				relKey := o.Key
				if prefix != "" && !strings.HasPrefix(relKey, prefix) {
					continue
				}

				subKey := relKey[len(prefix):]
				if delimiter != "" {
					idx := strings.Index(subKey, delimiter)
					if idx != -1 {
						cp := prefix + subKey[:idx+len(delimiter)]
						if !seenPrefixes[cp] {
							commonPrefixes = append(commonPrefixes, cp)
							seenPrefixes[cp] = true
						}
						continue
					}
				}

				obj := Object{
					Key:       o.Key,
					VersionID: o.VersionID,
					Size:      o.Size,
					IsLatest:  o.IsLatest,
					ModTime:   o.ModifiedAt,
				}
				if o.LockMode != nil {
					obj.LockMode = *o.LockMode
				}
				obj.RetainUntilDate = o.RetainUntilDate
				obj.LegalHold = o.LegalHold
				if o.EncryptionType != nil {
					obj.EncryptionType = *o.EncryptionType
				}
				objects = append(objects, obj)
			}

			// Cache the results (only if no search query)
			if search == "" && s.Cache != nil {
				cacheKey := cache.ObjectListKey(bucket, prefix)
				s.Cache.Set(cacheKey, struct {
					Objects        []Object
					CommonPrefixes []string
				}{objects, commonPrefixes}, 5*time.Minute)
			}

			return objects, commonPrefixes, nil
		}
	}

	// Fallback to filesystem - use ReadDir instead of Walk if possible for performance
	bucketDir := filepath.Join(s.Root, bucket)
	objects := []Object{}
	commonPrefixes := []string{}

	// If recursive walk is needed (delimiter="") we use Walk
	if delimiter == "" {
		err := filepath.Walk(bucketDir, func(path string, info os.FileInfo, err error) error {
			if err != nil || path == bucketDir {
				return err
			}
			rel, _ := filepath.Rel(bucketDir, path)
			if info.IsDir() {
				// Object directory detection (has 'latest')
				if _, err := os.Stat(filepath.Join(path, "latest")); err == nil {
					data, _ := os.ReadFile(filepath.Join(path, "latest"))
					vid := string(data)
					vinfo, _ := os.Stat(filepath.Join(path, vid))
					objects = append(objects, Object{
						Key:       rel,
						VersionID: vid,
						Size:      vinfo.Size(),
						IsLatest:  true,
						ModTime:   vinfo.ModTime(),
					})
					return filepath.SkipDir
				}
				return nil
			}
			// Legacy file
			if filepath.Base(path) != "latest" && !strings.Contains(path, "/.uploads/") {
				objects = append(objects, Object{
					Key:       rel,
					VersionID: "legacy",
					Size:      info.Size(),
					IsLatest:  true,
					ModTime:   info.ModTime(),
				})
			}
			return nil
		})
		return objects, commonPrefixes, err
	}

	// For specific prefix with delimiter, only read the relevant directory
	searchDir := filepath.Join(bucketDir, prefix)
	// Truncate to the nearest directory if prefix points to a file-like path part
	if !strings.HasSuffix(prefix, "/") && prefix != "" {
		searchDir = filepath.Dir(searchDir)
	}

	entries, err := os.ReadDir(searchDir)
	if err != nil {
		return nil, nil, nil // Return empty if dir doesn't exist
	}

	for _, entry := range entries {
		name := entry.Name()
		if name == "latest" || name == ".uploads" || name == ".versions" {
			continue
		}

		relPath := filepath.Join(prefix, name)
		if !strings.HasPrefix(relPath, prefix) {
			continue
		}

		if entry.IsDir() {
			// Check if it's an object dir
			if _, err := os.Stat(filepath.Join(searchDir, name, "latest")); err == nil {
				data, _ := os.ReadFile(filepath.Join(searchDir, name, "latest"))
				vid := string(data)
				vinfo, _ := entry.Info()
				objects = append(objects, Object{
					Key:       relPath,
					VersionID: vid,
					Size:      vinfo.Size(),
					IsLatest:  true,
					ModTime:   vinfo.ModTime(),
				})
			} else {
				commonPrefixes = append(commonPrefixes, relPath+"/")
			}
		} else {
			info, _ := entry.Info()
			objects = append(objects, Object{
				Key:       relPath,
				VersionID: "legacy",
				Size:      info.Size(),
				IsLatest:  true,
				ModTime:   info.ModTime(),
			})
		}
	}

	return objects, commonPrefixes, nil
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

	versions := []Object{}
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

	buf := bufferPool.Get().([]byte)
	defer bufferPool.Put(buf)

	_, err = io.CopyBuffer(file, reader, buf)
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

	// 1. Resolve versioning and metadata similar to PutObject
	var versioningEnabled bool
	var defaultRetentionMode string
	var defaultRetentionDays int
	if s.DB != nil {
		bucketInfo, err := s.DB.GetBucket(bucket)
		if err == nil && bucketInfo != nil {
			versioningEnabled = bucketInfo.VersioningEnabled
			if bucketInfo.ObjectLockEnabled {
				defaultRetentionMode = bucketInfo.DefaultRetentionMode
				defaultRetentionDays = bucketInfo.DefaultRetentionDays
			}
		}
	}

	versionID := fmt.Sprintf("%d", time.Now().UnixNano())
	var targetPath string
	if versioningEnabled {
		objectDir := filepath.Join(s.Root, bucket, key)
		if err := os.MkdirAll(objectDir, 0755); err != nil {
			return "", err
		}
		targetPath = filepath.Join(objectDir, versionID)
	} else {
		objectDir := filepath.Join(s.Root, bucket, filepath.Dir(key))
		if err := os.MkdirAll(objectDir, 0755); err != nil {
			return "", err
		}
		targetPath = filepath.Join(s.Root, bucket, key)
		versionID = "simple"
	}

	destFile, err := os.Create(targetPath)
	if err != nil {
		return "", err
	}
	defer destFile.Close()

	// 2. Setup streaming sink (with encryption if needed)
	// For multipart, encryption type should ideally come from initiation.
	// For now we'll assume standard or inherit from bucket.
	var writer io.WriteCloser = destFile
	encryptionType := "" // Could be passed or retrieved from session
	if encryptionType == "AES256" {
		writer, err = crypto.EncryptStream(crypto.GetMasterKey(), destFile)
		if err != nil {
			return "", err
		}
	}

	// 3. Stream parts directly
	sort.Slice(parts, func(i, j int) bool {
		return parts[i].PartNumber < parts[j].PartNumber
	})

	buf := bufferPool.Get().([]byte)
	defer bufferPool.Put(buf)

	var totalSize int64
	for _, p := range parts {
		partPath := filepath.Join(uploadDir, fmt.Sprintf("%d", p.PartNumber))
		pf, err := os.Open(partPath)
		if err != nil {
			writer.Close()
			return "", fmt.Errorf("part %d missing: %w", p.PartNumber, err)
		}
		n, err := io.CopyBuffer(writer, pf, buf)
		pf.Close()
		if err != nil {
			writer.Close()
			return "", err
		}
		totalSize += n
	}

	if err := writer.Close(); err != nil {
		return "", err
	}

	// 4. Update latest pointer and metadata
	if versioningEnabled {
		objectDir := filepath.Join(s.Root, bucket, key)
		os.WriteFile(filepath.Join(objectDir, "latest"), []byte(versionID), 0644)
	}

	if s.DB != nil {
		contentType := "application/octet-stream"
		var retainUntil *time.Time
		var lockMode *string
		if defaultRetentionMode != "" && defaultRetentionDays > 0 {
			t := time.Now().AddDate(0, 0, defaultRetentionDays)
			retainUntil = &t
			m := defaultRetentionMode
			lockMode = &m
		}

		s.DB.CreateObject(&database.ObjectRow{
			Bucket:          bucket,
			Key:             key,
			VersionID:       versionID,
			Size:            totalSize,
			ETag:            &versionID,
			ContentType:     &contentType,
			IsLatest:        true,
			EncryptionType:  &encryptionType,
			RetainUntilDate: retainUntil,
			LockMode:        lockMode,
		})
		metrics.ObjectsTotal.WithLabelValues(bucket).Inc()
		metrics.StorageBytes.WithLabelValues(bucket).Add(float64(totalSize))
	}

	// Dispatch notification
	if s.Notifications != nil {
		s.Notifications.Dispatch(notifications.Event{
			Bucket:    bucket,
			Key:       key,
			VersionID: versionID,
			Size:      totalSize,
			ETag:      versionID,
			EventName: "ObjectCreated:CompleteMultipartUpload",
		})
	}

	return versionID, nil
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

	tagsPath := filepath.Join(objectDir, versionID+".tags")
	data, err := json.Marshal(tags)
	if err != nil {
		return err
	}
	return os.WriteFile(tagsPath, data, 0644)
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

	tags := make(map[string]string)
	if err := json.Unmarshal(data, &tags); err != nil {
		return nil, err
	}
	return tags, nil
}

func (s *FileStorage) GetGlobalStats() (count int, size int64, err error) {
	if s.DB == nil {
		return 0, 0, fmt.Errorf("database not initialized")
	}
	return s.DB.GetGlobalStats()
}

func (s *FileStorage) GetBucketStats(bucket string) (count int, size int64, err error) {
	if s.DB == nil {
		return 0, 0, fmt.Errorf("database not initialized")
	}
	return s.DB.GetBucketStats(bucket)
}

func (s *FileStorage) PutBucketCors(bucket string, cors CORSConfiguration) error {
	path := filepath.Join(s.Root, bucket, "cors.json")
	data, err := json.MarshalIndent(cors, "", "  ")
	if err != nil {
		return err
	}

	// Invalidate cache
	if s.Cache != nil {
		s.Cache.Delete(cache.BucketCORSKey(bucket))
	}

	return os.WriteFile(path, data, 0644)
}

func (s *FileStorage) GetBucketCors(bucket string) (*CORSConfiguration, error) {
	// Try cache first
	var cached CORSConfiguration
	if s.Cache != nil {
		if ok := s.Cache.Get(cache.BucketCORSKey(bucket), &cached); ok {
			metrics.RecordCacheHit("bucket_cors")
			return &cached, nil
		}
		metrics.RecordCacheMiss("bucket_cors")
	}

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
	if s.Cache != nil {
		s.Cache.Set(cache.BucketCORSKey(bucket), &cors, 30*time.Minute)
	}

	return &cors, nil
}

func (s *FileStorage) DeleteBucketCors(bucket string) error {
	// Invalidate cache
	if s.Cache != nil {
		s.Cache.Delete(cache.BucketCORSKey(bucket))
	}

	path := filepath.Join(s.Root, bucket, "cors.json")
	return os.Remove(path)
}

func (s *FileStorage) PutBucketLifecycle(bucket string, lifecycle LifecycleConfiguration) error {
	if s.DB == nil {
		return fmt.Errorf("database not available")
	}
	data, err := json.Marshal(lifecycle)
	if err != nil {
		return err
	}

	// Invalidate cache
	if s.Cache != nil {
		s.Cache.Delete(cache.BucketLifecycleKey(bucket))
	}

	return s.DB.PutBucketLifecycle(bucket, string(data))
}

func (s *FileStorage) GetBucketLifecycle(bucket string) (*LifecycleConfiguration, error) {
	if s.DB == nil {
		return nil, fmt.Errorf("database not available")
	}
	// Try cache first
	var cached LifecycleConfiguration
	if s.Cache != nil {
		if ok := s.Cache.Get(cache.BucketLifecycleKey(bucket), &cached); ok {
			metrics.RecordCacheHit("bucket_lifecycle")
			return &cached, nil
		}
		metrics.RecordCacheMiss("bucket_lifecycle")
	}

	data, err := s.DB.GetBucketLifecycle(bucket)
	if err != nil {
		return nil, err
	}
	if data == "" {
		return nil, fmt.Errorf("Lifecycle configuration not found")
	}
	var lifecycle LifecycleConfiguration
	if err := json.Unmarshal([]byte(data), &lifecycle); err != nil {
		return nil, err
	}

	// Cache for 30 minutes
	if s.Cache != nil {
		s.Cache.Set(cache.BucketLifecycleKey(bucket), &lifecycle, 30*time.Minute)
	}

	return &lifecycle, nil
}

func (s *FileStorage) DeleteBucketLifecycle(bucket string) error {
	if s.DB == nil {
		return fmt.Errorf("database not available")
	}
	// Invalidate cache
	if s.Cache != nil {
		s.Cache.Delete(cache.BucketLifecycleKey(bucket))
	}

	return s.DB.DeleteBucketLifecycle(bucket)
}

func (s *FileStorage) PutBucketWebsite(bucket string, website WebsiteConfiguration) error {
	if s.DB == nil {
		return fmt.Errorf("database not available")
	}
	data, err := json.Marshal(website)
	if err != nil {
		return err
	}
	// Invalidate cache
	if s.Cache != nil {
		s.Cache.Delete(cache.BucketWebsiteKey(bucket))
	}
	return s.DB.PutBucketWebsite(bucket, string(data))
}

func (s *FileStorage) GetBucketWebsite(bucket string) (*WebsiteConfiguration, error) {
	if s.DB == nil {
		return nil, fmt.Errorf("database not available")
	}
	// Try cache first
	var cached WebsiteConfiguration
	if s.Cache != nil {
		if ok := s.Cache.Get(cache.BucketWebsiteKey(bucket), &cached); ok {
			metrics.RecordCacheHit("bucket_website")
			return &cached, nil
		}
		metrics.RecordCacheMiss("bucket_website")
	}

	data, err := s.DB.GetBucketWebsite(bucket)
	if err != nil {
		return nil, err
	}
	if data == "" {
		return nil, fmt.Errorf("Website configuration not found")
	}
	var config WebsiteConfiguration
	if err := json.Unmarshal([]byte(data), &config); err != nil {
		return nil, err
	}
	// Cache for 30 minutes
	if s.Cache != nil {
		s.Cache.Set(cache.BucketWebsiteKey(bucket), &config, 30*time.Minute)
	}
	return &config, nil
}

func (s *FileStorage) DeleteBucketWebsite(bucket string) error {
	if s.DB == nil {
		return fmt.Errorf("database not available")
	}
	// Invalidate cache
	if s.Cache != nil {
		s.Cache.Delete(cache.BucketWebsiteKey(bucket))
	}
	return s.DB.DeleteBucketWebsite(bucket)
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
	if s.DB == nil {
		return
	}

	// Fetch all buckets with active lifecycle rules directly from DB
	configs, err := s.DB.GetAllLifecycles()
	if err != nil {
		fmt.Printf("Lifecycle error: failed to fetch configs: %v\n", err)
		s.Notifier.SendAlert("Lifecycle Worker Failure", fmt.Sprintf("Failed to fetch lifecycle configurations: %v", err))
		return
	}

	for bucket, configJSON := range configs {
		var config LifecycleConfiguration
		if err := json.Unmarshal([]byte(configJSON), &config); err != nil {
			s.Notifier.SendAlert("Lifecycle Config Error", fmt.Sprintf("Failed to parse config for bucket %s: %v", bucket, err))
			continue
		}

		for _, rule := range config.Rules {
			if rule.Status != "Enabled" {
				continue
			}

			// Use DB to find expired objects (optimized via indices)
			expired, err := s.DB.GetExpiredObjects(bucket, rule.Filter.Prefix, rule.Expiration.Days)
			if err != nil {
				continue
			}

			for _, obj := range expired {
				// Permanently delete the expired version
				s.DeleteObject(bucket, obj.Key, obj.VersionID, true)
			}
		}
	}
}
