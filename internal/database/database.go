package database

import (
	"database/sql"
	"fmt"
	"os"
	"time"

	"github.com/GravSpace/GravSpace/internal/metrics"
	_ "github.com/tursodatabase/turso-go" // Turso driver (works for remote)
	_ "modernc.org/sqlite"                // SQLite driver (for local)
)

type Database struct {
	db *sql.DB
}

type BucketRow struct {
	Name              string
	CreatedAt         time.Time
	Owner             string
	VersioningEnabled bool
}

type ObjectRow struct {
	ID             int64
	Bucket         string
	Key            string
	VersionID      string
	Size           int64
	ETag           string
	ContentType    string
	ModifiedAt     time.Time
	IsLatest       bool
	EncryptionType string // SSE-S3 or empty
}

type ObjectTag struct {
	ObjectID int64
	TagKey   string
	TagValue string
}

type BucketConfig struct {
	Bucket          string
	CORSConfig      string // JSON
	LifecycleConfig string // JSON
}

type UserRecord struct {
	Username     string
	PasswordHash string
	CreatedAt    time.Time
}

type AccessKeyRecord struct {
	AccessKeyID     string
	SecretAccessKey string
	Username        string
	CreatedAt       time.Time
}

type PolicyRecord struct {
	ID        int64
	Username  string
	Name      string
	Data      string // JSON
	CreatedAt time.Time
}

// NewDatabase creates a new database connection
// Supports both local SQLite and Turso remote database
//
// For local SQLite:
//
//	dbPath = "file:./data/metadata.db"
//
// For Turso:
//
//	dbPath = "libsql://[your-database].turso.io?authToken=[your-token]"
//
// Environment variables:
//
//	TURSO_DATABASE_URL - Turso database URL
//	TURSO_AUTH_TOKEN - Turso authentication token
func NewDatabase(dbPath string) (*Database, error) {
	// Check for Turso environment variables
	tursoURL := os.Getenv("TURSO_DATABASE_URL")
	tursoToken := os.Getenv("TURSO_AUTH_TOKEN")

	var db *sql.DB
	var err error

	if tursoURL != "" && tursoToken != "" {
		// Use Turso remote database
		connStr := fmt.Sprintf("%s?authToken=%s", tursoURL, tursoToken)
		db, err = sql.Open("turso", connStr)
		if err != nil {
			return nil, fmt.Errorf("failed to connect to Turso remote: %w", err)
		}
		fmt.Println("Connected to Turso remote database")
	} else {
		// Use local SQLite
		if dbPath == "" {
			dbPath = "./data/metadata.db"
		}
		db, err = sql.Open("sqlite", dbPath)
		if err != nil {
			return nil, fmt.Errorf("failed to open local database: %w", err)
		}
		fmt.Println("Connected to local SQLite database")
	}

	// Note: Turso/libSQL driver may not support certain SQLite PRAGMAs directly via Exec.
	// WAL mode and foreign keys are typically handled by the driver or server.

	d := &Database{db: db}

	// Initialize schema
	if err := d.initSchema(); err != nil {
		return nil, fmt.Errorf("failed to initialize schema: %w", err)
	}

	return d, nil
}

