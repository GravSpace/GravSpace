package storage

import (
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
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
