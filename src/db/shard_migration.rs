use crate::db::settings;
use crate::db::shards::{
    get_shard_index, object_table_for_bucket, object_tags_table_for_bucket, shard_table_name,
    tag_table_name, NUM_SHARDS,
};
use crate::error::{AppError, DbError};
use libsql::{params, Connection};

const OBJECT_DATA_COLS: &str = "bucket, key, version_id, size, etag, content_type, modified_at, \
    is_latest, encryption_type, retain_until_date, legal_hold, lock_mode, deleted_at, \
    legal_hold_reason, content_hash, compression_type, original_size, is_deduplicated";

const MIGRATION_KEY: &str = "sharding_migration_v3";

/// Idempotently repairs mis-routed shard rows/tags (including FNV-1a rebalancing) and migrates legacy `objects`.
pub async fn migrate_to_sharded_tables(conn: &Connection) -> Result<(), AppError> {
    if settings::get_setting(conn, MIGRATION_KEY).await?.as_deref() == Some("done") {
        return Ok(());
    }

    let repaired_buckets = repair_misrouted_shards(conn).await?;
    let migrated_rows = migrate_legacy_objects_table(conn).await?;

    settings::set_setting(conn, MIGRATION_KEY, "done").await?;
    if repaired_buckets > 0 || migrated_rows > 0 {
        tracing::info!(
            "Shard migration v3 completed: relocated {repaired_buckets} bucket partition(s) to FNV-1a shards, migrated {migrated_rows} legacy object row(s)"
        );
    }
    Ok(())
}

/// Moves rows and tags in wrong `objects_XX` partitions to their FNV-1a target shard.
async fn repair_misrouted_shards(conn: &Connection) -> Result<usize, AppError> {
    let mut repaired = 0usize;
    for idx in 0..NUM_SHARDS {
        let old_obj_table = shard_table_name(idx);
        let old_tag_table = tag_table_name(idx);
        let buckets = distinct_buckets_in_table(conn, &old_obj_table).await?;

        for bucket in buckets {
            if get_shard_index(&bucket) == idx {
                continue;
            }
            let new_obj_table = object_table_for_bucket(&bucket);
            let new_tag_table = object_tags_table_for_bucket(&bucket);

            copy_bucket_rows(conn, &old_obj_table, &new_obj_table, &bucket).await?;
            migrate_bucket_tags(
                conn,
                &bucket,
                &old_obj_table,
                &old_tag_table,
                &new_obj_table,
                &new_tag_table,
            )
            .await?;

            let del_sql = format!("DELETE FROM {old_obj_table} WHERE bucket = ?1");
            conn.execute(&del_sql, params![bucket.as_str()])
                .await
                .map_err(|e| DbError::Query(format!("Failed deleting relocated rows from {old_obj_table}: {e}")))?;
            repaired += 1;
        }
    }
    Ok(repaired)
}

/// Migrates all rows (active and soft-deleted) and tags from legacy `objects` -> target shards, verifies counts, then clears `objects`.
async fn migrate_legacy_objects_table(conn: &Connection) -> Result<i64, AppError> {
    let legacy_buckets = distinct_buckets_in_table(conn, "objects").await?;
    if legacy_buckets.is_empty() {
        return Ok(0);
    }

    let mut total_verified: i64 = 0;
    for bucket in &legacy_buckets {
        let target_table = object_table_for_bucket(bucket);
        let target_tag_table = object_tags_table_for_bucket(bucket);
        copy_bucket_rows(conn, "objects", &target_table, bucket).await?;
        migrate_bucket_tags(
            conn,
            bucket,
            "objects",
            "object_tags",
            &target_table,
            &target_tag_table,
        )
        .await?;

        let legacy_count = count_bucket_rows(conn, "objects", bucket).await?;
        let target_count = count_bucket_rows(conn, &target_table, bucket).await?;
        if target_count < legacy_count {
            return Err(DbError::Query(format!(
                "Shard migration aborted for bucket '{bucket}': target {target_table} has {target_count} rows, expected >= {legacy_count}"
            ))
            .into());
        }
        total_verified += legacy_count;
    }

    conn.execute("DELETE FROM objects", ())
        .await
        .map_err(|e| DbError::Query(format!("Failed clearing legacy objects table: {e}")))?;

    Ok(total_verified)
}

