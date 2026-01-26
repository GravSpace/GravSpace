package storage

import (
	"log"
	"os"
	"path/filepath"
	"time"

	"github.com/GravSpace/GravSpace/internal/cache"
	"github.com/GravSpace/GravSpace/internal/database"
)

// SyncWorker handles periodic filesystem-to-database synchronization
type SyncWorker struct {
	storage  *FileStorage
	interval time.Duration
	stopChan chan bool
}

// NewSyncWorker creates a new sync worker
func NewSyncWorker(storage *FileStorage, interval time.Duration) *SyncWorker {
	return &SyncWorker{
		storage:  storage,
		interval: interval,
		stopChan: make(chan bool),
	}
}

// Start begins the sync worker
func (sw *SyncWorker) Start() {
	go sw.run()
}

// Stop stops the sync worker
func (sw *SyncWorker) Stop() {
	sw.stopChan <- true
}

func (sw *SyncWorker) run() {
	ticker := time.NewTicker(sw.interval)
	defer ticker.Stop()

	// Run initial sync
	sw.syncFilesystemToDatabase()

	for {
		select {
		case <-ticker.C:
			sw.syncFilesystemToDatabase()
		case <-sw.stopChan:
			return
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
		if !bucketEntry.IsDir() || bucketEntry.Name() == ".versions" {
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

				// Check if object exists in database
				dbObj, err := sw.storage.DB.GetObject(bucketName, relPath, "simple")
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
				}
				return nil
			}

			// Handle versioned objects (directories with 'latest' file)
			latestPath := filepath.Join(path, "latest")
			if _, err := os.Stat(latestPath); err != nil {
				return nil // Not an object directory
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
				log.Printf("Sync error stating version %s for %s: %v\n", versionID, relPath, err)
				errors++
				return nil
			}

			// Check if object exists in database
			dbObj, err := sw.storage.DB.GetObject(bucketName, relPath, versionID)
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
		objectDir := filepath.Join(sw.storage.Root, obj.Bucket, obj.Key)
		versionPath := filepath.Join(objectDir, obj.VersionID)

		// Special case for simple (no versioning)
		if obj.VersionID == "simple" {
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
