use crate::error::{AppError, DbError};
use libsql::Connection;
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};

pub const NUM_SHARDS: usize = 16;

/// Deterministically computes the shard partition index (0..NUM_SHARDS-1) for a given bucket
pub fn get_shard_index(bucket: &str) -> usize {
    let mut hasher = DefaultHasher::new();
    bucket.hash(&mut hasher);
    (hasher.finish() as usize) % NUM_SHARDS
}

/// Returns the partitioned table name for a bucket (e.g. "objects_04")
pub fn object_table_for_bucket(bucket: &str) -> String {
    let idx = get_shard_index(bucket);
    format!("objects_{idx:02}")
}

/// Initializes all 16 partitioned tables and the unified `objects_all` view inside the database
pub async fn init_partitioned_tables(conn: &Connection) -> Result<(), AppError> {
    for idx in 0..NUM_SHARDS {
        let table = format!("objects_{idx:02}");
        let ddl = format!(
            r#"CREATE TABLE IF NOT EXISTS {table} (
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
                UNIQUE(bucket, key, version_id)
            );
            CREATE INDEX IF NOT EXISTS idx_{table}_bucket_key ON {table}(bucket, key);
            CREATE INDEX IF NOT EXISTS idx_{table}_bucket_key_latest ON {table}(bucket, key, is_latest);
            CREATE INDEX IF NOT EXISTS idx_{table}_latest ON {table}(bucket, is_latest) WHERE is_latest = TRUE;
            CREATE INDEX IF NOT EXISTS idx_{table}_trash ON {table}(bucket, deleted_at) WHERE deleted_at IS NOT NULL;"#
        );

        for stmt in ddl.split(';') {
            let trimmed = stmt.trim();
            if !trimmed.is_empty() {
                conn.execute(trimmed, ()).await.map_err(|e| {
                    DbError::Query(format!("Failed to init shard table {table}: {e}"))
                })?;
            }
        }
    }

    // Build unified view: objects_all
    let mut union_parts = Vec::with_capacity(NUM_SHARDS);
    for idx in 0..NUM_SHARDS {
        union_parts.push(format!("SELECT *, {idx} AS shard_idx FROM objects_{idx:02}"));
    }
    let view_ddl = format!(
        "CREATE VIEW IF NOT EXISTS objects_all AS {};",
        union_parts.join(" UNION ALL ")
    );

    let _ = conn.execute(&view_ddl, ()).await;

    // Optional migration: copy any existing records from unpartitioned `objects` table into partitioned tables
    for idx in 0..NUM_SHARDS {
        let table = format!("objects_{idx:02}");
        let migrate_sql = format!(
            "INSERT OR IGNORE INTO {table} SELECT * FROM objects WHERE deleted_at IS NULL;"
        );
        let _ = conn.execute(&migrate_sql, ()).await;
    }

    Ok(())
}
