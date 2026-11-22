use crate::error::{AppError, DbError};
use libsql::{params, Connection};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ObjectRow {
    pub id: i64,
    pub bucket: String,
    pub key: String,
    pub version_id: String,
    pub size: i64,
    pub etag: Option<String>,
    pub content_type: Option<String>,
    pub modified_at: String,
    pub is_latest: bool,
    pub encryption_type: Option<String>,
    pub retain_until_date: Option<String>,
    pub legal_hold: bool,
    pub lock_mode: Option<String>,
    pub deleted_at: Option<String>,
    pub legal_hold_reason: Option<String>,
    pub content_hash: Option<String>,
    pub compression_type: Option<String>,
    pub original_size: Option<i64>,
    pub is_deduplicated: bool,
}

pub async fn upsert_object(conn: &Connection, obj: &ObjectRow) -> Result<(), AppError> {
    if obj.is_latest {
        conn.execute(
            "UPDATE objects SET is_latest = FALSE WHERE bucket = ?1 AND key = ?2",
            params![obj.bucket.as_str(), obj.key.as_str()],
        )
        .await
        .map_err(|e| DbError::Query(e.to_string()))?;
    }

    conn.execute(
        r#"INSERT INTO objects (
            bucket, key, version_id, size, etag, content_type, is_latest,
            encryption_type, retain_until_date, legal_hold, lock_mode,
            content_hash, compression_type, original_size, is_deduplicated
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)
        ON CONFLICT(bucket, key, version_id) DO UPDATE SET
            size = excluded.size,
            etag = excluded.etag,
            content_type = excluded.content_type,
            modified_at = CURRENT_TIMESTAMP,
            is_latest = excluded.is_latest,
            encryption_type = excluded.encryption_type,
            retain_until_date = excluded.retain_until_date,
            legal_hold = excluded.legal_hold,
            lock_mode = excluded.lock_mode,
            content_hash = excluded.content_hash,
            deleted_at = NULL"#,
        params![
            obj.bucket.as_str(),
            obj.key.as_str(),
            obj.version_id.as_str(),
            obj.size,
            obj.etag.clone(),
            obj.content_type.clone(),
            obj.is_latest as i64,
            obj.encryption_type.clone(),
            obj.retain_until_date.clone(),
            obj.legal_hold as i64,
            obj.lock_mode.clone(),
            obj.content_hash.clone(),
            obj.compression_type.clone(),
            obj.original_size,
            obj.is_deduplicated as i64
        ],
    )
    .await
    .map_err(|e| DbError::Query(e.to_string()))?;

    Ok(())
}

pub async fn get_object(
    conn: &Connection,
    bucket: &str,
    key: &str,
    version_id: &str,
) -> Result<Option<ObjectRow>, AppError> {
    let mut rows = if version_id.is_empty() {
        conn.query(
            "SELECT id, bucket, key, version_id, size, etag, content_type, modified_at,
                    is_latest, encryption_type, retain_until_date, legal_hold, lock_mode,
                    deleted_at, legal_hold_reason, content_hash, compression_type,
                    original_size, is_deduplicated
             FROM objects WHERE bucket = ?1 AND key = ?2 AND is_latest = TRUE AND deleted_at IS NULL",
            params![bucket, key],
        )
        .await
        .map_err(|e| DbError::Query(e.to_string()))?
    } else {
        conn.query(
            "SELECT id, bucket, key, version_id, size, etag, content_type, modified_at,
                    is_latest, encryption_type, retain_until_date, legal_hold, lock_mode,
                    deleted_at, legal_hold_reason, content_hash, compression_type,
                    original_size, is_deduplicated
             FROM objects WHERE bucket = ?1 AND key = ?2 AND version_id = ?3 AND deleted_at IS NULL",
            params![bucket, key, version_id],
        )
        .await
        .map_err(|e| DbError::Query(e.to_string()))?
    };

    if let Some(row) = rows.next().await.map_err(|e| DbError::Query(e.to_string()))? {
        Ok(Some(row_to_object(&row)?))
    } else {
        Ok(None)
    }
}

pub async fn list_objects(
    conn: &Connection,
    bucket: &str,
    prefix: &str,
) -> Result<Vec<ObjectRow>, AppError> {
    let mut rows = conn
        .query(
            "SELECT id, bucket, key, version_id, size, etag, content_type, modified_at,
                    is_latest, encryption_type, retain_until_date, legal_hold, lock_mode,
                    deleted_at, legal_hold_reason, content_hash, compression_type,
                    original_size, is_deduplicated
             FROM objects
             WHERE bucket = ?1 AND is_latest = TRUE AND deleted_at IS NULL AND key LIKE ?2
             ORDER BY key ASC",
            params![bucket, format!("{prefix}%")],
        )
        .await
        .map_err(|e| DbError::Query(e.to_string()))?;

    let mut results = Vec::new();
    while let Some(row) = rows.next().await.map_err(|e| DbError::Query(e.to_string()))? {
        results.push(row_to_object(&row)?);
    }
    Ok(results)
}