async fn distinct_buckets_in_table(conn: &Connection, table: &str) -> Result<Vec<String>, AppError> {
    let sql = format!("SELECT DISTINCT bucket FROM {table}");
    let mut rows = conn
        .query(&sql, ())
        .await
        .map_err(|e| DbError::Query(e.to_string()))?;
    let mut buckets = Vec::new();
    while let Some(row) = rows.next().await.map_err(|e| DbError::Query(e.to_string()))? {
        if let Ok(b) = row.get::<String>(0) {
            buckets.push(b);
        }
    }
    Ok(buckets)
}

async fn copy_bucket_rows(
    conn: &Connection,
    src_table: &str,
    dst_table: &str,
    bucket: &str,
) -> Result<(), AppError> {
    let sql = format!(
        "INSERT OR IGNORE INTO {dst_table} ({OBJECT_DATA_COLS}) \
         SELECT {OBJECT_DATA_COLS} FROM {src_table} WHERE bucket = ?1"
    );
    conn.execute(&sql, params![bucket])
        .await
        .map_err(|e| DbError::Query(format!("Failed copying '{bucket}' from {src_table} to {dst_table}: {e}")))?;
    Ok(())
}

async fn count_bucket_rows(conn: &Connection, table: &str, bucket: &str) -> Result<i64, AppError> {
    let sql = format!("SELECT COUNT(*) FROM {table} WHERE bucket = ?1");
    let mut rows = conn
        .query(&sql, params![bucket])
        .await
        .map_err(|e| DbError::Query(e.to_string()))?;
    if let Some(row) = rows.next().await.map_err(|e| DbError::Query(e.to_string()))? {
        Ok(row.get::<i64>(0).unwrap_or(0))
    } else {
        Ok(0)
    }
}

