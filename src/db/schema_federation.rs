pub const SCHEMA: &str = r#"
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

CREATE TABLE IF NOT EXISTS federation_inbound_shares (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_node TEXT NOT NULL,
    source_bucket TEXT NOT NULL,
    source_prefix TEXT DEFAULT '',
    target_bucket TEXT NOT NULL,
    target_prefix TEXT DEFAULT '',
    sync_mode TEXT DEFAULT 'one_way',
    share_name TEXT DEFAULT '',
    last_synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(source_node, source_bucket, source_prefix, target_bucket, target_prefix)
);
CREATE INDEX IF NOT EXISTS idx_inbound_target_bucket ON federation_inbound_shares(target_bucket);
"#;
