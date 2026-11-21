package storage

import (
	"fmt"
	"log"
	"mime"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/GravSpace/GravSpace/internal/cache"
	"github.com/GravSpace/GravSpace/internal/database"
	"github.com/fsnotify/fsnotify"
)

// SyncResult contains the statistics of a synchronization operation
type SyncResult struct {
	Bucket   string `json:"bucket,omitempty"`
	Synced   int    `json:"synced"`
	Errors   int    `json:"errors"`
	Pruned   int    `json:"pruned"`
	Duration string `json:"duration"`
}

// SyncWorker handles periodic and event-driven filesystem-to-database synchronization
type SyncWorker struct {
	storage     *FileStorage
	interval    time.Duration
	stopChan    chan bool
	watcher     *fsnotify.Watcher
	debounceMs  int
	dirtyPaths  map[string]time.Time
	mu          sync.Mutex
	activeSyncs map[string]bool // bucket -> bool, "*" for all buckets
}

// NewSyncWorker creates a new sync worker with 2s default debouncing
func NewSyncWorker(storage *FileStorage, interval time.Duration) *SyncWorker {
	watcher, err := fsnotify.NewWatcher()
	if err != nil {
		log.Printf("Failed to create fsnotify watcher: %v\n", err)
	}

	return &SyncWorker{
		storage:     storage,
		interval:    interval,
		stopChan:    make(chan bool),
		watcher:     watcher,
		debounceMs:  2000,
		dirtyPaths:  make(map[string]time.Time),
		activeSyncs: make(map[string]bool),
	}
}

// Start begins the sync worker
func (sw *SyncWorker) Start() {
	go sw.run()
}

// Stop stops the sync worker
func (sw *SyncWorker) Stop() {
	if sw.watcher != nil {
		sw.watcher.Close()
	}
	sw.stopChan <- true
}

func (sw *SyncWorker) tryStartSync(bucket string) bool {
	sw.mu.Lock()
	defer sw.mu.Unlock()

	if sw.activeSyncs["*"] {
		return false // Full sync already in progress
	}
	if bucket == "*" {
		if len(sw.activeSyncs) > 0 {
			return false // Specific bucket sync already in progress
		}
		sw.activeSyncs["*"] = true
		return true
	}
	if sw.activeSyncs[bucket] {
		return false // This bucket sync already in progress
	}
	sw.activeSyncs[bucket] = true
	return true
}

func (sw *SyncWorker) finishSync(bucket string) {
	sw.mu.Lock()
	defer sw.mu.Unlock()
	delete(sw.activeSyncs, bucket)
}

func (sw *SyncWorker) run() {
	// Start watching root and buckets
	sw.setupWatcher()

	ticker := time.NewTicker(sw.interval)
	defer ticker.Stop()

	debounceTicker := time.NewTicker(500 * time.Millisecond)
	defer debounceTicker.Stop()

	// Initial sync runs asynchronously in background so it never blocks startup
	go func() {
		_, _ = sw.SyncAllBuckets()
	}()

	for {
		select {
		case <-ticker.C:
			// Full periodic sync runs asynchronously in background
			go func() {
				_, _ = sw.SyncAllBuckets()
			}()

		case <-debounceTicker.C:
			// Check for debounced paths
			sw.processDirtyPaths()

		case event, ok := <-sw.watcher.Events:
			if !ok {
				return
			}
			// Only watch for specific modifications
			if event.Op&(fsnotify.Write|fsnotify.Create|fsnotify.Remove|fsnotify.Rename) != 0 {
				sw.markDirty(event.Name)

				// If it's a new directory, watch it too
				if event.Op&fsnotify.Create != 0 {
					info, err := os.Stat(event.Name)
					if err == nil && info.IsDir() {
						sw.watchRecursive(event.Name)
					}
				}
			}

		case err, ok := <-sw.watcher.Errors:
			if !ok {
				return
			}
			log.Printf("Watcher error: %v\n", err)

		case <-sw.stopChan:
			return
		}
	}
}

func (sw *SyncWorker) setupWatcher() {
	if sw.watcher == nil {
		return
	}

	// Watch the root storage directory
	if err := sw.watcher.Add(sw.storage.Root); err != nil {
		log.Printf("Failed to watch storage root: %v\n", err)
	}

	// Watch all existing buckets and subdirectories recursively
	sw.watchRecursive(sw.storage.Root)
}

