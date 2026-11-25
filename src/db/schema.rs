pub const SCHEMA: &str = r#"
CREATE TABLE IF NOT EXISTS buckets (
    name TEXT PRIMARY KEY,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    owner TEXT,
    versioning_enabled BOOLEAN DEFAULT FALSE,
    object_lock_enabled BOOLEAN DEFAULT FALSE,
    default_retention_mode TEXT,
    default_retention_days INTEGER,
    soft_delete_enabled BOOLEAN DEFAULT FALSE,
    soft_delete_retention INTEGER DEFAULT 30,
    quota_bytes INTEGER DEFAULT 0
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

CREATE INDEX IF NOT EXISTS idx_objects_bucket_key ON objects(bucket, key);
CREATE INDEX IF NOT EXISTS idx_objects_bucket_key_latest ON objects(bucket, key, is_latest);
CREATE INDEX IF NOT EXISTS idx_objects_latest ON objects(bucket, is_latest) WHERE is_latest = TRUE;
CREATE INDEX IF NOT EXISTS idx_objects_trash_cleanup ON objects(bucket, deleted_at) WHERE deleted_at IS NOT NULL;

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
    website_config TEXT,
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
    modified_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
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
    policy_data TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (username) REFERENCES users(username) ON DELETE CASCADE,
    UNIQUE(username, name)
);

CREATE TABLE IF NOT EXISTS global_policies (
    name TEXT PRIMARY KEY,
    policy_data TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_audit_logs_username ON audit_logs(username);

CREATE TABLE IF NOT EXISTS storage_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    bucket TEXT NOT NULL,
    size INTEGER NOT NULL,
    FOREIGN KEY (bucket) REFERENCES buckets(name) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_storage_snapshots_timestamp ON storage_snapshots(timestamp);

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

CREATE TABLE IF NOT EXISTS webhook_dlq (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    webhook_id INTEGER,
    bucket TEXT NOT NULL,
    url TEXT NOT NULL,
    event_name TEXT NOT NULL,
    payload TEXT NOT NULL,
    error_message TEXT,
    failed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (webhook_id) REFERENCES webhooks(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS system_settings (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS used_signatures (
    signature TEXT PRIMARY KEY,
    expires_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS presigned_urls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bucket TEXT NOT NULL,
    key TEXT NOT NULL,
    url TEXT NOT NULL,
    signature TEXT UNIQUE NOT NULL,
    method TEXT DEFAULT 'GET',
    expires_at TIMESTAMP NOT NULL,
    allowed_ip TEXT,
    one_time_use BOOLEAN DEFAULT FALSE,
    is_revoked BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (bucket) REFERENCES buckets(name) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS revoked_signatures (
    signature TEXT PRIMARY KEY,
    revoked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS bucket_replications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_bucket TEXT NOT NULL,
    destination_bucket TEXT NOT NULL,
    prefix TEXT,
    enabled BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (source_bucket) REFERENCES buckets(name) ON DELETE CASCADE,
    FOREIGN KEY (destination_bucket) REFERENCES buckets(name) ON DELETE CASCADE,
    UNIQUE(source_bucket, destination_bucket, prefix)
);
"#;
