package storage

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/GravSpace/GravSpace/internal/database"
)

func TestSoftDeleteWorkflow(t *testing.T) {
	root := t.TempDir()
	dbPath := filepath.Join(root, "test.db")
	db, _ := database.NewDatabase(dbPath)

	store := &FileStorage{
		Root: root,
		DB:   db,
	}

	bucket := "recycle-test"
	store.CreateBucket(bucket)
	db.SetBucketSoftDelete(bucket, true, 30)

	key := "test.txt"
	content := "hello world"
	store.PutObject(bucket, key, strings.NewReader(content), "")

	// Verify file exists
	if _, err := os.Stat(filepath.Join(root, bucket, key)); err != nil {
		t.Fatalf("File should exist before delete")
	}

	// Delete
	err := store.DeleteObject(bucket, key, "", false)
	if err != nil {
		t.Fatalf("DeleteObject failed: %v", err)
	}

	// Verify file moved to trash
	// Important: Simple objects use "simple" version ID internally
	trashFile := filepath.Join(root, ".trash", bucket, key, "simple")
	if _, err := os.Stat(trashFile); err != nil {
		t.Errorf("File should be in trash path %s: %v", trashFile, err)
	}

	// Verify DB entry is in trash
	trashItems, _ := db.ListTrashObjects(bucket, "")
	if len(trashItems) == 0 {
		t.Errorf("Trash should not be empty")
	} else {
		found := false
		for _, item := range trashItems {
			if item.Key == key {
				found = true
				if item.DeletedAt == nil {
					t.Errorf("Object in trash should have deleted_at set")
				}
				break
			}
		}
		if !found {
			t.Errorf("Deleted object not found in trash items")
		}
	}
}