func (sw *SyncWorker) watchRecursive(path string) {
	if sw.watcher == nil {
		return
	}

	_ = filepath.Walk(path, func(walkPath string, info os.FileInfo, err error) error {
		if err != nil {
			return nil
		}
		if info.IsDir() {
			// Skip internal/hidden directories
			name := info.Name()
			if strings.HasPrefix(name, ".") && walkPath != sw.storage.Root {
				return filepath.SkipDir
			}
			_ = sw.watcher.Add(walkPath)
		}
		return nil
	})
}

func (sw *SyncWorker) markDirty(path string) {
	// Skip internal directories like .cas, .trash
	rel, err := filepath.Rel(sw.storage.Root, path)
	if err == nil && (strings.HasPrefix(rel, ".") || strings.Contains(rel, "/.")) {
		return
	}

	sw.mu.Lock()
	sw.dirtyPaths[path] = time.Now()
	sw.mu.Unlock()
}

func (sw *SyncWorker) processDirtyPaths() {
	now := time.Now()
	debounceDuration := time.Duration(sw.debounceMs) * time.Millisecond

	bucketsToSync := make(map[string]bool)

	sw.mu.Lock()
	for path, timestamp := range sw.dirtyPaths {
		if now.Sub(timestamp) >= debounceDuration {
			delete(sw.dirtyPaths, path)

			// Extract affected bucket from path
			rel, err := filepath.Rel(sw.storage.Root, path)
			if err == nil && rel != "." && !strings.HasPrefix(rel, ".") {
				parts := strings.Split(filepath.ToSlash(rel), "/")
				if len(parts) > 0 && parts[0] != "" {
					bucketsToSync[parts[0]] = true
				}
			}
		}
	}
	sw.mu.Unlock()

	// Sync each affected bucket in non-blocking background goroutines
	for b := range bucketsToSync {
		bucket := b
		go func() {
			log.Printf("Event-driven sync triggered for bucket: %s\n", bucket)
			_, _ = sw.SyncBucket(bucket)
		}()
	}
}

// SyncBucket synchronizes a single bucket from filesystem to database fast & non-blockingly
func (sw *SyncWorker) SyncBucket(bucketName string) (*SyncResult, error) {
	if sw.storage.DB == nil {
		return nil, fmt.Errorf("database not available")
	}

	if !sw.tryStartSync(bucketName) {
		return &SyncResult{
			Bucket:   bucketName,
			Duration: "in-progress",
		}, nil
	}
	defer sw.finishSync(bucketName)

	startTime := time.Now()
	bucketPath := filepath.Join(sw.storage.Root, bucketName)
	if fi, err := os.Stat(bucketPath); err != nil || !fi.IsDir() {
		return nil, fmt.Errorf("bucket directory '%s' does not exist on filesystem", bucketName)
	}

	// Ensure bucket exists in database
	exists, _ := sw.storage.DB.BucketExists(bucketName)
	if !exists {
		if err := sw.storage.DB.CreateBucket(bucketName, "admin"); err != nil {
			return nil, fmt.Errorf("failed to create bucket in database: %w", err)
		}
	}

	synced, errors, pruned := sw.syncSingleBucket(bucketName)

	// Invalidate cache for this bucket
	if sw.storage.Cache != nil {
		sw.storage.Cache.DeleteByPrefix("objects:" + bucketName + ":")
		sw.storage.Cache.Delete(cache.BucketListKey())
	}

	return &SyncResult{
		Bucket:   bucketName,
		Synced:   synced,
		Errors:   errors,
		Pruned:   pruned,
		Duration: time.Since(startTime).Round(time.Millisecond).String(),
	}, nil
}

