package database

import (
	"path/filepath"
	"testing"
)

func TestCreateObjectUpsert(t *testing.T) {
	root := t.TempDir()
	dbPath := filepath.Join(root, "test.db")
	db, err := NewDatabase(dbPath)
	if err != nil {
		t.Fatalf("Failed to initialize database: %v", err)
	}

	bucket := "test-bucket"
	err = db.CreateBucket(bucket, "admin")
	if err != nil {
		t.Fatalf("Failed to create bucket: %v", err)
	}

	key := "test-file.txt"
	versionID := "simple"
	contentType := "text/plain"

	// 1. Initial object creation
	obj := &ObjectRow{
		Bucket:      bucket,
		Key:         key,
		VersionID:   versionID,
		Size:        100,
		ContentType: &contentType,
		IsLatest:    true,
	}

	_, err = db.CreateObject(obj)
	if err != nil {
		t.Fatalf("First CreateObject failed: %v", err)
	}

	resObj, err := db.GetObject(bucket, key, versionID)
	if err != nil || resObj == nil {
		t.Fatalf("Failed to get object after insert: %v", err)
	}
	if resObj.Size != 100 {
		t.Errorf("Expected size 100, got %d", resObj.Size)
	}

	// 2. Overwrite the same object with same (bucket, key, version_id)
	obj2 := &ObjectRow{
		Bucket:      bucket,
		Key:         key,
		VersionID:   versionID,
		Size:        250,
		ContentType: &contentType,
		IsLatest:    true,
	}

	_, err = db.CreateObject(obj2)
	if err != nil {
		t.Fatalf("Second CreateObject (upsert) failed: %v", err)
	}

	resObj2, err := db.GetObject(bucket, key, versionID)
	if err != nil || resObj2 == nil {
		t.Fatalf("Failed to get object after upsert: %v", err)
	}
	if resObj2.Size != 250 {
		t.Errorf("Expected updated size 250, got %d", resObj2.Size)
	}

	// 3. Test overwrite when object was soft-deleted
	err = db.SoftDeleteObject(bucket, key, versionID)
	if err != nil {
		t.Fatalf("SoftDeleteObject failed: %v", err)
	}

	// Overwrite should clear deleted_at and restore to active
	obj3 := &ObjectRow{
		Bucket:      bucket,
		Key:         key,
		VersionID:   versionID,
		Size:        500,
		ContentType: &contentType,
		IsLatest:    true,
	}
	_, err = db.CreateObject(obj3)
	if err != nil {
		t.Fatalf("CreateObject on soft-deleted object failed: %v", err)
	}

	resObj3, err := db.GetObject(bucket, key, versionID)
	if err != nil || resObj3 == nil {
		t.Fatalf("Failed to get active object after re-upload: %v", err)
	}
	if resObj3.DeletedAt != nil {
		t.Errorf("Expected deleted_at to be nil after overwrite")
	}
	if resObj3.Size != 500 {
		t.Errorf("Expected size 500, got %d", resObj3.Size)
	}
}