pub async fn list_object_versions(
    conn: &Connection,
    bucket: &str,
    prefix: &str,
) -> Result<Vec<ObjectRow>, AppError> {
    let mut rows = conn
        .query(
            "SELECT id, bucket, key, version_id, size, etag, content_type, modified_at,
                    is_latest, encryption_type, retain_until_date, legal_hold, lock_mode,
                    deleted_at, legal_hold_reason, content_hash, compression_type,
                    original_size, is_deduplicated
             FROM objects
             WHERE bucket = ?1 AND deleted_at IS NULL AND key LIKE ?2
             ORDER BY key ASC, modified_at DESC",
            params![bucket, format!("{prefix}%")],
        )
        .await
        .map_err(|e| DbError::Query(e.to_string()))?;

    let mut results = Vec::new();
    while let Some(row) = rows.next().await.map_err(|e| DbError::Query(e.to_string()))? {
        results.push(row_to_object(&row)?);
    }
    Ok(results)
}

pub async fn soft_delete_object(
    conn: &Connection,
    bucket: &str,
    key: &str,
    version_id: &str,
) -> Result<(), AppError> {
    if version_id.is_empty() {
        conn.execute(
            "UPDATE objects SET deleted_at = CURRENT_TIMESTAMP WHERE bucket = ?1 AND key = ?2",
            params![bucket, key],
        )
        .await
        .map_err(|e| DbError::Query(e.to_string()))?;
    } else {
        conn.execute(
            "UPDATE objects SET deleted_at = CURRENT_TIMESTAMP WHERE bucket = ?1 AND key = ?2 AND version_id = ?3",
            params![bucket, key, version_id],
        )
        .await
        .map_err(|e| DbError::Query(e.to_string()))?;
    }
    Ok(())
}

pub async fn hard_delete_object(
    conn: &Connection,
    bucket: &str,
    key: &str,
    version_id: &str,
) -> Result<(), AppError> {
    if version_id.is_empty() {
        conn.execute(
            "DELETE FROM objects WHERE bucket = ?1 AND key = ?2",
            params![bucket, key],
        )
        .await
        .map_err(|e| DbError::Query(e.to_string()))?;
    } else {
        conn.execute(
            "DELETE FROM objects WHERE bucket = ?1 AND key = ?2 AND version_id = ?3",
            params![bucket, key, version_id],
        )
        .await
        .map_err(|e| DbError::Query(e.to_string()))?;
    }
    Ok(())
}

pub async fn restore_object(
    conn: &Connection,
    bucket: &str,
    key: &str,
    version_id: &str,
) -> Result<(), AppError> {
    if version_id.is_empty() {
        conn.execute(
            "UPDATE objects SET deleted_at = NULL WHERE bucket = ?1 AND key = ?2",
            params![bucket, key],
        )
        .await
        .map_err(|e| DbError::Query(e.to_string()))?;
    } else {
        conn.execute(
            "UPDATE objects SET deleted_at = NULL WHERE bucket = ?1 AND key = ?2 AND version_id = ?3",
            params![bucket, key, version_id],
        )
        .await
        .map_err(|e| DbError::Query(e.to_string()))?;
    }
    Ok(())
}

pub async fn list_trash(
    conn: &Connection,
    bucket: &str,
    search: &str,
) -> Result<Vec<ObjectRow>, AppError> {
    let mut rows = if bucket.is_empty() {
        if search.is_empty() {
            conn.query(
                "SELECT id, bucket, key, version_id, size, etag, content_type, modified_at,
                        is_latest, encryption_type, retain_until_date, legal_hold, lock_mode,
                        deleted_at, legal_hold_reason, content_hash, compression_type,
                        original_size, is_deduplicated
                 FROM objects
                 WHERE deleted_at IS NOT NULL
                 ORDER BY deleted_at DESC",
                params![],
            )
            .await
            .map_err(|e| DbError::Query(e.to_string()))?
        } else {
            conn.query(
                "SELECT id, bucket, key, version_id, size, etag, content_type, modified_at,
                        is_latest, encryption_type, retain_until_date, legal_hold, lock_mode,
                        deleted_at, legal_hold_reason, content_hash, compression_type,
                        original_size, is_deduplicated
                 FROM objects
                 WHERE deleted_at IS NOT NULL AND (key LIKE ?1 OR bucket LIKE ?1)
                 ORDER BY deleted_at DESC",
                params![format!("%{search}%")],
            )
            .await
            .map_err(|e| DbError::Query(e.to_string()))?
        }
    } else {
        conn.query(
            "SELECT id, bucket, key, version_id, size, etag, content_type, modified_at,
                    is_latest, encryption_type, retain_until_date, legal_hold, lock_mode,
                    deleted_at, legal_hold_reason, content_hash, compression_type,
                    original_size, is_deduplicated
             FROM objects
             WHERE bucket = ?1 AND deleted_at IS NOT NULL AND key LIKE ?2
             ORDER BY deleted_at DESC",
            params![bucket, format!("%{search}%")],
        )
        .await
        .map_err(|e| DbError::Query(e.to_string()))?
    };

    let mut results = Vec::new();
    while let Some(row) = rows.next().await.map_err(|e| DbError::Query(e.to_string()))? {
        results.push(row_to_object(&row)?);
    }
    Ok(results)
}

