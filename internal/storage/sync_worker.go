package storage

import (
	"log"
	"os"
	"path/filepath"
	"time"

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
			if err != nil || !info.IsDir() {
				return err
			}

			// Check if this is an object directory (has 'latest' file)
			latestPath := filepath.Join(path, "latest")
			if _, err := os.Stat(latestPath); err != nil {
				return nil // Not an object directory
			}

			// Get relative key
			relPath, _ := filepath.Rel(bucketPath, path)
			if relPath == "." {
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
		log.Printf("Filesystem sync: pruned %d orphaned database records\n", prunedCount)
	}
}
