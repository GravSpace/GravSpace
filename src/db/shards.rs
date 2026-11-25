use crate::error::{AppError, DbError};
use libsql::Connection;

pub const NUM_SHARDS: usize = 16;

/// Deterministically computes the shard partition index (0..NUM_SHARDS-1) using FNV-1a 64-bit.
/// Stable across all Rust compiler versions, OSes, and CPU architectures.
pub fn get_shard_index(bucket: &str) -> usize {
    const FNV_OFFSET_BASIS: u64 = 0xcbf2_9ce4_8422_2325;
    const FNV_PRIME: u64 = 0x0100_0000_01b3;
    let mut hash = FNV_OFFSET_BASIS;
    for byte in bucket.as_bytes() {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(FNV_PRIME);
    }
    (hash as usize) % NUM_SHARDS
}

/// Returns the partitioned object table name for a given shard index (e.g. "objects_04")
pub fn shard_table_name(idx: usize) -> String {
    format!("objects_{idx:02}")
}

/// Returns the partitioned tag table name for a given shard index (e.g. "object_tags_04")
pub fn tag_table_name(idx: usize) -> String {
    format!("object_tags_{idx:02}")
}

/// Returns the partitioned object table name for a bucket (e.g. "objects_04")
pub fn object_table_for_bucket(bucket: &str) -> String {
    shard_table_name(get_shard_index(bucket))
}

/// Returns the partitioned tag table name for a bucket (e.g. "object_tags_04")
pub fn object_tags_table_for_bucket(bucket: &str) -> String {
    tag_table_name(get_shard_index(bucket))
}

/// Initializes all 16 object + tag partitions, the `objects_all` view, and runs shard migration
pub async fn init_partitioned_tables(conn: &Connection) -> Result<(), AppError> {
    for idx in 0..NUM_SHARDS {
        init_single_shard(conn, idx).await?;
    }
    ensure_objects_all_view(conn).await?;
    crate::db::shard_migration::migrate_to_sharded_tables(conn).await?;
    Ok(())
}

async fn init_single_shard(conn: &Connection, idx: usize) -> Result<(), AppError> {
    let table = shard_table_name(idx);
    let tag_table = tag_table_name(idx);
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
        CREATE INDEX IF NOT EXISTS idx_{table}_trash ON {table}(bucket, deleted_at) WHERE deleted_at IS NOT NULL;
        CREATE TABLE IF NOT EXISTS {tag_table} (
            object_id INTEGER NOT NULL,
            tag_key TEXT NOT NULL,
            tag_value TEXT NOT NULL,
            PRIMARY KEY (object_id, tag_key)
        );"#
    );

    for stmt in ddl.split(';') {
        let trimmed = stmt.trim();
        if !trimmed.is_empty() {
            conn.execute(trimmed, ()).await.map_err(|e| {
                DbError::Query(format!("Failed to init shard {table}/{tag_table}: {e}"))
            })?;
        }
    }
    Ok(())
}

async fn ensure_objects_all_view(conn: &Connection) -> Result<(), AppError> {
    let mut view_rows = conn
        .query(
            "SELECT 1 FROM sqlite_master WHERE type = 'view' AND name = 'objects_all' LIMIT 1",
            (),
        )
        .await
        .map_err(|e| DbError::Query(e.to_string()))?;
    let view_exists = view_rows
        .next()
        .await
        .map_err(|e| DbError::Query(e.to_string()))?
        .is_some();

    if !view_exists {
        let union_parts: Vec<String> = (0..NUM_SHARDS)
            .map(|idx| format!("SELECT *, {idx} AS shard_idx FROM {}", shard_table_name(idx)))
            .collect();
        let view_ddl = format!(
            "CREATE VIEW IF NOT EXISTS objects_all AS {};",
            union_parts.join(" UNION ALL ")
        );
        conn.execute(&view_ddl, ())
            .await
            .map_err(|e| DbError::Query(format!("Failed to create objects_all view: {e}")))?;
    }
    Ok(())
}