pub async fn set_object_retention(
    conn: &Connection,
    bucket: &str,
    key: &str,
    version_id: &str,
    retain_until: Option<&str>,
    mode: Option<&str>,
) -> Result<(), AppError> {
    if version_id.is_empty() {
        conn.execute(
            "UPDATE objects SET retain_until_date = ?1, lock_mode = ?2 WHERE bucket = ?3 AND key = ?4 AND (is_latest = 1 OR version_id = '' OR version_id IS NULL)",
            params![retain_until, mode, bucket, key],
        )
        .await
        .map_err(|e| DbError::Query(e.to_string()))?;
    } else {
        conn.execute(
            "UPDATE objects SET retain_until_date = ?1, lock_mode = ?2 WHERE bucket = ?3 AND key = ?4 AND version_id = ?5",
            params![retain_until, mode, bucket, key, version_id],
        )
        .await
        .map_err(|e| DbError::Query(e.to_string()))?;
    }
    Ok(())
}

pub async fn set_object_legal_hold(
    conn: &Connection,
    bucket: &str,
    key: &str,
    version_id: &str,
    hold: bool,
    reason: &str,
) -> Result<(), AppError> {
    if version_id.is_empty() {
        conn.execute(
            "UPDATE objects SET legal_hold = ?1, legal_hold_reason = ?2 WHERE bucket = ?3 AND key = ?4 AND (is_latest = 1 OR version_id = '' OR version_id IS NULL)",
            params![hold as i64, reason, bucket, key],
        )
        .await
        .map_err(|e| DbError::Query(e.to_string()))?;
    } else {
        conn.execute(
            "UPDATE objects SET legal_hold = ?1, legal_hold_reason = ?2 WHERE bucket = ?3 AND key = ?4 AND version_id = ?5",
            params![hold as i64, reason, bucket, key, version_id],
        )
        .await
        .map_err(|e| DbError::Query(e.to_string()))?;
    }
    Ok(())
}

pub async fn put_object_tagging(
    conn: &Connection,
    object_id: i64,
    tags: &HashMap<String, String>,
) -> Result<(), AppError> {
    conn.execute("DELETE FROM object_tags WHERE object_id = ?1", params![object_id])
        .await
        .map_err(|e| DbError::Query(e.to_string()))?;

    for (k, v) in tags {
        conn.execute(
            "INSERT INTO object_tags (object_id, tag_key, tag_value) VALUES (?1, ?2, ?3)",
            params![object_id, k.as_str(), v.as_str()],
        )
        .await
        .map_err(|e| DbError::Query(e.to_string()))?;
    }
    Ok(())
}

pub async fn get_object_tagging(
    conn: &Connection,
    object_id: i64,
) -> Result<HashMap<String, String>, AppError> {
    let mut rows = conn
        .query(
            "SELECT tag_key, tag_value FROM object_tags WHERE object_id = ?1",
            params![object_id],
        )
        .await
        .map_err(|e| DbError::Query(e.to_string()))?;

    let mut map = HashMap::new();
    while let Some(row) = rows.next().await.map_err(|e| DbError::Query(e.to_string()))? {
        if let (Ok(k), Ok(v)) = (row.get::<String>(0), row.get::<String>(1)) {
            map.insert(k, v);
        }
    }
    Ok(map)
}

fn row_to_object(row: &libsql::Row) -> Result<ObjectRow, AppError> {
    let is_latest: i64 = row.get(8).unwrap_or(0);
    let legal_hold: i64 = row.get(11).unwrap_or(0);
    let is_deduplicated: i64 = row.get(18).unwrap_or(0);

    Ok(ObjectRow {
        id: row.get(0).map_err(|e| DbError::Query(e.to_string()))?,
        bucket: row.get(1).map_err(|e| DbError::Query(e.to_string()))?,
        key: row.get(2).map_err(|e| DbError::Query(e.to_string()))?,
        version_id: row.get(3).unwrap_or_default(),
        size: row.get(4).unwrap_or(0),
        etag: row.get(5).ok(),
        content_type: row.get(6).ok(),
        modified_at: row.get(7).unwrap_or_default(),
        is_latest: is_latest != 0,
        encryption_type: row.get(9).ok(),
        retain_until_date: row.get(10).ok(),
        legal_hold: legal_hold != 0,
        lock_mode: row.get(12).ok(),
        deleted_at: row.get(13).ok(),
        legal_hold_reason: row.get(14).ok(),
        content_hash: row.get(15).ok(),
        compression_type: row.get(16).ok(),
        original_size: row.get(17).ok(),
        is_deduplicated: is_deduplicated != 0,
    })
}
