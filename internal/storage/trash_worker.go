package storage

import (
	"log"
	"time"

	"github.com/GravSpace/GravSpace/internal/database"
)

type TrashWorker struct {
	db    *database.Database
	store *FileStorage
}

func NewTrashWorker(db *database.Database, store *FileStorage) *TrashWorker {
	return &TrashWorker{
		db:    db,
		store: store,
	}
}

func (w *TrashWorker) Start() {
	// Simple worker that runs every hour
	go func() {
		ticker := time.NewTicker(1 * time.Hour)
		defer ticker.Stop()

		for range ticker.C {
			w.ProcessTrash()
		}
	}()
	log.Println("Trash worker started (Interval: 1 hour)")
}

func (w *TrashWorker) ProcessTrash() {
	buckets, err := w.db.ListBuckets()
	if err != nil {
		log.Printf("Trash worker error listing buckets: %v", err)
		return
	}

	for _, bName := range buckets {
		bucket, err := w.db.GetBucket(bName)
		if err != nil || bucket == nil || !bucket.SoftDeleteEnabled {
			continue
		}

		// Find soft deleted objects in this bucket
		objects, err := w.db.ListTrashObjects(bName, "")
		if err != nil {
			log.Printf("Trash worker error listing trash for bucket %s: %v", bName, err)
			continue
		}

		now := time.Now()
		retentionDuration := time.Duration(bucket.SoftDeleteRetention) * 24 * time.Hour

		for _, obj := range objects {
			if obj.DeletedAt == nil {
				continue
			}

			if now.Sub(*obj.DeletedAt) > retentionDuration {
				log.Printf("Trash worker: permanently deleting expired object %s/%s (version: %s)", obj.Bucket, obj.Key, obj.VersionID)
				if err := w.store.DeleteTrashObject(obj.Bucket, obj.Key, obj.VersionID); err != nil {
					log.Printf("Trash worker error deleting object %s: %v", obj.Key, err)
				}
			}
		}
	}
}