// SyncAllBuckets synchronizes all buckets from filesystem to database
func (sw *SyncWorker) SyncAllBuckets() (*SyncResult, error) {
	if sw.storage.DB == nil {
		return nil, fmt.Errorf("database not available")
	}

	if !sw.tryStartSync("*") {
		return &SyncResult{
			Duration: "in-progress",
		}, nil
	}
	defer sw.finishSync("*")

	log.Println("Starting full filesystem sync...")
	startTime := time.Now()

	totalSynced := 0
	totalErrors := 0
	totalPruned := 0
	affectedBuckets := make(map[string]bool)

	// Walk through all buckets
	buckets, err := os.ReadDir(sw.storage.Root)
	if err != nil {
		log.Printf("Sync error reading root: %v\n", err)
		return nil, fmt.Errorf("failed to read storage root: %w", err)
	}

	for _, bucketEntry := range buckets {
		if !bucketEntry.IsDir() || strings.HasPrefix(bucketEntry.Name(), ".") {
			continue
		}

		bucketName := bucketEntry.Name()

		// Ensure bucket exists in database
		exists, _ := sw.storage.DB.BucketExists(bucketName)
		if !exists {
			_ = sw.storage.DB.CreateBucket(bucketName, "admin")
		}

		synced, errs, pruned := sw.syncSingleBucket(bucketName)
		totalSynced += synced
		totalErrors += errs
		totalPruned += pruned
		affectedBuckets[bucketName] = true
	}

	// Prune orphaned buckets (directories that were removed on disk)
	sw.pruneOrphanedBuckets()

	// Invalidate cache for affected buckets
	if sw.storage.Cache != nil {
		for bucket := range affectedBuckets {
			sw.storage.Cache.DeleteByPrefix("objects:" + bucket + ":")
		}
		sw.storage.Cache.Delete(cache.BucketListKey())
	}

	duration := time.Since(startTime).Round(time.Millisecond)
	log.Printf("Filesystem sync completed: %d objects synced, %d errors, %d pruned in %v\n", totalSynced, totalErrors, totalPruned, duration)

	return &SyncResult{
		Synced:   totalSynced,
		Errors:   totalErrors,
		Pruned:   totalPruned,
		Duration: duration.String(),
	}, nil
}

