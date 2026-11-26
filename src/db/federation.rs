use crate::error::{AppError, DbError};
use libsql::{params, Connection};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RemoteServerRow {
    pub id: i64,
    pub name: String,
    pub endpoint: String,
    pub s3_endpoint: Option<String>,
    pub access_key: String,
    pub secret_key: String,
    pub status: String,
    pub latency_ms: i64,
    pub last_heartbeat: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CrossServerShareRow {
    pub id: i64,
    pub name: String,
    pub source_bucket: String,
    pub source_prefix: String,
    pub remote_server_id: i64,
    pub remote_server_name: Option<String>,
    pub remote_endpoint: Option<String>,
    pub target_bucket: String,
    pub target_prefix: String,
    pub sync_mode: String,
    pub enabled: bool,
    pub status: String,
    pub last_synced_at: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncQueueRow {
    pub id: i64,
    pub share_id: i64,
    pub source_bucket: String,
    pub source_key: String,
    pub target_bucket: String,
    pub target_key: String,
    pub action: String,
    pub version_id: String,
    pub content_hash: Option<String>,
    pub size_bytes: i64,
    pub status: String,
    pub attempts: i64,
    pub max_attempts: i64,
    pub next_retry_at: String,
    pub last_error: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

// ================= REMOTE SERVERS CRUD =================

pub async fn list_remote_servers(conn: &Connection) -> Result<Vec<RemoteServerRow>, AppError> {
    let mut rows = conn
        .query(
            "SELECT id, name, endpoint, s3_endpoint, access_key, secret_key, status, latency_ms, last_heartbeat, created_at
             FROM remote_servers ORDER BY id ASC",
            params![],
        )
        .await
        .map_err(|e| DbError::Query(e.to_string()))?;

    let mut list = Vec::new();
    while let Some(row) = rows.next().await.map_err(|e| DbError::Query(e.to_string()))? {
        list.push(RemoteServerRow {
            id: row.get(0).map_err(|e| DbError::Query(e.to_string()))?,
            name: row.get(1).unwrap_or_default(),
            endpoint: row.get(2).unwrap_or_default(),
            s3_endpoint: row.get(3).ok(),
            access_key: row.get(4).unwrap_or_default(),
            secret_key: row.get(5).unwrap_or_default(),
            status: row.get(6).unwrap_or_else(|_| "healthy".to_string()),
            latency_ms: row.get(7).unwrap_or(0),
            last_heartbeat: row.get(8).ok(),
            created_at: row.get(9).unwrap_or_default(),
        });
    }
    Ok(list)
}

pub async fn get_remote_server(conn: &Connection, id: i64) -> Result<Option<RemoteServerRow>, AppError> {
    let mut rows = conn
        .query(
            "SELECT id, name, endpoint, s3_endpoint, access_key, secret_key, status, latency_ms, last_heartbeat, created_at
             FROM remote_servers WHERE id = ?1",
            params![id],
        )
        .await
        .map_err(|e| DbError::Query(e.to_string()))?;

    if let Some(row) = rows.next().await.map_err(|e| DbError::Query(e.to_string()))? {
        Ok(Some(RemoteServerRow {
            id: row.get(0).map_err(|e| DbError::Query(e.to_string()))?,
            name: row.get(1).unwrap_or_default(),
            endpoint: row.get(2).unwrap_or_default(),
            s3_endpoint: row.get(3).ok(),
            access_key: row.get(4).unwrap_or_default(),
            secret_key: row.get(5).unwrap_or_default(),
            status: row.get(6).unwrap_or_else(|_| "healthy".to_string()),
            latency_ms: row.get(7).unwrap_or(0),
            last_heartbeat: row.get(8).ok(),
            created_at: row.get(9).unwrap_or_default(),
        }))
    } else {
        Ok(None)
    }
}

pub async fn create_remote_server(
    conn: &Connection,
    name: &str,
    endpoint: &str,
    s3_endpoint: Option<&str>,
    access_key: &str,
    secret_key: &str,
) -> Result<i64, AppError> {
    conn.execute(
        "INSERT INTO remote_servers (name, endpoint, s3_endpoint, access_key, secret_key)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![name, endpoint, s3_endpoint, access_key, secret_key],
    )
    .await
    .map_err(|e| DbError::Query(e.to_string()))?;

    let mut rows = conn
        .query("SELECT last_insert_rowid()", params![])
        .await
        .map_err(|e| DbError::Query(e.to_string()))?;
    if let Some(row) = rows.next().await.map_err(|e| DbError::Query(e.to_string()))? {
        Ok(row.get(0).unwrap_or(0))
    } else {
        Ok(0)
    }
}

pub async fn update_server_status(
    conn: &Connection,
    id: i64,
    status: &str,
    latency_ms: i64,
) -> Result<(), AppError> {
    conn.execute(
        "UPDATE remote_servers SET status = ?1, latency_ms = ?2, last_heartbeat = CURRENT_TIMESTAMP WHERE id = ?3",
        params![status, latency_ms, id],
    )
    .await
    .map_err(|e| DbError::Query(e.to_string()))?;
    Ok(())
}

pub async fn delete_remote_server(conn: &Connection, id: i64) -> Result<(), AppError> {
    conn.execute("DELETE FROM remote_servers WHERE id = ?1", params![id])
        .await
        .map_err(|e| DbError::Query(e.to_string()))?;
    Ok(())
}

// ================= CROSS-SERVER SHARES CRUD =================

pub async fn list_shares(conn: &Connection) -> Result<Vec<CrossServerShareRow>, AppError> {
    let mut rows = conn
        .query(
            "SELECT s.id, s.name, s.source_bucket, s.source_prefix, s.remote_server_id,
                    r.name, r.endpoint, s.target_bucket, s.target_prefix, s.sync_mode,
                    s.enabled, s.status, s.last_synced_at, s.created_at
             FROM cross_server_shares s
             LEFT JOIN remote_servers r ON s.remote_server_id = r.id
             ORDER BY s.id ASC",
            params![],
        )
        .await
        .map_err(|e| DbError::Query(e.to_string()))?;

    let mut list = Vec::new();
    while let Some(row) = rows.next().await.map_err(|e| DbError::Query(e.to_string()))? {
        let enabled: i64 = row.get(10).unwrap_or(1);
        list.push(CrossServerShareRow {
            id: row.get(0).map_err(|e| DbError::Query(e.to_string()))?,
            name: row.get(1).unwrap_or_default(),
            source_bucket: row.get(2).unwrap_or_default(),
            source_prefix: row.get(3).unwrap_or_default(),
            remote_server_id: row.get(4).unwrap_or(0),
            remote_server_name: row.get(5).ok(),
            remote_endpoint: row.get(6).ok(),
            target_bucket: row.get(7).unwrap_or_default(),
            target_prefix: row.get(8).unwrap_or_default(),
            sync_mode: row.get(9).unwrap_or_else(|_| "one_way".to_string()),
            enabled: enabled != 0,
            status: row.get(11).unwrap_or_else(|_| "in_sync".to_string()),
            last_synced_at: row.get(12).ok(),
            created_at: row.get(13).unwrap_or_default(),
        });
    }
    Ok(list)
}

pub async fn list_shares_for_source_bucket(
    conn: &Connection,
    bucket: &str,
) -> Result<Vec<CrossServerShareRow>, AppError> {
    let mut rows = conn
        .query(
            "SELECT s.id, s.name, s.source_bucket, s.source_prefix, s.remote_server_id,
                    r.name, r.endpoint, s.target_bucket, s.target_prefix, s.sync_mode,
                    s.enabled, s.status, s.last_synced_at, s.created_at
             FROM cross_server_shares s
             LEFT JOIN remote_servers r ON s.remote_server_id = r.id
             WHERE s.source_bucket = ?1 AND s.enabled = TRUE
             ORDER BY s.id ASC",
            params![bucket],
        )
        .await
        .map_err(|e| DbError::Query(e.to_string()))?;

    let mut list = Vec::new();
    while let Some(row) = rows.next().await.map_err(|e| DbError::Query(e.to_string()))? {
        let enabled: i64 = row.get(10).unwrap_or(1);
        list.push(CrossServerShareRow {
            id: row.get(0).map_err(|e| DbError::Query(e.to_string()))?,
            name: row.get(1).unwrap_or_default(),
            source_bucket: row.get(2).unwrap_or_default(),
            source_prefix: row.get(3).unwrap_or_default(),
            remote_server_id: row.get(4).unwrap_or(0),
            remote_server_name: row.get(5).ok(),
            remote_endpoint: row.get(6).ok(),
            target_bucket: row.get(7).unwrap_or_default(),
            target_prefix: row.get(8).unwrap_or_default(),
            sync_mode: row.get(9).unwrap_or_else(|_| "one_way".to_string()),
            enabled: enabled != 0,
            status: row.get(11).unwrap_or_else(|_| "in_sync".to_string()),
            last_synced_at: row.get(12).ok(),
            created_at: row.get(13).unwrap_or_default(),
        });
    }
    Ok(list)
}

#[allow(clippy::too_many_arguments)]
pub async fn create_share(
    conn: &Connection,
    name: &str,
    source_bucket: &str,
    source_prefix: &str,
    remote_server_id: i64,
    target_bucket: &str,
    target_prefix: &str,
    sync_mode: &str,
) -> Result<i64, AppError> {
    conn.execute(
        "INSERT INTO cross_server_shares (name, source_bucket, source_prefix, remote_server_id, target_bucket, target_prefix, sync_mode)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![name, source_bucket, source_prefix, remote_server_id, target_bucket, target_prefix, sync_mode],
    )
    .await
    .map_err(|e| DbError::Query(e.to_string()))?;

    let mut rows = conn
        .query("SELECT last_insert_rowid()", params![])
        .await
        .map_err(|e| DbError::Query(e.to_string()))?;
    if let Some(row) = rows.next().await.map_err(|e| DbError::Query(e.to_string()))? {
        Ok(row.get(0).unwrap_or(0))
    } else {
        Ok(0)
    }
}

pub async fn delete_share(conn: &Connection, id: i64) -> Result<(), AppError> {
    conn.execute("DELETE FROM cross_server_shares WHERE id = ?1", params![id])
        .await
        .map_err(|e| DbError::Query(e.to_string()))?;
    Ok(())
}

pub async fn update_share_status(conn: &Connection, id: i64, status: &str) -> Result<(), AppError> {
    conn.execute(
        "UPDATE cross_server_shares SET status = ?1, last_synced_at = CURRENT_TIMESTAMP WHERE id = ?2",
        params![status, id],
    )
    .await
    .map_err(|e| DbError::Query(e.to_string()))?;
    Ok(())
}

// ================= SYNC QUEUE OPERATIONS =================

#[allow(clippy::too_many_arguments)]
pub async fn enqueue_sync_item(
    conn: &Connection,
    share_id: i64,
    source_bucket: &str,
    source_key: &str,
    target_bucket: &str,
    target_key: &str,
    action: &str,
    version_id: &str,
    content_hash: Option<&str>,
    size_bytes: i64,
) -> Result<(), AppError> {
    conn.execute(
        "INSERT INTO sync_queue (share_id, source_bucket, source_key, target_bucket, target_key, action, version_id, content_hash, size_bytes, status, attempts, next_retry_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 'pending', 0, CURRENT_TIMESTAMP)",
        params![share_id, source_bucket, source_key, target_bucket, target_key, action, version_id, content_hash, size_bytes],
    )
    .await
    .map_err(|e| DbError::Query(e.to_string()))?;
    Ok(())
}

pub async fn get_pending_sync_items(
    conn: &Connection,
    limit: i64,
) -> Result<Vec<SyncQueueRow>, AppError> {
    let mut rows = conn
        .query(
            "SELECT id, share_id, source_bucket, source_key, target_bucket, target_key,
                    action, version_id, content_hash, size_bytes, status, attempts,
                    max_attempts, next_retry_at, last_error, created_at, updated_at
             FROM sync_queue
             WHERE status = 'pending' AND next_retry_at <= CURRENT_TIMESTAMP
             ORDER BY id ASC LIMIT ?1",
            params![limit],
        )
        .await
        .map_err(|e| DbError::Query(e.to_string()))?;

    let mut list = Vec::new();
    while let Some(row) = rows.next().await.map_err(|e| DbError::Query(e.to_string()))? {
        list.push(SyncQueueRow {
            id: row.get(0).map_err(|e| DbError::Query(e.to_string()))?,
            share_id: row.get(1).unwrap_or(0),
            source_bucket: row.get(2).unwrap_or_default(),
            source_key: row.get(3).unwrap_or_default(),
            target_bucket: row.get(4).unwrap_or_default(),
            target_key: row.get(5).unwrap_or_default(),
            action: row.get(6).unwrap_or_else(|_| "PUT".to_string()),
            version_id: row.get(7).unwrap_or_default(),
            content_hash: row.get(8).ok(),
            size_bytes: row.get(9).unwrap_or(0),
            status: row.get(10).unwrap_or_else(|_| "pending".to_string()),
            attempts: row.get(11).unwrap_or(0),
            max_attempts: row.get(12).unwrap_or(10),
            next_retry_at: row.get(13).unwrap_or_default(),
            last_error: row.get(14).ok(),
            created_at: row.get(15).unwrap_or_default(),
            updated_at: row.get(16).unwrap_or_default(),
        });
    }
    Ok(list)
}

pub async fn list_sync_queue(
    conn: &Connection,
    status_filter: Option<&str>,
    limit: i64,
) -> Result<Vec<SyncQueueRow>, AppError> {
    let mut rows = if let Some(st) = status_filter {
        conn.query(
            "SELECT id, share_id, source_bucket, source_key, target_bucket, target_key,
                    action, version_id, content_hash, size_bytes, status, attempts,
                    max_attempts, next_retry_at, last_error, created_at, updated_at
             FROM sync_queue WHERE status = ?1 ORDER BY id DESC LIMIT ?2",
            params![st, limit],
        )
        .await
        .map_err(|e| DbError::Query(e.to_string()))?
    } else {
        conn.query(
            "SELECT id, share_id, source_bucket, source_key, target_bucket, target_key,
                    action, version_id, content_hash, size_bytes, status, attempts,
                    max_attempts, next_retry_at, last_error, created_at, updated_at
             FROM sync_queue ORDER BY id DESC LIMIT ?1",
            params![limit],
        )
        .await
        .map_err(|e| DbError::Query(e.to_string()))?
    };

    let mut list = Vec::new();
    while let Some(row) = rows.next().await.map_err(|e| DbError::Query(e.to_string()))? {
        list.push(SyncQueueRow {
            id: row.get(0).map_err(|e| DbError::Query(e.to_string()))?,
            share_id: row.get(1).unwrap_or(0),
            source_bucket: row.get(2).unwrap_or_default(),
            source_key: row.get(3).unwrap_or_default(),
            target_bucket: row.get(4).unwrap_or_default(),
            target_key: row.get(5).unwrap_or_default(),
            action: row.get(6).unwrap_or_else(|_| "PUT".to_string()),
            version_id: row.get(7).unwrap_or_default(),
            content_hash: row.get(8).ok(),
            size_bytes: row.get(9).unwrap_or(0),
            status: row.get(10).unwrap_or_else(|_| "pending".to_string()),
            attempts: row.get(11).unwrap_or(0),
            max_attempts: row.get(12).unwrap_or(10),
            next_retry_at: row.get(13).unwrap_or_default(),
            last_error: row.get(14).ok(),
            created_at: row.get(15).unwrap_or_default(),
            updated_at: row.get(16).unwrap_or_default(),
        });
    }
    Ok(list)
}

pub async fn mark_item_completed(conn: &Connection, id: i64) -> Result<(), AppError> {
    conn.execute(
        "UPDATE sync_queue SET status = 'completed', updated_at = CURRENT_TIMESTAMP WHERE id = ?1",
        params![id],
    )
    .await
    .map_err(|e| DbError::Query(e.to_string()))?;
    Ok(())
}

pub async fn mark_item_failed(
    conn: &Connection,
    id: i64,
    error: &str,
    next_retry_sec: i64,
) -> Result<(), AppError> {
    conn.execute(
        "UPDATE sync_queue
         SET status = 'pending',
             attempts = attempts + 1,
             last_error = ?1,
             next_retry_at = datetime('now', '+' || ?2 || ' seconds'),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?3",
        params![error, next_retry_sec, id],
    )
    .await
    .map_err(|e| DbError::Query(e.to_string()))?;
    Ok(())
}

pub async fn retry_all_failed(conn: &Connection) -> Result<(), AppError> {
    conn.execute(
        "UPDATE sync_queue SET status = 'pending', next_retry_at = CURRENT_TIMESTAMP WHERE status = 'failed' OR attempts >= max_attempts",
        params![],
    )
    .await
    .map_err(|e| DbError::Query(e.to_string()))?;
    Ok(())
}

pub async fn clear_completed_queue(conn: &Connection) -> Result<(), AppError> {
    conn.execute("DELETE FROM sync_queue WHERE status = 'completed'", params![])
        .await
        .map_err(|e| DbError::Query(e.to_string()))?;
    Ok(())
}
