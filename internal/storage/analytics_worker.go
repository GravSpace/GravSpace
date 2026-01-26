package storage

import (
	"log"
	"time"

	"github.com/GravSpace/GravSpace/internal/database"
)

type AnalyticsWorker struct {
	db      *database.Database
	storage Storage
}

func NewAnalyticsWorker(db *database.Database, storage Storage) *AnalyticsWorker {
	return &AnalyticsWorker{
		db:      db,
		storage: storage,
	}
}

func (w *AnalyticsWorker) Start() {
	// Run immediately on start to ensure we have today's data (if needed)
	w.takeSnapshot()

	// Then run daily
	go func() {
		ticker := time.NewTicker(24 * time.Hour)
		for range ticker.C {
			w.takeSnapshot()
		}
	}()
}

func (w *AnalyticsWorker) takeSnapshot() {
	buckets, err := w.storage.ListBuckets()
	if err != nil {
		log.Printf("Analytics snapshot failed to list buckets: %v", err)
		return
	}

	for _, bucket := range buckets {
		_, size, err := w.storage.GetBucketStats(bucket)
		if err != nil {
			log.Printf("Analytics snapshot failed for bucket %s: %v", bucket, err)
			continue
		}

		err = w.db.CreateStorageSnapshot(bucket, size)
		if err != nil {
			log.Printf("Analytics snapshot storage failed for bucket %s: %v", bucket, err)
		}
	}
	log.Printf("Analytics storage snapshots captured for %d buckets", len(buckets))
}

func (w *AnalyticsWorker) getBucketStats(bucket string) (int, int64, error) {
	// Query DB for total size and count
	// This is more accurate than relying on in-memory gauges for snapshots

	// We'll use the GetGlobalStats logic but filtered by bucket if needed,
	// or just the existing engine metrics if they are reliable enough.
	// For now, let's implement a direct query in FileStorage or just use engine.
	return 0, 0, nil // Placeholder, will fix integration
}
