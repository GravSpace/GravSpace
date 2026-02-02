package database

import (
	"database/sql"
	"fmt"
	"os"
	"strings"
	"time"

	"path/filepath"

	"github.com/GravSpace/GravSpace/internal/metrics"
	_ "github.com/tursodatabase/turso-go" // Turso driver (works for remote)
	"golang.org/x/crypto/bcrypt"
	_ "modernc.org/sqlite" // SQLite driver (for local)
)

type Database struct {
	db *sql.DB
}

type BucketRow struct {
	Name                 string
	CreatedAt            time.Time
	Owner                string
	VersioningEnabled    bool
	ObjectLockEnabled    bool
	DefaultRetentionMode string
	DefaultRetentionDays int
	SoftDeleteEnabled    bool
	SoftDeleteRetention  int // in days
}

type ObjectRow struct {
	ID              int64
	Bucket          string
	Key             string
	VersionID       string
	Size            int64
	ETag            *string
	ContentType     *string
	ModifiedAt      time.Time
	IsLatest        bool
	EncryptionType  *string    // SSE-S3 or empty
	RetainUntilDate *time.Time // Object retention expiry date
	LegalHold       bool       // Legal hold status
	LockMode        *string    // COMPLIANCE or GOVERNANCE
	DeletedAt       *time.Time
	LegalHoldReason *string
	ContentHash     *string // SHA-256 hash for deduplication
	CompressionType *string // zstd, brotli, etc.
	OriginalSize    *int64  // Size before compression
	IsDeduplicated  bool    // Flag for CAS storage
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
	WebsiteConfig   string // JSON
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

type WebhookRecord struct {
	ID        int64
	Bucket    string
	URL       string
	Events    string // JSON encoded events
	Secret    string
	Active    bool
	CreatedAt time.Time
}

type AuditLogRecord struct {
	ID        int64
	Timestamp time.Time
	Username  string
	Action    string
	Resource  string
	Result    string
	IP        string
	UserAgent string
	Details   string // JSON
}

type StorageSnapshotRecord struct {
	ID        int64
	Timestamp time.Time
	Bucket    string
	Size      int64
}

// NewDatabase creates a new database connection
// Supports both local SQLite and Turso remote database
//
// For local SQLite:
//
//	dbPath = "file:./db/metadata.db"
//
// For Turso:
//
//	dbPath = "libsql://[your-database].turso.io?authToken=[your-token]"
//
// Environment variables:
//
//	DATABASE_URL or TURSO_DATABASE_URL - Database URL (e.g. libsql://... for Turso or file://... for local)
//	DATABASE_AUTH_TOKEN or TURSO_AUTH_TOKEN - Database authentication token
func NewDatabase(dbPath string) (*Database, error) {
	// Check for environment variables
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		dbURL = os.Getenv("TURSO_DATABASE_URL")
	}

	dbToken := os.Getenv("DATABASE_AUTH_TOKEN")
	if dbToken == "" {
		dbToken = os.Getenv("TURSO_AUTH_TOKEN")
	}

	var db *sql.DB
	var err error

	if dbURL != "" {
		// If it's a remote URL (starts with libsql:// or https://)
		if strings.HasPrefix(dbURL, "libsql://") || strings.HasPrefix(dbURL, "https://") {
			connStr := dbURL
			if dbToken != "" && !strings.Contains(dbURL, "authToken=") {
				connStr = fmt.Sprintf("%s?authToken=%s", dbURL, dbToken)
			}
			db, err = sql.Open("turso", connStr)
			if err != nil {
				return nil, fmt.Errorf("failed to connect to remote database: %w", err)
			}
			fmt.Printf("Connected to remote database: %s\n", dbURL)
		} else if strings.HasPrefix(dbURL, "file:") {
			// Local SQLite via DATABASE_URL
			dbPath = strings.TrimPrefix(dbURL, "file:")
			db, err = sql.Open("sqlite", dbPath)
			if err != nil {
				return nil, fmt.Errorf("failed to open local database from URL: %w", err)
			}
			fmt.Printf("Connected to local database via URL: %s\n", dbPath)
		} else {
			// Fallback to legacy Turso handling if it's just a hostname/URL without protocol
			connStr := fmt.Sprintf("%s?authToken=%s", dbURL, dbToken)
			db, err = sql.Open("turso", connStr)
			if err != nil {
				return nil, fmt.Errorf("failed to connect to remote database: %w", err)
			}
			fmt.Printf("Connected to remote database: %s\n", dbURL)
		}
	} else {
		// Use local SQLite fallback
		if dbPath == "" {
			dbPath = "./db/metadata.db"
		}

		// Ensure the directory exists
		dir := filepath.Dir(dbPath)
		if dir != "." && dir != "/" {
			if err := os.MkdirAll(dir, 0755); err != nil {
				return nil, fmt.Errorf("failed to create database directory: %w", err)
			}
		}

		db, err = sql.Open("sqlite", dbPath)
		if err != nil {
			return nil, fmt.Errorf("failed to open local database: %w", err)
		}
		fmt.Printf("Connected to local SQLite database: %s\n", dbPath)

		// Enable WAL mode for local SQLite (better concurrency)
		if _, err := db.Exec("PRAGMA journal_mode=WAL;"); err != nil {
			fmt.Printf("Warning: failed to enable WAL mode: %v\n", err)
		}
		// Set synchronous to NORMAL for better performance
		if _, err := db.Exec("PRAGMA synchronous=NORMAL;"); err != nil {
			fmt.Printf("Warning: failed to set synchronous=NORMAL: %v\n", err)
		}
		// Set busy timeout to 5 seconds to handle concurrent access
		if _, err := db.Exec("PRAGMA busy_timeout=5000;"); err != nil {
			fmt.Printf("Warning: failed to set busy_timeout: %v\n", err)
		}

		// Configure connection pool to reduce contention
		db.SetMaxOpenConns(1) // SQLite works best with single writer
		db.SetMaxIdleConns(1)
		db.SetConnMaxLifetime(0)
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
		versioning_enabled BOOLEAN DEFAULT FALSE,
		object_lock_enabled BOOLEAN DEFAULT FALSE,
		default_retention_mode TEXT,
		default_retention_days INTEGER,
		soft_delete_enabled BOOLEAN DEFAULT FALSE,
		soft_delete_retention INTEGER DEFAULT 30
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
		retain_until_date TIMESTAMP,
		legal_hold BOOLEAN DEFAULT FALSE,
		lock_mode TEXT,
		deleted_at TIMESTAMP,
		legal_hold_reason TEXT,
		content_hash TEXT,
		compression_type TEXT,
		original_size INTEGER,
		is_deduplicated BOOLEAN DEFAULT FALSE,
		FOREIGN KEY (bucket) REFERENCES buckets(name) ON DELETE CASCADE,
		UNIQUE(bucket, key, version_id)
	);

	CREATE INDEX IF NOT EXISTS idx_objects_bucket_key_latest ON objects(bucket, key, is_latest);
	CREATE INDEX IF NOT EXISTS idx_objects_expiry ON objects(bucket, is_latest, modified_at);
	CREATE INDEX IF NOT EXISTS idx_objects_bucket_prefix ON objects(bucket, key);

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

	CREATE TABLE IF NOT EXISTS audit_logs (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		username TEXT,
		action TEXT,
		resource TEXT,
		result TEXT,
		ip TEXT,
		user_agent TEXT,
		details TEXT
	);

	CREATE TABLE IF NOT EXISTS storage_snapshots (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		bucket TEXT NOT NULL,
		size INTEGER NOT NULL,
		FOREIGN KEY (bucket) REFERENCES buckets(name) ON DELETE CASCADE
	);
	CREATE INDEX IF NOT EXISTS idx_storage_snapshots_timestamp ON storage_snapshots(timestamp);
	CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp);
	CREATE INDEX IF NOT EXISTS idx_objects_lifecycle ON objects(bucket, is_latest, modified_at);
	CREATE INDEX IF NOT EXISTS idx_audit_logs_username ON audit_logs(username);

	CREATE TABLE IF NOT EXISTS webhooks (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		bucket TEXT NOT NULL,
		url TEXT NOT NULL,
		events TEXT NOT NULL,
		secret TEXT,
		active BOOLEAN DEFAULT TRUE,
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (bucket) REFERENCES buckets(name) ON DELETE CASCADE
	);

	CREATE TABLE IF NOT EXISTS global_policies (
		name TEXT PRIMARY KEY,
		policy_data TEXT NOT NULL, -- JSON
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
	);

	CREATE TABLE IF NOT EXISTS system_settings (
		key TEXT PRIMARY KEY,
		value TEXT,
		updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
	);

	CREATE INDEX IF NOT EXISTS idx_objects_bucket_key ON objects(bucket, key);
	CREATE INDEX IF NOT EXISTS idx_objects_latest ON objects(bucket, is_latest) WHERE is_latest = TRUE;
	CREATE INDEX IF NOT EXISTS idx_objects_bucket_key_latest ON objects(bucket, key, is_latest);
	CREATE INDEX IF NOT EXISTS idx_objects_trash_cleanup ON objects(bucket, deleted_at) WHERE deleted_at IS NOT NULL;
	CREATE INDEX IF NOT EXISTS idx_objects_stats_latest ON objects(is_latest, bucket) WHERE is_latest = TRUE;
	CREATE INDEX IF NOT EXISTS idx_objects_bucket_key_version ON objects(bucket, key, version_id);
	CREATE INDEX IF NOT EXISTS idx_audit_logs_user_time ON audit_logs(username, timestamp);
	CREATE INDEX IF NOT EXISTS idx_storage_snapshots_time_bucket ON storage_snapshots(timestamp, bucket);
	CREATE INDEX IF NOT EXISTS idx_multipart_bucket_key ON multipart_uploads(bucket, key);
	CREATE TABLE IF NOT EXISTS used_signatures (
		signature TEXT PRIMARY KEY,
		expires_at TIMESTAMP
	);
	`

	if _, err := d.db.Exec(schema); err != nil {
		return err
	}

	// Migrations for existing tables
	if err := d.addColumnIfNotExists("buckets", "object_lock_enabled", "BOOLEAN DEFAULT FALSE"); err != nil {
		return err
	}
	if err := d.addColumnIfNotExists("buckets", "default_retention_mode", "TEXT"); err != nil {
		return err
	}
	if err := d.addColumnIfNotExists("buckets", "default_retention_days", "INTEGER"); err != nil {
		return err
	}
	if err := d.addColumnIfNotExists("objects", "retain_until_date", "TIMESTAMP"); err != nil {
		return err
	}
	if err := d.addColumnIfNotExists("objects", "legal_hold", "BOOLEAN DEFAULT FALSE"); err != nil {
		return err
	}
	if err := d.addColumnIfNotExists("objects", "lock_mode", "TEXT"); err != nil {
		return err
	}
	// Migration: Add encryption_type if it doesn't exist
	if err := d.addColumnIfNotExists("objects", "encryption_type", "TEXT"); err != nil {
		return err
	}
	if err := d.addColumnIfNotExists("bucket_configs", "website_config", "TEXT"); err != nil {
		return err
	}
	if err := d.addColumnIfNotExists("buckets", "soft_delete_enabled", "BOOLEAN DEFAULT FALSE"); err != nil {
		return err
	}
	if err := d.addColumnIfNotExists("buckets", "soft_delete_retention", "INTEGER DEFAULT 30"); err != nil {
		return err
	}
	if err := d.addColumnIfNotExists("objects", "deleted_at", "TIMESTAMP"); err != nil {
		return err
	}
	if err := d.addColumnIfNotExists("objects", "legal_hold_reason", "TEXT"); err != nil {
		return err
	}
	if err := d.addColumnIfNotExists("objects", "content_hash", "TEXT"); err != nil {
		return err
	}
	if err := d.addColumnIfNotExists("objects", "compression_type", "TEXT"); err != nil {
		return err
	}
	if err := d.addColumnIfNotExists("objects", "original_size", "INTEGER"); err != nil {
		return err
	}
	if err := d.addColumnIfNotExists("objects", "is_deduplicated", "BOOLEAN DEFAULT FALSE"); err != nil {
		return err
	}

	// Create indexes for deduplication
	if _, err := d.db.Exec("CREATE INDEX IF NOT EXISTS idx_objects_content_hash ON objects(content_hash) WHERE content_hash IS NOT NULL;"); err != nil {
		fmt.Printf("Warning: failed to create idx_objects_content_hash: %v\n", err)
	}

	// Create indexes that might depend on migrated columns
	if _, err := d.db.Exec("CREATE INDEX IF NOT EXISTS idx_objects_deleted_at ON objects(deleted_at) WHERE deleted_at IS NOT NULL;"); err != nil {
		fmt.Printf("Warning: failed to create idx_objects_deleted_at: %v\n", err)
	}

	return nil
}

func (d *Database) addColumnIfNotExists(table, column, colType string) error {
	query := fmt.Sprintf("PRAGMA table_info(%s)", table)
	rows, err := d.db.Query(query)
	if err != nil {
		return err
	}
	defer rows.Close()

	found := false
	for rows.Next() {
		var cid int
		var name, ctype string
		var notnull int
		var dfltValue interface{}
		var pk int
		if err := rows.Scan(&cid, &name, &ctype, &notnull, &dfltValue, &pk); err != nil {
			return err
		}
		if name == column {
			found = true
			break
		}
	}

	if !found {
		alterQuery := fmt.Sprintf("ALTER TABLE %s ADD COLUMN %s %s", table, column, colType)
		if _, err := d.db.Exec(alterQuery); err != nil {
			return fmt.Errorf("failed to add column %s to table %s: %w", column, table, err)
		}
		fmt.Printf("Added column %s to table %s\n", column, table)
	}

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

	buckets := []string{}
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
	var mode sql.NullString
	var days sql.NullInt64
	err := d.db.QueryRow("SELECT name, created_at, owner, versioning_enabled, object_lock_enabled, default_retention_mode, default_retention_days, soft_delete_enabled, soft_delete_retention FROM buckets WHERE name = ?", name).
		Scan(&bucket.Name, &bucket.CreatedAt, &bucket.Owner, &bucket.VersioningEnabled, &bucket.ObjectLockEnabled, &mode, &days, &bucket.SoftDeleteEnabled, &bucket.SoftDeleteRetention)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if mode.Valid {
		bucket.DefaultRetentionMode = mode.String
	}
	if days.Valid {
		bucket.DefaultRetentionDays = int(days.Int64)
	}
	return &bucket, err
}

func (d *Database) SetBucketVersioning(name string, enabled bool) error {
	start := time.Now()
	_, err := d.db.Exec("UPDATE buckets SET versioning_enabled = ? WHERE name = ?", enabled, name)
	metrics.RecordDBQuery("SetBucketVersioning", time.Since(start))
	return err
}

func (d *Database) SetBucketObjectLock(name string, enabled bool) error {
	start := time.Now()
	_, err := d.db.Exec("UPDATE buckets SET object_lock_enabled = ? WHERE name = ?", enabled, name)
	metrics.RecordDBQuery("SetBucketObjectLock", time.Since(start))
	return err
}

func (d *Database) SetBucketDefaultRetention(name string, mode string, days int) error {
	start := time.Now()
	_, err := d.db.Exec("UPDATE buckets SET default_retention_mode = ?, default_retention_days = ? WHERE name = ?", mode, days, name)
	metrics.RecordDBQuery("SetBucketDefaultRetention", time.Since(start))
	return err
}

// Object operations
func (d *Database) CreateObject(obj *ObjectRow) (int64, error) {
	start := time.Now()
	// Mark previous versions as not latest (exclude current version_id)
	if obj.IsLatest {
		_, err := d.db.Exec("UPDATE objects SET is_latest = FALSE WHERE bucket = ? AND key = ? AND version_id != ?", obj.Bucket, obj.Key, obj.VersionID)
		if err != nil {
			return 0, err
		}
	}

	result, err := d.db.Exec(`
		INSERT INTO objects (bucket, key, version_id, size, etag, content_type, is_latest, encryption_type, retain_until_date, legal_hold, lock_mode)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`, obj.Bucket, obj.Key, obj.VersionID, obj.Size, obj.ETag, obj.ContentType, obj.IsLatest, obj.EncryptionType, obj.RetainUntilDate, obj.LegalHold, obj.LockMode)

	metrics.RecordDBQuery("CreateObject", time.Since(start))
	if err != nil {
		return 0, err
	}

	return result.LastInsertId()
}

func (d *Database) GetObject(bucket, key, versionID string) (*ObjectRow, error) {
	start := time.Now()
	query := `SELECT id, bucket, key, version_id, size, etag, content_type, modified_at, is_latest, encryption_type, retain_until_date, legal_hold, lock_mode, deleted_at
	          FROM objects WHERE bucket = ? AND key = ? AND deleted_at IS NULL`

	var obj ObjectRow
	var err error

	if versionID != "" {
		query += " AND version_id = ?"
		err = d.db.QueryRow(query, bucket, key, versionID).Scan(
			&obj.ID, &obj.Bucket, &obj.Key, &obj.VersionID, &obj.Size,
			&obj.ETag, &obj.ContentType, &obj.ModifiedAt, &obj.IsLatest, &obj.EncryptionType,
			&obj.RetainUntilDate, &obj.LegalHold, &obj.LockMode, &obj.DeletedAt)
	} else {
		query += " AND is_latest = TRUE"
		err = d.db.QueryRow(query, bucket, key).Scan(
			&obj.ID, &obj.Bucket, &obj.Key, &obj.VersionID, &obj.Size,
			&obj.ETag, &obj.ContentType, &obj.ModifiedAt, &obj.IsLatest, &obj.EncryptionType,
			&obj.RetainUntilDate, &obj.LegalHold, &obj.LockMode, &obj.DeletedAt)
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

func (d *Database) GetObjectIncludeDeleted(bucket, key, versionID string) (*ObjectRow, error) {
	start := time.Now()
	query := `SELECT id, bucket, key, version_id, size, etag, content_type, modified_at, is_latest, encryption_type, retain_until_date, legal_hold, lock_mode, deleted_at
	          FROM objects WHERE bucket = ? AND key = ?`

	var obj ObjectRow
	var err error

	if versionID != "" {
		query += " AND version_id = ?"
		err = d.db.QueryRow(query, bucket, key, versionID).Scan(
			&obj.ID, &obj.Bucket, &obj.Key, &obj.VersionID, &obj.Size,
			&obj.ETag, &obj.ContentType, &obj.ModifiedAt, &obj.IsLatest, &obj.EncryptionType,
			&obj.RetainUntilDate, &obj.LegalHold, &obj.LockMode, &obj.DeletedAt)
	} else {
		query += " AND is_latest = TRUE"
		err = d.db.QueryRow(query, bucket, key).Scan(
			&obj.ID, &obj.Bucket, &obj.Key, &obj.VersionID, &obj.Size,
			&obj.ETag, &obj.ContentType, &obj.ModifiedAt, &obj.IsLatest, &obj.EncryptionType,
			&obj.RetainUntilDate, &obj.LegalHold, &obj.LockMode, &obj.DeletedAt)
	}
	metrics.RecordDBQuery("GetObjectIncludeDeleted", time.Since(start))

	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	return &obj, nil
}

func (d *Database) UpdateObjectLatest(bucket, key, versionID string, isLatest bool) error {
	start := time.Now()
	_, err := d.db.Exec("UPDATE objects SET is_latest = ? WHERE bucket = ? AND key = ? AND version_id = ?",
		isLatest, bucket, key, versionID)
	metrics.RecordDBQuery("UpdateObjectLatest", time.Since(start))
	return err
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

func (d *Database) DeleteObjectsByID(ids []int64) error {
	if len(ids) == 0 {
		return nil
	}
	start := time.Now()

	// Create placeholders ?,?,?
	placeholders := make([]string, len(ids))
	args := make([]interface{}, len(ids))
	for i, id := range ids {
		placeholders[i] = "?"
		args[i] = id
	}

	query := fmt.Sprintf("DELETE FROM objects WHERE id IN (%s)", strings.Join(placeholders, ","))
	_, err := d.db.Exec(query, args...)
	metrics.RecordDBQuery("DeleteObjectsByID", time.Since(start))
	return err
}

func (d *Database) SoftDeleteObject(bucket, key, versionID string) error {
	start := time.Now()
	now := time.Now()
	if versionID != "" {
		_, err := d.db.Exec("UPDATE objects SET deleted_at = ?, is_latest = FALSE WHERE bucket = ? AND key = ? AND version_id = ?", now, bucket, key, versionID)
		metrics.RecordDBQuery("SoftDeleteObject", time.Since(start))
		return err
	}
	_, err := d.db.Exec("UPDATE objects SET deleted_at = ?, is_latest = FALSE WHERE bucket = ? AND key = ? AND is_latest = TRUE", now, bucket, key)
	metrics.RecordDBQuery("SoftDeleteObject", time.Since(start))
	return err
}

func (d *Database) RestoreObject(bucket, key, versionID string) error {
	start := time.Now()
	// When restoring, we also need to decide if it becomes the latest version again
	// For simplicity, we'll mark the restored version as latest if no other version is current
	_, err := d.db.Exec("UPDATE objects SET deleted_at = NULL, is_latest = TRUE WHERE bucket = ? AND key = ? AND version_id = ?", bucket, key, versionID)
	if err == nil {
		// Mark others as not latest
		d.db.Exec("UPDATE objects SET is_latest = FALSE WHERE bucket = ? AND key = ? AND version_id != ?", bucket, key, versionID)
	}
	metrics.RecordDBQuery("RestoreObject", time.Since(start))
	return err
}

func (d *Database) ListTrashObjects(bucket, search string) ([]*ObjectRow, error) {
	start := time.Now()
	query := `SELECT id, bucket, key, version_id, size, etag, content_type, modified_at, is_latest, encryption_type, retain_until_date, legal_hold, lock_mode, deleted_at
	          FROM objects WHERE deleted_at IS NOT NULL`
	args := []interface{}{}
	if bucket != "" {
		query += " AND bucket = ?"
		args = append(args, bucket)
	}
	if search != "" {
		query += " AND key LIKE ?"
		args = append(args, "%"+search+"%")
	}
	query += " ORDER BY deleted_at DESC"

	rows, err := d.db.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var objects []*ObjectRow
	for rows.Next() {
		var obj ObjectRow
		if err := rows.Scan(&obj.ID, &obj.Bucket, &obj.Key, &obj.VersionID, &obj.Size,
			&obj.ETag, &obj.ContentType, &obj.ModifiedAt, &obj.IsLatest, &obj.EncryptionType,
			&obj.RetainUntilDate, &obj.LegalHold, &obj.LockMode, &obj.DeletedAt); err != nil {
			return nil, err
		}
		objects = append(objects, &obj)
	}
	metrics.RecordDBQuery("ListTrashObjects", time.Since(start))
	return objects, rows.Err()
}

func (d *Database) EmptyTrash(bucket string) error {
	start := time.Now()
	query := "DELETE FROM objects WHERE deleted_at IS NOT NULL"
	args := []interface{}{}
	if bucket != "" {
		query += " AND bucket = ?"
		args = append(args, bucket)
	}
	_, err := d.db.Exec(query, args...)
	metrics.RecordDBQuery("EmptyTrash", time.Since(start))
	return err
}

func (d *Database) DeletePrefix(bucket, prefix string) error {
	start := time.Now()
	_, err := d.db.Exec("DELETE FROM objects WHERE bucket = ? AND key LIKE ?", bucket, prefix+"%")
	metrics.RecordDBQuery("DeletePrefix", time.Since(start))
	return err
}

func (d *Database) SoftDeletePrefix(bucket, prefix string) error {
	start := time.Now()
	now := time.Now()
	_, err := d.db.Exec("UPDATE objects SET deleted_at = ?, is_latest = FALSE WHERE bucket = ? AND key LIKE ? AND deleted_at IS NULL", now, bucket, prefix+"%")
	metrics.RecordDBQuery("SoftDeletePrefix", time.Since(start))
	return err
}

func (d *Database) RestorePrefix(bucket, prefix string) error {
	start := time.Now()
	_, err := d.db.Exec("UPDATE objects SET deleted_at = NULL, is_latest = TRUE WHERE bucket = ? AND key LIKE ? AND deleted_at IS NOT NULL", bucket, prefix+"%")
	metrics.RecordDBQuery("RestorePrefix", time.Since(start))
	return err
}

func (d *Database) ListObjects(bucket, prefix, search string, limit int) ([]*ObjectRow, error) {
	query := `SELECT id, bucket, key, version_id, size, etag, content_type, modified_at, is_latest, encryption_type, retain_until_date, legal_hold, lock_mode, deleted_at
	          FROM objects WHERE bucket = ? AND is_latest = TRUE AND deleted_at IS NULL`

	args := []interface{}{bucket}

	if prefix != "" {
		query += " AND key LIKE ?"
		args = append(args, prefix+"%")
	}

	if search != "" {
		query += " AND key LIKE ?"
		args = append(args, "%"+search+"%")
	}

	query += " ORDER BY key LIMIT ?"
	args = append(args, limit)

	rows, err := d.db.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var objects []*ObjectRow
	for rows.Next() {
		var obj ObjectRow
		if err := rows.Scan(&obj.ID, &obj.Bucket, &obj.Key, &obj.VersionID, &obj.Size,
			&obj.ETag, &obj.ContentType, &obj.ModifiedAt, &obj.IsLatest, &obj.EncryptionType,
			&obj.RetainUntilDate, &obj.LegalHold, &obj.LockMode, &obj.DeletedAt); err != nil {
			return nil, err
		}
		objects = append(objects, &obj)
	}

	return objects, rows.Err()
}

func (d *Database) SetObjectRetention(bucket, key, versionID string, retainUntil time.Time, mode string) error {
	start := time.Now()
	_, err := d.db.Exec(`UPDATE objects SET retain_until_date = ?, lock_mode = ? 
	                      WHERE bucket = ? AND key = ? AND version_id = ?`,
		retainUntil, mode, bucket, key, versionID)
	metrics.RecordDBQuery("SetObjectRetention", time.Since(start))
	return err
}

func (d *Database) SetObjectLegalHold(bucket, key, versionID string, hold bool, reason string) error {
	start := time.Now()
	_, err := d.db.Exec("UPDATE objects SET legal_hold = ?, legal_hold_reason = ? WHERE bucket = ? AND key = ? AND version_id = ?", hold, reason, bucket, key, versionID)
	metrics.RecordDBQuery("SetObjectLegalHold", time.Since(start))
	return err
}

func (d *Database) IsSignatureUsed(signature string) (bool, error) {
	start := time.Now()
	var count int
	err := d.db.QueryRow("SELECT COUNT(*) FROM used_signatures WHERE signature = ?", signature).Scan(&count)
	metrics.RecordDBQuery("IsSignatureUsed", time.Since(start))
	return count > 0, err
}

func (d *Database) RecordSignature(signature string, expiresAt time.Time) error {
	start := time.Now()
	_, err := d.db.Exec("INSERT INTO used_signatures (signature, expires_at) VALUES (?, ?)", signature, expiresAt)
	metrics.RecordDBQuery("RecordSignature", time.Since(start))
	return err
}

func (d *Database) CleanupExpiredSignatures() error {
	start := time.Now()
	_, err := d.db.Exec("DELETE FROM used_signatures WHERE expires_at < ?", time.Now())
	metrics.RecordDBQuery("CleanupExpiredSignatures", time.Since(start))
	return err
}

func (d *Database) SetBucketSoftDelete(name string, enabled bool, retentionDays int) error {
	start := time.Now()
	_, err := d.db.Exec("UPDATE buckets SET soft_delete_enabled = ?, soft_delete_retention = ? WHERE name = ?", enabled, retentionDays, name)
	metrics.RecordDBQuery("SetBucketSoftDelete", time.Since(start))
	return err
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

func (d *Database) PutBucketWebsite(bucket string, websiteJSON string) error {
	_, err := d.db.Exec(`
		INSERT INTO bucket_configs (bucket, website_config) VALUES (?, ?)
		ON CONFLICT(bucket) DO UPDATE SET website_config = excluded.website_config
	`, bucket, websiteJSON)
	return err
}

func (d *Database) GetBucketWebsite(bucket string) (string, error) {
	var websiteJSON sql.NullString
	err := d.db.QueryRow("SELECT website_config FROM bucket_configs WHERE bucket = ?", bucket).Scan(&websiteJSON)
	if err == sql.ErrNoRows || !websiteJSON.Valid {
		return "", nil
	}
	return websiteJSON.String, err
}

func (d *Database) DeleteBucketWebsite(bucket string) error {
	_, err := d.db.Exec("UPDATE bucket_configs SET website_config = NULL WHERE bucket = ?", bucket)
	return err
}

func (d *Database) GetAllLifecycles() (map[string]string, error) {
	rows, err := d.db.Query("SELECT bucket, lifecycle_config FROM bucket_configs WHERE lifecycle_config IS NOT NULL AND lifecycle_config != ''")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	configs := make(map[string]string)
	for rows.Next() {
		var bucket, config string
		if err := rows.Scan(&bucket, &config); err != nil {
			return nil, err
		}
		configs[bucket] = config
	}
	return configs, nil
}

func (d *Database) GetGlobalStats() (count int, size int64, err error) {
	err = d.db.QueryRow(`
		SELECT COUNT(*), COALESCE(SUM(size), 0)
		FROM objects 
		WHERE is_latest = 1
	`).Scan(&count, &size)
	return
}

func (d *Database) GetBucketStats(bucket string) (count int, size int64, err error) {
	err = d.db.QueryRow(`
		SELECT COUNT(*), COALESCE(SUM(size), 0)
		FROM objects 
		WHERE bucket = ? AND is_latest = 1
	`, bucket).Scan(&count, &size)
	return
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

	users := []string{}
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

// Global Policy operations
func (d *Database) UpsertGlobalPolicy(name, data string) error {
	_, err := d.db.Exec(`
		INSERT INTO global_policies (name, policy_data) VALUES (?, ?)
		ON CONFLICT(name) DO UPDATE SET policy_data = excluded.policy_data
	`, name, data)
	return err
}

func (d *Database) ListGlobalPolicies() (map[string]string, error) {
	rows, err := d.db.Query("SELECT name, policy_data FROM global_policies")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	policies := make(map[string]string)
	for rows.Next() {
		var name, data string
		if err := rows.Scan(&name, &data); err != nil {
			return nil, err
		}
		policies[name] = data
	}
	return policies, nil
}

func (d *Database) DeleteGlobalPolicy(name string) error {
	_, err := d.db.Exec("DELETE FROM global_policies WHERE name = ?", name)
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

func (d *Database) VerifyPassword(username, password string) (bool, error) {
	var hash string
	err := d.db.QueryRow("SELECT password_hash FROM users WHERE username = ?", username).Scan(&hash)
	if err == sql.ErrNoRows {
		return false, nil
	}
	if err != nil {
		return false, err
	}

	err = bcrypt.CompareHashAndPassword([]byte(hash), []byte(password))
	if err == nil {
		return true, nil
	}
	return false, nil
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

	policies := []PolicyRecord{}
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

func (d *Database) GetExpiredObjects(bucket string, prefix string, days int) ([]*ObjectRow, error) {
	start := time.Now()
	// Calculate cutoff time in Go to allow index usage on modified_at column
	cutoff := time.Now().AddDate(0, 0, -days)
	query := `SELECT id, bucket, key, version_id, size, etag, content_type, modified_at, is_latest, encryption_type, retain_until_date, legal_hold, lock_mode, deleted_at
	          FROM objects 
	          WHERE bucket = ? AND is_latest = 1 AND modified_at < ? AND deleted_at IS NULL`

	args := []interface{}{bucket, cutoff}
	if prefix != "" {
		query += " AND key LIKE ?"
		args = append(args, prefix+"%")
	}

	rows, err := d.db.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var objects []*ObjectRow
	for rows.Next() {
		var obj ObjectRow
		if err := rows.Scan(&obj.ID, &obj.Bucket, &obj.Key, &obj.VersionID, &obj.Size,
			&obj.ETag, &obj.ContentType, &obj.ModifiedAt, &obj.IsLatest, &obj.EncryptionType,
			&obj.RetainUntilDate, &obj.LegalHold, &obj.LockMode, &obj.DeletedAt); err != nil {
			return nil, err
		}
		objects = append(objects, &obj)
	}
	metrics.RecordDBQuery("GetExpiredObjects", time.Since(start))
	return objects, rows.Err()
}

func (d *Database) Close() error {
	return d.db.Close()
}

func (d *Database) ListAllObjects() ([]*ObjectRow, error) {
	query := `SELECT id, bucket, key, version_id, size, etag, content_type, modified_at, is_latest, encryption_type, retain_until_date, legal_hold, lock_mode, deleted_at
	          FROM objects`
	rows, err := d.db.Query(query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var objects []*ObjectRow
	for rows.Next() {
		var obj ObjectRow
		if err := rows.Scan(&obj.ID, &obj.Bucket, &obj.Key, &obj.VersionID, &obj.Size,
			&obj.ETag, &obj.ContentType, &obj.ModifiedAt, &obj.IsLatest, &obj.EncryptionType,
			&obj.RetainUntilDate, &obj.LegalHold, &obj.LockMode, &obj.DeletedAt); err != nil {
			return nil, err
		}
		objects = append(objects, &obj)
	}

	return objects, rows.Err()
}
func (d *Database) CreateWebhook(w *WebhookRecord) (int64, error) {
	start := time.Now()
	res, err := d.db.Exec(`INSERT INTO webhooks (bucket, url, events, secret, active) 
	                        VALUES (?, ?, ?, ?, ?)`,
		w.Bucket, w.URL, w.Events, w.Secret, w.Active)
	metrics.RecordDBQuery("CreateWebhook", time.Since(start))
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func (d *Database) ListWebhooks(bucket string) ([]*WebhookRecord, error) {
	start := time.Now()
	rows, err := d.db.Query(`SELECT id, bucket, url, events, secret, active, created_at 
	                          FROM webhooks WHERE bucket = ?`, bucket)
	metrics.RecordDBQuery("ListWebhooks", time.Since(start))
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	hooks := []*WebhookRecord{}
	for rows.Next() {
		h := &WebhookRecord{}
		err := rows.Scan(&h.ID, &h.Bucket, &h.URL, &h.Events, &h.Secret, &h.Active, &h.CreatedAt)
		if err != nil {
			return nil, err
		}
		hooks = append(hooks, h)
	}
	return hooks, nil
}

func (d *Database) DeleteWebhook(id int64) error {
	start := time.Now()
	_, err := d.db.Exec("DELETE FROM webhooks WHERE id = ?", id)
	metrics.RecordDBQuery("DeleteWebhook", time.Since(start))
	return err
}

func (d *Database) GetWebhooksByBucket(bucket string) ([]*WebhookRecord, error) {
	return d.ListWebhooks(bucket)
}

func (d *Database) CreateAuditLog(l *AuditLogRecord) error {
	start := time.Now()
	_, err := d.db.Exec(`INSERT INTO audit_logs (username, action, resource, result, ip, user_agent, details) 
	                        VALUES (?, ?, ?, ?, ?, ?, ?)`,
		l.Username, l.Action, l.Resource, l.Result, l.IP, l.UserAgent, l.Details)
	metrics.RecordDBQuery("CreateAuditLog", time.Since(start))
	return err
}

func (d *Database) ListAuditLogs(limit, offset int) ([]*AuditLogRecord, error) {
	start := time.Now()
	rows, err := d.db.Query(`SELECT id, timestamp, username, action, resource, result, ip, user_agent, details 
	                          FROM audit_logs ORDER BY timestamp DESC LIMIT ? OFFSET ?`, limit, offset)
	metrics.RecordDBQuery("ListAuditLogs", time.Since(start))
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	logs := []*AuditLogRecord{}
	for rows.Next() {
		l := &AuditLogRecord{}
		err := rows.Scan(&l.ID, &l.Timestamp, &l.Username, &l.Action, &l.Resource, &l.Result, &l.IP, &l.UserAgent, &l.Details)
		if err != nil {
			return nil, err
		}
		logs = append(logs, l)
	}
	return logs, nil
}

func (d *Database) CreateStorageSnapshot(bucket string, size int64) error {
	start := time.Now()
	_, err := d.db.Exec(`INSERT INTO storage_snapshots (bucket, size) VALUES (?, ?)`, bucket, size)
	metrics.RecordDBQuery("CreateStorageSnapshot", time.Since(start))
	return err
}

func (d *Database) HasSnapshotForToday(bucket string) (bool, error) {
	start := time.Now()
	var count int
	// Check if a snapshot exists for this bucket with today's date (UTC)
	err := d.db.QueryRow(`SELECT count(*) FROM storage_snapshots 
	                      WHERE bucket = ? AND date(timestamp) = date('now')`, bucket).Scan(&count)
	metrics.RecordDBQuery("HasSnapshotForToday", time.Since(start))
	return count > 0, err
}

func (d *Database) GetStorageHistory(days int) ([]*StorageSnapshotRecord, error) {
	start := time.Now()
	rows, err := d.db.Query(`SELECT id, timestamp, bucket, size 
	                          FROM storage_snapshots 
	                          WHERE timestamp >= date('now', ?) 
	                          ORDER BY timestamp ASC`, fmt.Sprintf("-%d days", days))
	metrics.RecordDBQuery("GetStorageHistory", time.Since(start))
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	history := []*StorageSnapshotRecord{}
	for rows.Next() {
		s := &StorageSnapshotRecord{}
		err := rows.Scan(&s.ID, &s.Timestamp, &s.Bucket, &s.Size)
		if err != nil {
			return nil, err
		}
		history = append(history, s)
	}
	return history, nil
}

func (d *Database) GetActionTrends(days int) (map[string][]map[string]interface{}, error) {
	start := time.Now()
	// Group by date and action
	rows, err := d.db.Query(`SELECT strftime('%Y-%m-%d', timestamp) as day, action, count(*) as count 
	                          FROM audit_logs 
	                          WHERE timestamp >= date('now', ?) 
	                          GROUP BY day, action 
	                          ORDER BY day ASC`, fmt.Sprintf("-%d days", days))
	metrics.RecordDBQuery("GetActionTrends", time.Since(start))
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	trends := make(map[string][]map[string]interface{})
	for rows.Next() {
		var day, action string
		var count int
		if err := rows.Scan(&day, &action, &count); err != nil {
			return nil, err
		}
		trends[action] = append(trends[action], map[string]interface{}{
			"day":   day,
			"count": count,
		})
	}
	return trends, nil
}

func (d *Database) GetSystemSetting(key string) (string, error) {
	start := time.Now()
	var value string
	err := d.db.QueryRow("SELECT value FROM system_settings WHERE key = ?", key).Scan(&value)
	metrics.RecordDBQuery("GetSystemSetting", time.Since(start))
	if err == sql.ErrNoRows {
		return "", nil // Return empty string if not found
	}
	return value, err
}

func (d *Database) SetSystemSetting(key, value string) error {
	start := time.Now()
	_, err := d.db.Exec(`INSERT INTO system_settings (key, value, updated_at) 
	                      VALUES (?, ?, CURRENT_TIMESTAMP)
	                      ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = CURRENT_TIMESTAMP`,
		key, value, value)
	metrics.RecordDBQuery("SetSystemSetting", time.Since(start))
	return err
}
