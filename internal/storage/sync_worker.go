package storage

import (
	"log"
	"os"
	"path/filepath"
	"time"

	"github.com/GravSpace/GravSpace/internal/cache"
	"github.com/GravSpace/GravSpace/internal/database"
	"github.com/fsnotify/fsnotify"
)

// SyncWorker handles periodic and event-driven filesystem-to-database synchronization
type SyncWorker struct {
	storage    *FileStorage
	interval   time.Duration
	stopChan   chan bool
	watcher    *fsnotify.Watcher
	debounceMs int
	dirtyPaths map[string]time.Time
}

// NewSyncWorker creates a new sync worker with 2s default debouncing
func NewSyncWorker(storage *FileStorage, interval time.Duration) *SyncWorker {
	watcher, err := fsnotify.NewWatcher()
	if err != nil {
		log.Printf("Failed to create fsnotify watcher: %v\n", err)
	}

	return &SyncWorker{
		storage:    storage,
		interval:   interval,
		stopChan:   make(chan bool),
		watcher:    watcher,
		debounceMs: 2000,
		dirtyPaths: make(map[string]time.Time),
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

func (sw *SyncWorker) run() {
	// Start watching root and buckets
	sw.setupWatcher()

	ticker := time.NewTicker(sw.interval)
	defer ticker.Stop()

	debounceTicker := time.NewTicker(500 * time.Millisecond)
	defer debounceTicker.Stop()

	// Run initial sync
	sw.syncFilesystemToDatabase()

	for {
		select {
		case <-ticker.C:
			// Full periodic sync fallback
			sw.syncFilesystemToDatabase()

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

	// Watch root directory for new buckets
	sw.watcher.Add(sw.storage.Root)

	// Recursively watch all buckets
	buckets, err := os.ReadDir(sw.storage.Root)
	if err != nil {
		return
	}

	for _, d := range buckets {
		if d.IsDir() && d.Name() != ".versions" && d.Name() != ".trash" {
			sw.watchRecursive(filepath.Join(sw.storage.Root, d.Name()))
		}
	}
}

func (sw *SyncWorker) watchRecursive(path string) {
	if sw.watcher == nil {
		return
	}

	err := filepath.Walk(path, func(walkPath string, info os.FileInfo, err error) error {
		if err != nil {
			return nil
		}
		if info.IsDir() {
			// Skip special dirs
			name := info.Name()
			if name == ".versions" || name == ".trash" || name == ".uploads" {
				return filepath.SkipDir
			}
			sw.watcher.Add(walkPath)
		}
		return nil
	})

	if err != nil {
		log.Printf("Watcher recursive add error for %s: %v\n", path, err)
	}
}

func (sw *SyncWorker) markDirty(path string) {
	sw.dirtyPaths[path] = time.Now()
}

func (sw *SyncWorker) processDirtyPaths() {
	if len(sw.dirtyPaths) == 0 {
		return
	}

	now := time.Now()
	threshold := time.Duration(sw.debounceMs) * time.Millisecond

	for path, lastEvent := range sw.dirtyPaths {
		if now.Sub(lastEvent) >= threshold {
			// Trigger sync for this specific component
			log.Printf("Event-driven sync triggered for: %s\n", path)
			delete(sw.dirtyPaths, path)

			// Simple approach: run the full sync logic but it will be faster
			// since it's targeted or just rely on the existing syncFilesystemToDatabase
			// which is already quite fast once it skips unchanged files.
			// For now, let's just trigger a full sync to ensure consistency.
			sw.syncFilesystemToDatabase()
			break // Only trigger once per cycle to avoid overlaps
		}
	}
}

func (sw *SyncWorker) syncFilesystemToDatabase() {
	if sw.storage.DB == nil {
		return
	}

	log.Println("Starting filesystem sync...")
	startTime := time.Now()

	synced := 0
	errors := 0

	// Walk through all buckets
	buckets, err := os.ReadDir(sw.storage.Root)
	if err != nil {
		log.Printf("Sync error reading root: %v\n", err)
		return
	}

	for _, bucketEntry := range buckets {
		if !bucketEntry.IsDir() || bucketEntry.Name() == ".versions" || bucketEntry.Name() == ".trash" {
			continue
		}

		bucketName := bucketEntry.Name()

		// Ensure bucket exists in database
		exists, _ := sw.storage.DB.BucketExists(bucketName)
		if !exists {
			sw.storage.DB.CreateBucket(bucketName, "admin")
		}

		// Sync objects in this bucket
		bucketPath := filepath.Join(sw.storage.Root, bucketName)
		err := filepath.Walk(bucketPath, func(path string, info os.FileInfo, err error) error {
			if err != nil {
				return err
			}

			// Skip the bucket root itself
			if path == bucketPath {
				return nil
			}

			// Get relative key
			relPath, _ := filepath.Rel(bucketPath, path)
			if relPath == "." {
				return nil
			}

			// Handle regular files (non-versioned)
			if !info.IsDir() {
				// Skip special files
				if info.Name() == "latest" {
					return nil
				}

				// Check if object exists in database (including deleted)
				dbObj, err := sw.storage.DB.GetObjectIncludeDeleted(bucketName, relPath, "simple")
				if err != nil {
					log.Printf("Sync error checking object %s in DB: %v\n", relPath, err)
					errors++
					return nil
				}

				if dbObj == nil {
					// Object not in database, add it
					contentType := "application/octet-stream"
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
						log.Printf("Sync error creating object %s in DB: %v\n", relPath, err)
						errors++
					}
				} else if dbObj.DeletedAt != nil {
					// Object is marked as deleted but file exists in bucket, un-delete it
					err := sw.storage.DB.RestoreObject(bucketName, relPath, "simple")
					if err == nil {
						synced++
						log.Printf("Ghost object detected: un-deleted %s/%s\n", bucketName, relPath)
					} else {
						log.Printf("Sync error restoring ghost object %s: %v\n", relPath, err)
						errors++
					}
				}
				return nil
			}

			// Handle versioned objects or organizational directories
			latestPath := filepath.Join(path, "latest")
			if _, err := os.Stat(latestPath); err != nil {
				// This is a directory but not a versioned object container.
				// Index it as a folder placeholder if it's not a special dir.
				folderKey := relPath + "/"
				dbObj, _ := sw.storage.DB.GetObjectIncludeDeleted(bucketName, folderKey, "folder")
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
					sw.storage.DB.CreateObject(objectRow)
					synced++
					log.Printf("Indexed folder placeholder: %s/%s\n", bucketName, folderKey)
				}
				return nil
			}

			// Read latest version
			versionData, err := os.ReadFile(latestPath)
			if err != nil {
				log.Printf("Sync error reading latest for %s: %v\n", relPath, err)
				errors++
				return nil
			}
			versionID := string(versionData)

			// Get file info
			versionPath := filepath.Join(path, versionID)
			versionInfo, err := os.Stat(versionPath)
			if err != nil {
				if os.IsNotExist(err) {
					log.Printf("Warning: Latest version %s for %s missing. Attempting repair...", versionID, relPath)

					entries, readErr := os.ReadDir(path)
					if readErr == nil {
						var newestFile os.FileInfo
						var newestName string

						for _, entry := range entries {
							if entry.IsDir() || entry.Name() == "latest" {
								continue
							}
							info, iErr := entry.Info()
							if iErr != nil {
								continue
							}

							if newestFile == nil || info.ModTime().After(newestFile.ModTime()) {
								newestFile = info
								newestName = entry.Name()
							}
						}

						if newestName != "" {
							// Update latest pointer
							if wErr := os.WriteFile(latestPath, []byte(newestName), 0644); wErr == nil {
								log.Printf("Repaired: Promoted %s to latest for %s", newestName, relPath)
								versionID = newestName
								versionPath = filepath.Join(path, versionID)
								versionInfo, err = os.Stat(versionPath) // Retry stat
							} else {
								log.Printf("Failed to write repaired latest file: %v", wErr)
							}
						} else {
							// No versions found, remove broken pointer
							os.Remove(latestPath)
							log.Printf("Removed broken latest pointer for %s (no versions found)", relPath)
							return filepath.SkipDir // Treat as deleted
						}
					}
				}

				if err != nil {
					log.Printf("Sync error stating version %s for %s: %v\n", versionID, relPath, err)
					errors++
					return filepath.SkipDir
				}
			}

			// Check if object exists in database (including deleted)
			dbObj, err := sw.storage.DB.GetObjectIncludeDeleted(bucketName, relPath, versionID)
			if err != nil {
				log.Printf("Sync error checking object %s in DB: %v\n", relPath, err)
				errors++
				return nil
			}

			if dbObj == nil {
				// Object not in database, add it
				contentType := "application/octet-stream"
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
					log.Printf("Sync error creating object %s in DB: %v\n", relPath, err)
					errors++
				}
			} else if dbObj.DeletedAt != nil {
				// Object is marked as deleted but file exists in bucket, un-delete it
				err := sw.storage.DB.RestoreObject(bucketName, relPath, versionID)
				if err == nil {
					synced++
					log.Printf("Ghost object detected: un-deleted %s/%s\n", bucketName, relPath)
				} else {
					log.Printf("Sync error restoring ghost object %s: %v\n", relPath, err)
					errors++
				}
			} else if !dbObj.IsLatest {
				// Object exists but is_latest is wrong, fix it
				err := sw.storage.DB.UpdateObjectLatest(bucketName, relPath, versionID, true)
				if err == nil {
					synced++
					log.Printf("Fixed is_latest for %s/%s\n", bucketName, relPath)
				} else {
					log.Printf("Sync error updating is_latest for %s: %v\n", relPath, err)
					errors++
				}
			}

			return filepath.SkipDir // Don't descend into object directories
		})

		if err != nil {
			log.Printf("Error syncing bucket %s: %v\n", bucketName, err)
		}
	}

	duration := time.Since(startTime)
	log.Printf("Filesystem sync completed: %d objects synced, %d errors in %v\n", synced, errors, duration)

	// Prune orphaned records
	sw.pruneOrphanedRecords()
	sw.pruneOrphanedBuckets()
}

func (sw *SyncWorker) pruneOrphanedRecords() {
	objs, err := sw.storage.DB.ListAllObjects()
	if err != nil {
		log.Printf("Prune error listing objects: %v\n", err)
		return
	}

	prunedCount := 0
	for _, obj := range objs {
		// Skip pruning for soft-deleted objects (they are in .trash, monitored by TrashWorker)
		if obj.DeletedAt != nil {
			continue
		}

		objectDir := filepath.Join(sw.storage.Root, obj.Bucket, obj.Key)
		versionPath := filepath.Join(objectDir, obj.VersionID)

		// Special cases for non-S3-standard versioning
		if obj.VersionID == "simple" || obj.VersionID == "folder" {
			versionPath = filepath.Join(sw.storage.Root, obj.Bucket, obj.Key)
		}

		if _, err := os.Stat(versionPath); os.IsNotExist(err) {
			// Physical file/directory missing, prune DB record
			err := sw.storage.DB.DeleteObject(obj.Bucket, obj.Key, obj.VersionID)
			if err != nil {
				log.Printf("Prune error deleting %s: %v\n", obj.Key, err)
			} else {
				prunedCount++
			}
		}
	}

	if prunedCount > 0 {
		log.Printf("Filesystem sync: pruned %d orphaned object records\n", prunedCount)
	}
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
		// Invalidate bucket list cache
		sw.storage.Cache.Delete(cache.BucketListKey())
	}
}
