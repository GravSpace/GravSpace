package storage

import (
	"fmt"
	"log"
	"time"

	"github.com/GravSpace/GravSpace/internal/database"
	"github.com/GravSpace/GravSpace/internal/jobs"
)

type AnalyticsWorker struct {
	db      *database.Database
	storage Storage
	jobs    *jobs.Manager
}

func NewAnalyticsWorker(db *database.Database, storage Storage, jobs *jobs.Manager) *AnalyticsWorker {
	return &AnalyticsWorker{
		db:      db,
		storage: storage,
		jobs:    jobs,
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
		// Enqueue snapshot job for each bucket to process in background
		if w.jobs != nil {
			w.jobs.Enqueue(&AnalyticsSnapshotJob{
				DB:      w.db,
				Storage: w.storage,
				Bucket:  bucket,
			})
		}
	}
	log.Printf("Analytics snapshot jobs enqueued for %d buckets", len(buckets))
}

// AnalyticsSnapshotJob implements jobs.Job for background analytics snapshots
type AnalyticsSnapshotJob struct {
	DB      *database.Database
	Storage Storage
	Bucket  string
}

func (j *AnalyticsSnapshotJob) Name() string {
	return "AnalyticsSnapshot:" + j.Bucket
}

func (j *AnalyticsSnapshotJob) Execute() error {
	_, size, err := j.Storage.GetBucketStats(j.Bucket)
	if err != nil {
		return fmt.Errorf("analytics snapshot failed for bucket %s: %w", j.Bucket, err)
	}

	exists, err := j.DB.HasSnapshotForToday(j.Bucket)
	if err != nil {
		return fmt.Errorf("analytics snapshot check failed for bucket %s: %w", j.Bucket, err)
	}
	if exists {
		return nil
	}

	return j.DB.CreateStorageSnapshot(j.Bucket, size)
}

func (w *AnalyticsWorker) getBucketStats(bucket string) (int, int64, error) {
	// Query DB for total size and count
	// This is more accurate than relying on in-memory gauges for snapshots

	// We'll use the GetGlobalStats logic but filtered by bucket if needed,
	// or just the existing engine metrics if they are reliable enough.
	// For now, let's implement a direct query in FileStorage or just use engine.
	return 0, 0, nil // Placeholder, will fix integration
}