func (d *Database) initSchema() error {
	schema := `
	CREATE TABLE IF NOT EXISTS buckets (
		name TEXT PRIMARY KEY,
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		owner TEXT,
		versioning_enabled BOOLEAN DEFAULT FALSE
	);

	CREATE TABLE IF NOT EXISTS objects (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		bucket TEXT NOT NULL,
		key TEXT NOT NULL,
		version_id TEXT NOT NULL,
		size INTEGER NOT NULL,
		etag TEXT,
		content_type TEXT,
		modified_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		is_latest BOOLEAN DEFAULT TRUE,
		encryption_type TEXT,
		FOREIGN KEY (bucket) REFERENCES buckets(name) ON DELETE CASCADE,
		UNIQUE(bucket, key, version_id)
	);

	CREATE TABLE IF NOT EXISTS object_tags (
		object_id INTEGER NOT NULL,
		tag_key TEXT NOT NULL,
		tag_value TEXT NOT NULL,
		FOREIGN KEY (object_id) REFERENCES objects(id) ON DELETE CASCADE,
		PRIMARY KEY (object_id, tag_key)
	);

	CREATE TABLE IF NOT EXISTS bucket_configs (
		bucket TEXT PRIMARY KEY,
		cors_config TEXT,
		lifecycle_config TEXT,
		FOREIGN KEY (bucket) REFERENCES buckets(name) ON DELETE CASCADE
	);

	CREATE TABLE IF NOT EXISTS multipart_uploads (
		upload_id TEXT PRIMARY KEY,
		bucket TEXT NOT NULL,
		key TEXT NOT NULL,
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (bucket) REFERENCES buckets(name) ON DELETE CASCADE
	);

	CREATE TABLE IF NOT EXISTS multipart_parts (
		upload_id TEXT NOT NULL,
		part_number INTEGER NOT NULL,
		etag TEXT NOT NULL,
		size INTEGER NOT NULL,
		FOREIGN KEY (upload_id) REFERENCES multipart_uploads(upload_id) ON DELETE CASCADE,
		PRIMARY KEY (upload_id, part_number)
	);

	CREATE TABLE IF NOT EXISTS users (
		username TEXT PRIMARY KEY,
		password_hash TEXT,
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
	);

	CREATE TABLE IF NOT EXISTS access_keys (
		access_key_id TEXT PRIMARY KEY,
		secret_access_key TEXT NOT NULL,
		username TEXT NOT NULL,
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (username) REFERENCES users(username) ON DELETE CASCADE
	);

	CREATE TABLE IF NOT EXISTS user_policies (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		username TEXT NOT NULL,
		name TEXT NOT NULL,
		policy_data TEXT NOT NULL, -- JSON
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (username) REFERENCES users(username) ON DELETE CASCADE,
		UNIQUE(username, name)
	);

	CREATE INDEX IF NOT EXISTS idx_objects_bucket_key ON objects(bucket, key);
	CREATE INDEX IF NOT EXISTS idx_objects_latest ON objects(bucket, is_latest) WHERE is_latest = TRUE;
	CREATE INDEX IF NOT EXISTS idx_multipart_bucket_key ON multipart_uploads(bucket, key);
	`

	_, err := d.db.Exec(schema)
	if err != nil {
		return err
	}

	// Migration: Add encryption_type if it doesn't exist
	_, _ = d.db.Exec("ALTER TABLE objects ADD COLUMN encryption_type TEXT")

	return nil
}

// Bucket operations
func (d *Database) CreateBucket(name, owner string) error {
	start := time.Now()
	_, err := d.db.Exec("INSERT INTO buckets (name, owner) VALUES (?, ?)", name, owner)
	metrics.RecordDBQuery("CreateBucket", time.Since(start))
	return err
}

func (d *Database) DeleteBucket(name string) error {
	start := time.Now()
	_, err := d.db.Exec("DELETE FROM buckets WHERE name = ?", name)
	metrics.RecordDBQuery("DeleteBucket", time.Since(start))
	return err
}

func (d *Database) ListBuckets() ([]string, error) {
	start := time.Now()
	rows, err := d.db.Query("SELECT name FROM buckets ORDER BY name")
	metrics.RecordDBQuery("ListBuckets", time.Since(start))
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var buckets []string
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			return nil, err
		}
		buckets = append(buckets, name)
	}
	return buckets, rows.Err()
}

func (d *Database) BucketExists(name string) (bool, error) {
	var exists bool
	err := d.db.QueryRow("SELECT EXISTS(SELECT 1 FROM buckets WHERE name = ?)", name).Scan(&exists)
	return exists, err
}

func (d *Database) GetBucket(name string) (*BucketRow, error) {
	var bucket BucketRow
	err := d.db.QueryRow("SELECT name, created_at, owner, versioning_enabled FROM buckets WHERE name = ?", name).
		Scan(&bucket.Name, &bucket.CreatedAt, &bucket.Owner, &bucket.VersioningEnabled)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return &bucket, err
}

func (d *Database) SetBucketVersioning(name string, enabled bool) error {
	start := time.Now()
	_, err := d.db.Exec("UPDATE buckets SET versioning_enabled = ? WHERE name = ?", enabled, name)
	metrics.RecordDBQuery("SetBucketVersioning", time.Since(start))
	return err
}

// Object operations
func (d *Database) CreateObject(obj *ObjectRow) (int64, error) {
	start := time.Now()
	// Mark previous versions as not latest
	if obj.IsLatest {
		_, err := d.db.Exec("UPDATE objects SET is_latest = FALSE WHERE bucket = ? AND key = ?", obj.Bucket, obj.Key)
		if err != nil {
			return 0, err
		}
	}

	result, err := d.db.Exec(`
		INSERT INTO objects (bucket, key, version_id, size, etag, content_type, is_latest, encryption_type)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)
	`, obj.Bucket, obj.Key, obj.VersionID, obj.Size, obj.ETag, obj.ContentType, obj.IsLatest, obj.EncryptionType)

	metrics.RecordDBQuery("CreateObject", time.Since(start))
	if err != nil {
		return 0, err
	}

	return result.LastInsertId()
}

