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
)

// Object represents a stored object version
type Object struct {
	Key       string
	VersionID string
	Size      int64
	IsLatest  bool
	ModTime   time.Time
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
	PutObject(bucket, key string, reader io.Reader) (string, error)
	GetObject(bucket, key, versionID string) (io.ReadCloser, string, error)
	StatObject(bucket, key, versionID string) (*Object, error)
	DeleteObject(bucket, key, versionID string) error
	ListObjects(bucket, prefix, delimiter string) ([]Object, []string, error)
	ListVersions(bucket, key string) ([]Object, error)

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
	Root string
}

func NewFileStorage(root string) (*FileStorage, error) {
	if err := os.MkdirAll(root, 0755); err != nil {
		return nil, err
	}
	return &FileStorage{Root: root}, nil
}

func (s *FileStorage) CreateBucket(name string) error {
	return os.MkdirAll(filepath.Join(s.Root, name), 0755)
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

func (s *FileStorage) ListBuckets() ([]string, error) {
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
	return buckets, nil
}

func (s *FileStorage) DeleteBucket(name string) error {
	return os.RemoveAll(filepath.Join(s.Root, name))
}

func (s *FileStorage) PutObject(bucket, key string, reader io.Reader) (string, error) {
	objectDir := filepath.Join(s.Root, bucket, key)
	if err := os.MkdirAll(objectDir, 0755); err != nil {
		return "", err
	}

	// If key is a folder placeholder (ends in /), just create the directory
	if strings.HasSuffix(key, "/") {
		return "", nil
	}

	versionID := fmt.Sprintf("%d", time.Now().UnixNano())
	path := filepath.Join(objectDir, versionID)
	file, err := os.Create(path)
	if err != nil {
		return "", err
	}
	defer file.Close()
	_, err = io.Copy(file, reader)
	if err != nil {
		return "", err
	}

	// Update latest pointer
	err = os.WriteFile(filepath.Join(objectDir, "latest"), []byte(versionID), 0644)
	return versionID, err
}

func (s *FileStorage) GetObject(bucket, key, versionID string) (io.ReadCloser, string, error) {
	objectDir := filepath.Join(s.Root, bucket, key)
	if versionID == "" {
		data, err := os.ReadFile(filepath.Join(objectDir, "latest"))
		if err != nil {
			return nil, "", err
		}
		versionID = string(data)
	}

	reader, err := os.Open(filepath.Join(objectDir, versionID))
	return reader, versionID, err
}

func (s *FileStorage) StatObject(bucket, key, versionID string) (*Object, error) {
	objectDir := filepath.Join(s.Root, bucket, key)
	if versionID == "" {
		data, err := os.ReadFile(filepath.Join(objectDir, "latest"))
		if err != nil {
			return nil, err
		}
		versionID = string(data)
	}

	path := filepath.Join(objectDir, versionID)
	info, err := os.Stat(path)
	if err != nil {
		return nil, err
	}

	return &Object{
		Key:       key,
		VersionID: versionID,
		Size:      info.Size(),
		IsLatest:  true, // Simplification for now, we'd need to check against 'latest' to be precise
		ModTime:   info.ModTime(),
	}, nil
}

func (s *FileStorage) DeleteObject(bucket, key, versionID string) error {
	objectDir := filepath.Join(s.Root, bucket, key)
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
		if err != nil || !info.IsDir() || path == bucketDir {
			return err
		}

		rel, _ := filepath.Rel(bucketDir, path)
		// Ensure directory keys have trailing slash for consistent S3 logic
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
	})
	return objects, commonPrefixes, err
}

func (s *FileStorage) ListVersions(bucket, key string) ([]Object, error) {
	objectDir := filepath.Join(s.Root, bucket, key)
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
			versions = append(versions, Object{
				Key:       key,
				VersionID: entry.Name(),
				Size:      info.Size(),
				IsLatest:  entry.Name() == latestID,
				ModTime:   info.ModTime(),
			})
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
	vid, err := s.PutObject(bucket, key, tempFile)
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
	return os.WriteFile(path, data, 0644)
}

func (s *FileStorage) GetBucketCors(bucket string) (*CORSConfiguration, error) {
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
	return &cors, nil
}

func (s *FileStorage) DeleteBucketCors(bucket string) error {
	path := filepath.Join(s.Root, bucket, "cors.json")
	return os.Remove(path)
}

func (s *FileStorage) PutBucketLifecycle(bucket string, lifecycle LifecycleConfiguration) error {
	path := filepath.Join(s.Root, bucket, "lifecycle.json")
	data, err := json.MarshalIndent(lifecycle, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0644)
}

func (s *FileStorage) GetBucketLifecycle(bucket string) (*LifecycleConfiguration, error) {
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
	return &lifecycle, nil
}

func (s *FileStorage) DeleteBucketLifecycle(bucket string) error {
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