async fn migrate_bucket_tags(
    conn: &Connection,
    bucket: &str,
    src_obj_table: &str,
    src_tag_table: &str,
    dst_obj_table: &str,
    dst_tag_table: &str,
) -> Result<(), AppError> {
    let sql = format!(
        "SELECT ot.object_id, o.key, o.version_id, ot.tag_key, ot.tag_value \
         FROM {src_tag_table} ot JOIN {src_obj_table} o ON ot.object_id = o.id WHERE o.bucket = ?1"
    );
    let mut rows = conn
        .query(&sql, params![bucket])
        .await
        .map_err(|e| DbError::Query(e.to_string()))?;

    let mut pending = Vec::new();
    while let Some(row) = rows.next().await.map_err(|e| DbError::Query(e.to_string()))? {
        if let (Ok(old_id), Ok(key), Ok(vid), Ok(tk), Ok(tv)) = (
            row.get::<i64>(0),
            row.get::<String>(1),
            row.get::<String>(2),
            row.get::<String>(3),
            row.get::<String>(4),
        ) {
            pending.push((old_id, key, vid, tk, tv));
        }
    }

    for (old_id, key, vid, tk, tv) in pending {
        let find_sql = format!(
            "SELECT id FROM {dst_obj_table} WHERE bucket = ?1 AND key = ?2 AND version_id = ?3"
        );
        let mut id_rows = conn
            .query(&find_sql, params![bucket, key.as_str(), vid.as_str()])
            .await
            .map_err(|e| DbError::Query(e.to_string()))?;
        if let Some(id_row) = id_rows.next().await.map_err(|e| DbError::Query(e.to_string()))? {
            if let Ok(new_id) = id_row.get::<i64>(0) {
                let ins_sql = format!(
                    "INSERT OR IGNORE INTO {dst_tag_table} (object_id, tag_key, tag_value) VALUES (?1, ?2, ?3)"
                );
                conn.execute(&ins_sql, params![new_id, tk.as_str(), tv.as_str()])
                    .await
                    .map_err(|e| DbError::Query(e.to_string()))?;
                let del_sql = format!(
                    "DELETE FROM {src_tag_table} WHERE object_id = ?1 AND tag_key = ?2"
                );
                conn.execute(&del_sql, params![old_id, tk.as_str()])
                    .await
                    .map_err(|e| DbError::Query(e.to_string()))?;
            }
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::shards::init_partitioned_tables;
    use crate::db::Database;

    async fn count_query(conn: &Connection, sql: &str) -> i64 {
        let mut rows = conn.query(sql, ()).await.unwrap();
        rows.next().await.unwrap().unwrap().get::<i64>(0).unwrap()
    }

    async fn count_all_sharded_objects(conn: &Connection) -> i64 {
        let mut total = 0;
        for idx in 0..NUM_SHARDS {
            let table = shard_table_name(idx);
            total += count_query(conn, &format!("SELECT COUNT(*) FROM {table}")).await;
        }
        total
    }

    #[tokio::test]
    async fn fnv1a_hash_should_stay_stable_and_reshard_with_tags() {
        // Verify deterministic FNV-1a index stability
        let idx_alpha = get_shard_index("alpha");
        let idx_beta = get_shard_index("beta");
        assert_eq!(idx_alpha, get_shard_index("alpha"));
        assert!(idx_alpha < NUM_SHARDS && idx_beta < NUM_SHARDS);

        let tmp_dir =
            std::env::temp_dir().join(format!("grav_fnv_test_{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&tmp_dir).unwrap();
        let db = Database::open_turso(tmp_dir.join("test.db").to_str().unwrap())
            .await
            .unwrap();
        let conn = db.conn().unwrap();

        // Put a bucket in a deliberately wrong shard + tag in that wrong shard's tag table
        let wrong_idx = (idx_alpha + 1) % NUM_SHARDS;
        let wrong_obj = shard_table_name(wrong_idx);
        let wrong_tag = tag_table_name(wrong_idx);
        conn.execute(
            &format!("INSERT INTO {wrong_obj} (id, bucket, key, version_id, size) VALUES (77, 'alpha', 'k.txt', 'v1', 50)"),
            (),
        )
        .await
        .unwrap();
        conn.execute(
            &format!("INSERT INTO {wrong_tag} (object_id, tag_key, tag_value) VALUES (77, 'env', 'prod')"),
            (),
        )
        .await
        .unwrap();
        conn.execute(
            "DELETE FROM system_settings WHERE key = ?1",
            params![MIGRATION_KEY],
        )
        .await
        .unwrap();

        init_partitioned_tables(&conn).await.unwrap();

        // Old wrong shard & tag table should be empty; FNV-1a target shard & tag table should hold data
        assert_eq!(
            count_query(&conn, &format!("SELECT COUNT(*) FROM {wrong_obj} WHERE bucket = 'alpha'")).await,
            0
        );
        assert_eq!(count_query(&conn, &format!("SELECT COUNT(*) FROM {wrong_tag}")).await, 0);
        assert_eq!(count_all_sharded_objects(&conn).await, 1);

        let target_tag = object_tags_table_for_bucket("alpha");
        assert_eq!(count_query(&conn, &format!("SELECT COUNT(*) FROM {target_tag}")).await, 1);

        // Idempotent rerun keeps everything untouched
        init_partitioned_tables(&conn).await.unwrap();
        assert_eq!(count_all_sharded_objects(&conn).await, 1);

        let _ = std::fs::remove_dir_all(&tmp_dir);
    }

    #[tokio::test]
    async fn migrate_should_route_unsharded_active_and_trash_rows_to_exact_shard_and_clean_legacy() {
        let tmp_dir =
            std::env::temp_dir().join(format!("grav_shard_test_{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&tmp_dir).unwrap();
        let db = Database::open_local(tmp_dir.join("test.db").to_str().unwrap())
            .await
            .unwrap();
        let conn = db.conn().unwrap();

        for stmt in crate::db::schema::SCHEMA.split(';') {
            let t = stmt.trim();
            if !t.is_empty() {
                conn.execute(t, ()).await.unwrap();
            }
        }

        conn.execute("INSERT INTO buckets (name) VALUES ('alpha'), ('beta')", ())
            .await
            .unwrap();
        conn.execute(
            "INSERT INTO objects (bucket, key, version_id, size) VALUES \
             ('alpha', 'a.txt', 'v1', 10), ('beta', 'b.txt', 'v1', 20)",
            (),
        )
        .await
        .unwrap();
        conn.execute(
            "INSERT INTO objects (bucket, key, version_id, size, deleted_at) VALUES \
             ('alpha', 'trash.txt', 'v2', 30, CURRENT_TIMESTAMP)",
            (),
        )
        .await
        .unwrap();

        init_partitioned_tables(&conn).await.unwrap();

        assert_eq!(count_query(&conn, "SELECT COUNT(*) FROM objects").await, 0);
        assert_eq!(count_all_sharded_objects(&conn).await, 3);

        let _ = std::fs::remove_dir_all(&tmp_dir);
    }
}