func (d *Database) GetObject(bucket, key, versionID string) (*ObjectRow, error) {
	start := time.Now()
	query := `SELECT id, bucket, key, version_id, size, etag, content_type, modified_at, is_latest, encryption_type 
	          FROM objects WHERE bucket = ? AND key = ?`

	var obj ObjectRow
	var err error

	if versionID != "" {
		query += " AND version_id = ?"
		err = d.db.QueryRow(query, bucket, key, versionID).Scan(
			&obj.ID, &obj.Bucket, &obj.Key, &obj.VersionID, &obj.Size,
			&obj.ETag, &obj.ContentType, &obj.ModifiedAt, &obj.IsLatest, &obj.EncryptionType)
	} else {
		query += " AND is_latest = TRUE"
		err = d.db.QueryRow(query, bucket, key).Scan(
			&obj.ID, &obj.Bucket, &obj.Key, &obj.VersionID, &obj.Size,
			&obj.ETag, &obj.ContentType, &obj.ModifiedAt, &obj.IsLatest, &obj.EncryptionType)
	}
	metrics.RecordDBQuery("GetObject", time.Since(start))

	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	return &obj, nil
}

func (d *Database) DeleteObject(bucket, key, versionID string) error {
	start := time.Now()
	if versionID != "" {
		_, err := d.db.Exec("DELETE FROM objects WHERE bucket = ? AND key = ? AND version_id = ?", bucket, key, versionID)
		metrics.RecordDBQuery("DeleteObject", time.Since(start))
		return err
	}
	_, err := d.db.Exec("DELETE FROM objects WHERE bucket = ? AND key = ?", bucket, key)
	metrics.RecordDBQuery("DeleteObject", time.Since(start))
	return err
}

func (d *Database) ListObjects(bucket, prefix string, limit int) ([]*ObjectRow, error) {
	query := `SELECT id, bucket, key, version_id, size, etag, content_type, modified_at, is_latest, encryption_type 
	          FROM objects WHERE bucket = ? AND is_latest = TRUE`

	if prefix != "" {
		query += " AND key LIKE ?"
		prefix = prefix + "%"
	}

	query += " ORDER BY key LIMIT ?"

	var rows *sql.Rows
	var err error

	if prefix != "" {
		rows, err = d.db.Query(query, bucket, prefix, limit)
	} else {
		rows, err = d.db.Query(query, bucket, limit)
	}

	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var objects []*ObjectRow
	for rows.Next() {
		var obj ObjectRow
		if err := rows.Scan(&obj.ID, &obj.Bucket, &obj.Key, &obj.VersionID, &obj.Size,
			&obj.ETag, &obj.ContentType, &obj.ModifiedAt, &obj.IsLatest, &obj.EncryptionType); err != nil {
			return nil, err
		}
		objects = append(objects, &obj)
	}

	return objects, rows.Err()
}

// Tag operations
func (d *Database) PutObjectTags(objectID int64, tags map[string]string) error {
	tx, err := d.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	// Delete existing tags
	if _, err := tx.Exec("DELETE FROM object_tags WHERE object_id = ?", objectID); err != nil {
		return err
	}

	// Insert new tags
	for key, value := range tags {
		if _, err := tx.Exec("INSERT INTO object_tags (object_id, tag_key, tag_value) VALUES (?, ?, ?)",
			objectID, key, value); err != nil {
			return err
		}
	}

	return tx.Commit()
}

