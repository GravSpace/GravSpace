package storage

import (
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/GravSpace/GravSpace/internal/cache"
	"github.com/GravSpace/GravSpace/internal/database"
)

func TestManualSyncBucket(t *testing.T) {
	root := t.TempDir()
	dbPath := filepath.Join(root, "test.db")
	db, err := database.NewDatabase(dbPath)
	if err != nil {
		t.Fatalf("Failed to create test database: %v", err)
	}

	storageCache := cache.NewInMemoryCache()
	store := &FileStorage{
		Root:  root,
		DB:    db,
		Cache: storageCache,
	}
	syncWorker := NewSyncWorker(store, 1*time.Hour)
	store.SyncWorker = syncWorker

	bucket := "sync-test-bucket"

	// 1. Manually create folder structures and files directly on the filesystem (bypassing DB)
	bucketDir := filepath.Join(root, bucket)
	docDir := filepath.Join(bucketDir, "documents")
	subDir := filepath.Join(docDir, "subfolder")
	emptyDir := filepath.Join(bucketDir, "empty-folder")

	if err := os.MkdirAll(subDir, 0755); err != nil {
		t.Fatalf("Failed to create subDir: %v", err)
	}
	if err := os.MkdirAll(emptyDir, 0755); err != nil {
		t.Fatalf("Failed to create emptyDir: %v", err)
	}

	if err := os.WriteFile(filepath.Join(bucketDir, "top-level.txt"), []byte("top level content"), 0644); err != nil {
		t.Fatalf("Failed to write top-level.txt: %v", err)
	}
	if err := os.WriteFile(filepath.Join(docDir, "report.pdf"), []byte("%PDF-1.4 mock pdf"), 0644); err != nil {
		t.Fatalf("Failed to write report.pdf: %v", err)
	}
	if err := os.WriteFile(filepath.Join(subDir, "data.json"), []byte(`{"hello":"world"}`), 0644); err != nil {
		t.Fatalf("Failed to write data.json: %v", err)
	}

	// 2. Before sync, objects are not in database
	dbObjs, _ := db.ListObjects(bucket, "", "", 100)
	if len(dbObjs) != 0 {
		t.Errorf("Expected 0 objects before sync, got %d", len(dbObjs))
	}

	// 3. Trigger manual sync for the bucket
	res, err := store.SyncBucket(bucket)
	if err != nil {
		t.Fatalf("SyncBucket failed: %v", err)
	}

	if res.Synced < 4 {
		t.Errorf("Expected at least 4 synced items (files & folder placeholders), got %d", res.Synced)
	}

	// 4. Test ListObjects at root prefix
	objs, prefixes, err := store.ListObjects(bucket, "", "/", "")
	if err != nil {
		t.Fatalf("ListObjects failed: %v", err)
	}

	// Expected top-level object
	foundTopLevel := false
	for _, o := range objs {
		if o.Key == "top-level.txt" {
			foundTopLevel = true
			if o.Size != int64(len("top level content")) {
				t.Errorf("Expected size %d, got %d", len("top level content"), o.Size)
			}
		}
	}
	if !foundTopLevel {
		t.Errorf("top-level.txt not found in root listing")
	}

	// Expected common prefixes: "documents/", "empty-folder/"
	foundDocPrefix := false
	foundEmptyPrefix := false
	for _, p := range prefixes {
		if p == "documents/" {
			foundDocPrefix = true
		}
		if p == "empty-folder/" {
			foundEmptyPrefix = true
		}
	}
	if !foundDocPrefix {
		t.Errorf("documents/ prefix not found in root listing. Got: %v", prefixes)
	}
	if !foundEmptyPrefix {
		t.Errorf("empty-folder/ prefix not found in root listing. Got: %v", prefixes)
	}

	// 5. Test ListObjects inside "documents/"
	docObjs, docPrefixes, err := store.ListObjects(bucket, "documents/", "/", "")
	if err != nil {
		t.Fatalf("ListObjects for documents/ failed: %v", err)
	}

	foundReport := false
	for _, o := range docObjs {
		if o.Key == "documents/report.pdf" {
			foundReport = true
		}
	}
	if !foundReport {
		t.Errorf("documents/report.pdf not found in documents/ listing")
	}

	foundSubPrefix := false
	for _, p := range docPrefixes {
		if p == "documents/subfolder/" {
			foundSubPrefix = true
		}
	}
	if !foundSubPrefix {
		t.Errorf("documents/subfolder/ not found in documents/ listing. Got: %v", docPrefixes)
	}

	// 6. Test pruning: delete top-level.txt from disk directly
	if err := os.Remove(filepath.Join(bucketDir, "top-level.txt")); err != nil {
		t.Fatalf("Failed to remove file from disk: %v", err)
	}

	res2, err := store.SyncBucket(bucket)
	if err != nil {
		t.Fatalf("Second SyncBucket failed: %v", err)
	}
	if res2.Pruned != 1 {
		t.Errorf("Expected 1 pruned record, got %d", res2.Pruned)
	}

	// Verify top-level.txt is no longer returned
	objsAfterPrune, _, _ := store.ListObjects(bucket, "", "/", "")
	for _, o := range objsAfterPrune {
		if o.Key == "top-level.txt" {
			t.Errorf("top-level.txt was still found after pruning")
		}
	}
}

func TestImmediateFilesystemFolderDiscovery(t *testing.T) {
	root := t.TempDir()
	dbPath := filepath.Join(root, "test2.db")
	db, err := database.NewDatabase(dbPath)
	if err != nil {
		t.Fatalf("Failed to create test database: %v", err)
	}

	storageCache := cache.NewInMemoryCache()
	store := &FileStorage{
		Root:  root,
		DB:    db,
		Cache: storageCache,
	}
	syncWorker := NewSyncWorker(store, 1*time.Hour)
	store.SyncWorker = syncWorker

	bucket := "direct-fs-bucket"
	bucketDir := filepath.Join(root, bucket)
	newFolder := filepath.Join(bucketDir, "direct-folder")
	subFolder := filepath.Join(newFolder, "nested-folder")

	if err := os.MkdirAll(subFolder, 0755); err != nil {
		t.Fatalf("Failed to create folders: %v", err)
	}
	if err := os.WriteFile(filepath.Join(subFolder, "photo.jpg"), []byte("jpg content"), 0644); err != nil {
		t.Fatalf("Failed to write photo.jpg: %v", err)
	}

	// Without calling SyncBucket, ListObjects should immediately discover direct-folder/ on disk
	_, prefixes, err := store.ListObjects(bucket, "", "/", "")
	if err != nil {
		t.Fatalf("ListObjects failed: %v", err)
	}

	foundFolder := false
	for _, p := range prefixes {
		if p == "direct-folder/" {
			foundFolder = true
		}
	}
	if !foundFolder {
		t.Errorf("direct-folder/ was not immediately discovered from filesystem. Got prefixes: %v", prefixes)
	}

	// Inside direct-folder/
	_, subPrefixes, err := store.ListObjects(bucket, "direct-folder/", "/", "")
	if err != nil {
		t.Fatalf("ListObjects inside direct-folder/ failed: %v", err)
	}
	foundNested := false
	for _, p := range subPrefixes {
		if p == "direct-folder/nested-folder/" {
			foundNested = true
		}
	}
	if !foundNested {
		t.Errorf("direct-folder/nested-folder/ was not discovered. Got: %v", subPrefixes)
	}
}

