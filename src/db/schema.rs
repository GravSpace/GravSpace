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

CREATE TABLE IF NOT EXISTS remote_servers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    endpoint TEXT NOT NULL,
    s3_endpoint TEXT,
    access_key TEXT NOT NULL,
    secret_key TEXT NOT NULL,
    status TEXT DEFAULT 'healthy',
    latency_ms INTEGER DEFAULT 0,
    last_heartbeat TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cross_server_shares (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    source_bucket TEXT NOT NULL,
    source_prefix TEXT DEFAULT '',
    remote_server_id INTEGER NOT NULL,
    target_bucket TEXT NOT NULL,
    target_prefix TEXT DEFAULT '',
    sync_mode TEXT DEFAULT 'one_way',
    enabled BOOLEAN DEFAULT TRUE,
    status TEXT DEFAULT 'in_sync',
    last_synced_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (remote_server_id) REFERENCES remote_servers(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sync_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    share_id INTEGER NOT NULL,
    source_bucket TEXT NOT NULL,
    source_key TEXT NOT NULL,
    target_bucket TEXT NOT NULL,
    target_key TEXT NOT NULL,
    action TEXT NOT NULL,
    version_id TEXT DEFAULT '',
    content_hash TEXT,
    size_bytes INTEGER DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending',
    attempts INTEGER DEFAULT 0,
    max_attempts INTEGER DEFAULT 10,
    next_retry_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_error TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (share_id) REFERENCES cross_server_shares(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_sync_queue_status_retry ON sync_queue(status, next_retry_at);

CREATE TABLE IF NOT EXISTS vault_secrets (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    environment TEXT NOT NULL DEFAULT 'development',
    secret_type TEXT NOT NULL DEFAULT 'kv',
    description TEXT,
    tags TEXT,
    current_version INTEGER NOT NULL DEFAULT 1,
    encrypted_value TEXT NOT NULL,
    metadata_json TEXT,
    requires_approval BOOLEAN DEFAULT FALSE,
    created_by TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(environment, name)
);
CREATE INDEX IF NOT EXISTS idx_vault_secrets_env ON vault_secrets(environment);
CREATE INDEX IF NOT EXISTS idx_vault_secrets_type ON vault_secrets(secret_type);

CREATE TABLE IF NOT EXISTS vault_secret_versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    secret_id TEXT NOT NULL,
    version INTEGER NOT NULL,
    encrypted_value TEXT NOT NULL,
    metadata_json TEXT,
    comment TEXT,
    created_by TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (secret_id) REFERENCES vault_secrets(id) ON DELETE CASCADE,
    UNIQUE(secret_id, version)
);

CREATE TABLE IF NOT EXISTS vault_access_requests (
    id TEXT PRIMARY KEY,
    secret_id TEXT,
    environment TEXT NOT NULL,
    requester TEXT NOT NULL,
    justification TEXT NOT NULL,
    requested_duration_minutes INTEGER NOT NULL DEFAULT 60,
    status TEXT NOT NULL DEFAULT 'pending',
    reviewed_by TEXT,
    reviewed_at TIMESTAMP,
    review_comment TEXT,
    access_granted_until TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (secret_id) REFERENCES vault_secrets(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_vault_access_requests_status ON vault_access_requests(status);
CREATE TABLE IF NOT EXISTS vault_projects (
    id TEXT PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT,
    color TEXT NOT NULL DEFAULT 'indigo',
    icon TEXT NOT NULL DEFAULT 'folder',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_vault_projects_slug ON vault_projects(slug);

INSERT OR IGNORE INTO vault_projects (id, slug, name, description, color, icon)
VALUES 
    ('proj_default', 'default', 'Default Project', 'General and shared system secrets', 'indigo', 'folder');

CREATE TABLE IF NOT EXISTS vault_environments (
    id TEXT PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT 'sky',
    description TEXT,
    position INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_vault_environments_position ON vault_environments(position);

INSERT OR IGNORE INTO vault_environments (id, slug, name, color, description, position)
VALUES 
    ('env_dev', 'development', 'Development', 'sky', 'Local development environment', 1),
    ('env_staging', 'staging', 'Staging', 'amber', 'Pre-production staging environment', 2),
    ('env_prod', 'production', 'Production', 'rose', 'Live customer-facing environment', 3);
"#;