func (d *Database) GetObjectTags(objectID int64) (map[string]string, error) {
	rows, err := d.db.Query("SELECT tag_key, tag_value FROM object_tags WHERE object_id = ?", objectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	tags := make(map[string]string)
	for rows.Next() {
		var key, value string
		if err := rows.Scan(&key, &value); err != nil {
			return nil, err
		}
		tags[key] = value
	}

	return tags, rows.Err()
}

// Config operations
func (d *Database) PutBucketCORS(bucket string, corsJSON string) error {
	_, err := d.db.Exec(`
		INSERT INTO bucket_configs (bucket, cors_config) VALUES (?, ?)
		ON CONFLICT(bucket) DO UPDATE SET cors_config = excluded.cors_config
	`, bucket, corsJSON)
	return err
}

func (d *Database) GetBucketCORS(bucket string) (string, error) {
	var corsJSON sql.NullString
	err := d.db.QueryRow("SELECT cors_config FROM bucket_configs WHERE bucket = ?", bucket).Scan(&corsJSON)
	if err == sql.ErrNoRows || !corsJSON.Valid {
		return "", nil
	}
	return corsJSON.String, err
}

func (d *Database) DeleteBucketCORS(bucket string) error {
	_, err := d.db.Exec("UPDATE bucket_configs SET cors_config = NULL WHERE bucket = ?", bucket)
	return err
}

func (d *Database) PutBucketLifecycle(bucket string, lifecycleJSON string) error {
	_, err := d.db.Exec(`
		INSERT INTO bucket_configs (bucket, lifecycle_config) VALUES (?, ?)
		ON CONFLICT(bucket) DO UPDATE SET lifecycle_config = excluded.lifecycle_config
	`, bucket, lifecycleJSON)
	return err
}

func (d *Database) GetBucketLifecycle(bucket string) (string, error) {
	var lifecycleJSON sql.NullString
	err := d.db.QueryRow("SELECT lifecycle_config FROM bucket_configs WHERE bucket = ?", bucket).Scan(&lifecycleJSON)
	if err == sql.ErrNoRows || !lifecycleJSON.Valid {
		return "", nil
	}
	return lifecycleJSON.String, err
}

func (d *Database) DeleteBucketLifecycle(bucket string) error {
	_, err := d.db.Exec("UPDATE bucket_configs SET lifecycle_config = NULL WHERE bucket = ?", bucket)
	return err
}

// User operations
func (d *Database) UpsertUser(username, passwordHash string) error {
	_, err := d.db.Exec(`
		INSERT INTO users (username, password_hash) VALUES (?, ?)
		ON CONFLICT(username) DO UPDATE SET password_hash = excluded.password_hash
	`, username, passwordHash)
	return err
}

func (d *Database) GetUser(username string) (*UserRecord, error) {
	var user UserRecord
	err := d.db.QueryRow("SELECT username, password_hash, created_at FROM users WHERE username = ?", username).
		Scan(&user.Username, &user.PasswordHash, &user.CreatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return &user, err
}

func (d *Database) ListUsers() ([]string, error) {
	rows, err := d.db.Query("SELECT username FROM users ORDER BY username")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var users []string
	for rows.Next() {
		var u string
		if err := rows.Scan(&u); err != nil {
			return nil, err
		}
		users = append(users, u)
	}
	return users, nil
}

func (d *Database) DeleteUser(username string) error {
	_, err := d.db.Exec("DELETE FROM users WHERE username = ?", username)
	return err
}

// Access Key operations
func (d *Database) CreateAccessKey(username, keyID, secret string) error {
	_, err := d.db.Exec("INSERT INTO access_keys (username, access_key_id, secret_access_key) VALUES (?, ?, ?)",
		username, keyID, secret)
	return err
}

func (d *Database) GetAccessKeys(username string) ([]AccessKeyRecord, error) {
	rows, err := d.db.Query("SELECT access_key_id, secret_access_key, username, created_at FROM access_keys WHERE username = ?", username)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var keys []AccessKeyRecord
	for rows.Next() {
		var k AccessKeyRecord
		if err := rows.Scan(&k.AccessKeyID, &k.SecretAccessKey, &k.Username, &k.CreatedAt); err != nil {
			return nil, err
		}
		keys = append(keys, k)
	}
	return keys, nil
}

func (d *Database) GetUserByAccessKey(keyID string) (*UserRecord, string, error) {
	var user UserRecord
	var secret string
	err := d.db.QueryRow(`
		SELECT u.username, u.password_hash, u.created_at, ak.secret_access_key
		FROM users u
		JOIN access_keys ak ON u.username = ak.username
		WHERE ak.access_key_id = ?
	`, keyID).Scan(&user.Username, &user.PasswordHash, &user.CreatedAt, &secret)
	if err == sql.ErrNoRows {
		return nil, "", nil
	}
	return &user, secret, err
}

func (d *Database) DeleteAccessKey(keyID string) error {
	_, err := d.db.Exec("DELETE FROM access_keys WHERE access_key_id = ?", keyID)
	return err
}

// Policy operations
func (d *Database) UpsertUserPolicy(username, name, policyJSON string) error {
	_, err := d.db.Exec(`
		INSERT INTO user_policies (username, name, policy_data) VALUES (?, ?, ?)
		ON CONFLICT(username, name) DO UPDATE SET policy_data = excluded.policy_data
	`, username, name, policyJSON)
	return err
}

func (d *Database) GetUserPolicies(username string) ([]PolicyRecord, error) {
	rows, err := d.db.Query("SELECT id, username, name, policy_data, created_at FROM user_policies WHERE username = ?", username)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var policies []PolicyRecord
	for rows.Next() {
		var p PolicyRecord
		if err := rows.Scan(&p.ID, &p.Username, &p.Name, &p.Data, &p.CreatedAt); err != nil {
			return nil, err
		}
		policies = append(policies, p)
	}
	return policies, nil
}

func (d *Database) DeleteUserPolicy(username, name string) error {
	_, err := d.db.Exec("DELETE FROM user_policies WHERE username = ? AND name = ?", username, name)
	return err
}

func (d *Database) Close() error {
	return d.db.Close()
}