// syncSingleBucket performs fast in-memory batch synchronization and pruning for a single bucket
func (sw *SyncWorker) syncSingleBucket(bucketName string) (int, int, int) {
	bucketPath := filepath.Join(sw.storage.Root, bucketName)
	synced := 0
	errors := 0
	pruned := 0

	// 1. Batch load all existing objects for this bucket in ONE query
	existingObjs, err := sw.storage.DB.ListAllObjectsByBucket(bucketName)
	if err != nil {
		log.Printf("Sync error prefetching objects for bucket %s: %v\n", bucketName, err)
		existingObjs = nil
	}

	dbMap := make(map[string]*database.ObjectRow, len(existingObjs))
	for _, obj := range existingObjs {
		dbMap[obj.Key+"\x00"+obj.VersionID] = obj
	}
	visitedKeys := make(map[string]bool, len(existingObjs))

	// 2. Walk filesystem and compare directly against in-memory map
	_ = filepath.Walk(bucketPath, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return nil
		}

		// Skip bucket root
		if path == bucketPath {
			return nil
		}

		// Skip hidden files/directories (like .trash, .cas, .tmp-*, etc.)
		name := info.Name()
		if strings.HasPrefix(name, ".") || strings.Contains(name, ".tmp-") {
			if info.IsDir() {
				return filepath.SkipDir
			}
			return nil
		}

		relPath, rErr := filepath.Rel(bucketPath, path)
		if rErr != nil || relPath == "." {
			return nil
		}
		relPath = filepath.ToSlash(relPath)

		// Handle directories
		if info.IsDir() {
			latestPath := filepath.Join(path, "latest")
			if _, err := os.Stat(latestPath); err != nil {
				// Directory placeholder
				folderKey := relPath + "/"
				mapKey := folderKey + "\x00folder"
				visitedKeys[mapKey] = true

				dbObj := dbMap[mapKey]
				if dbObj == nil {
					contentType := "application/x-directory"
					objectRow := &database.ObjectRow{
						Bucket:      bucketName,
						Key:         folderKey,
						VersionID:   "folder",
						Size:        0,
						IsLatest:    true,
						ContentType: &contentType,
					}
					_, err := sw.storage.DB.CreateObject(objectRow)
					if err == nil {
						synced++
						log.Printf("Indexed folder placeholder: %s/%s\n", bucketName, folderKey)
					} else {
						errors++
					}
				} else if dbObj.DeletedAt != nil {
					_ = sw.storage.DB.RestoreObject(bucketName, folderKey, "folder")
					synced++
					log.Printf("Restored folder placeholder: %s/%s\n", bucketName, folderKey)
				}
				return nil
			}

			// Versioned container with "latest" file
			versionData, err := os.ReadFile(latestPath)
			if err != nil {
				errors++
				return nil
			}
			versionID := strings.TrimSpace(string(versionData))
			versionPath := filepath.Join(path, versionID)
			versionInfo, err := os.Stat(versionPath)
			if err != nil {
				if os.IsNotExist(err) {
					entries, readErr := os.ReadDir(path)
					if readErr == nil {
						var newestFile os.FileInfo
						var newestName string
						for _, entry := range entries {
							if entry.IsDir() || entry.Name() == "latest" {
								continue
							}
							i, iErr := entry.Info()
							if iErr == nil && (newestFile == nil || i.ModTime().After(newestFile.ModTime())) {
								newestFile = i
								newestName = entry.Name()
							}
						}
						if newestName != "" {
							_ = os.WriteFile(latestPath, []byte(newestName), 0644)
							versionID = newestName
							versionPath = filepath.Join(path, versionID)
							versionInfo, err = os.Stat(versionPath)
						}
					}
				}
				if err != nil {
					errors++
					return filepath.SkipDir
				}
			}

			mapKey := relPath + "\x00" + versionID
			visitedKeys[mapKey] = true

			dbObj := dbMap[mapKey]
			contentType := mime.TypeByExtension(filepath.Ext(relPath))
			if contentType == "" {
				contentType = "application/octet-stream"
			}

			if dbObj == nil || dbObj.Size != versionInfo.Size() {
				objectRow := &database.ObjectRow{
					Bucket:      bucketName,
					Key:         relPath,
					VersionID:   versionID,
					Size:        versionInfo.Size(),
					ETag:        &versionID,
					ContentType: &contentType,
					IsLatest:    true,
				}
				_, err := sw.storage.DB.CreateObject(objectRow)
				if err == nil {
					synced++
				} else {
					errors++
				}
			} else if dbObj.DeletedAt != nil {
				_ = sw.storage.DB.RestoreObject(bucketName, relPath, versionID)
				synced++
			} else if !dbObj.IsLatest {
				_ = sw.storage.DB.UpdateObjectLatest(bucketName, relPath, versionID, true)
				synced++
			}

			return filepath.SkipDir
		}

		// Handle regular non-versioned file
		if name == "latest" {
			return nil
		}

		mapKey := relPath + "\x00simple"
		visitedKeys[mapKey] = true

		dbObj := dbMap[mapKey]
		contentType := mime.TypeByExtension(filepath.Ext(relPath))
		if contentType == "" {
			contentType = "application/octet-stream"
		}

		if dbObj == nil || dbObj.Size != info.Size() {
			objectRow := &database.ObjectRow{
				Bucket:      bucketName,
				Key:         relPath,
				VersionID:   "simple",
				Size:        info.Size(),
				ETag:        &relPath,
				ContentType: &contentType,
				IsLatest:    true,
			}
			_, err := sw.storage.DB.CreateObject(objectRow)
			if err == nil {
				synced++
			} else {
				errors++
			}
		} else if dbObj.DeletedAt != nil {
			_ = sw.storage.DB.RestoreObject(bucketName, relPath, "simple")
			synced++
		} else if !dbObj.IsLatest {
			_ = sw.storage.DB.UpdateObjectLatest(bucketName, relPath, "simple", true)
			synced++
		}

		return nil
	})

	// 3. Fast in-memory prune of records missing on disk
	for _, obj := range existingObjs {
		if obj.DeletedAt != nil {
			continue
		}
		mapKey := obj.Key + "\x00" + obj.VersionID
		if !visitedKeys[mapKey] {
			if err := sw.storage.DB.DeleteObject(obj.Bucket, obj.Key, obj.VersionID); err == nil {
				pruned++
			}
		}
	}

	return synced, errors, pruned
}

func (sw *SyncWorker) pruneOrphanedBuckets() {
	buckets, err := sw.storage.DB.ListBuckets()
	if err != nil {
		log.Printf("Prune error listing buckets: %v\n", err)
		return
	}

	prunedCount := 0
	for _, bucketName := range buckets {
		bucketPath := filepath.Join(sw.storage.Root, bucketName)
		if _, err := os.Stat(bucketPath); os.IsNotExist(err) {
			// Bucket directory missing, prune from database
			err := sw.storage.DB.DeleteBucket(bucketName)
			if err != nil {
				log.Printf("Prune error deleting bucket %s: %v\n", bucketName, err)
			} else {
				prunedCount++
				log.Printf("Pruned orphaned bucket: %s\n", bucketName)
			}
		}
	}

	if prunedCount > 0 {
		log.Printf("Filesystem sync: pruned %d orphaned bucket records\n", prunedCount)
		if sw.storage.Cache != nil {
			sw.storage.Cache.Delete(cache.BucketListKey())
		}
	}
}
