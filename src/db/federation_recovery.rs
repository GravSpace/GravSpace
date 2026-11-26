use crate::db::federation::SyncQueueRow;
use crate::error::{AppError, DbError};
use libsql::{params, params_from_iter, Connection, Value};
use serde::Serialize;
use std::collections::HashMap;

#[derive(Debug, Clone)]
pub struct LatestShareSyncState {
    pub action: String,
    pub status: String,
    pub content_hash: Option<String>,
    pub size_bytes: i64,
}

#[derive(Debug, Clone, Default, Serialize)]
pub struct QueueCounts {
    pub all: i64,
    pub pending: i64,
    pub retrying: i64,
    pub failed: i64,
    pub syncing: i64,
    pub completed: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct PaginatedSyncQueue {
    pub items: Vec<SyncQueueRow>,
    pub total: i64,
    pub page: i64,
    pub limit: i64,
    pub total_pages: i64,
    pub counts: QueueCounts,
    pub pending_bytes: i64,
}

/// Returns whether an active (`pending` or `syncing`) task already exists for this share, key, and action.
pub async fn has_pending_sync_item(
    conn: &Connection,
    share_id: i64,
    source_key: &str,
    action: &str,
) -> Result<bool, AppError> {
    let mut rows = conn
        .query(
            "SELECT 1 FROM sync_queue
             WHERE share_id = ?1 AND source_key = ?2 AND action = ?3 AND status IN ('pending', 'syncing')
             LIMIT 1",
            params![share_id, source_key, action],
        )
        .await
        .map_err(|e| DbError::Query(e.to_string()))?;
    Ok(rows
        .next()
        .await
        .map_err(|e| DbError::Query(e.to_string()))?
        .is_some())
}

/// Loads the latest sync_queue state per `source_key` for incremental auto-reconciliation.
pub async fn get_share_latest_states(
    conn: &Connection,
    share_id: i64,
) -> Result<HashMap<String, LatestShareSyncState>, AppError> {
    let mut rows = conn
        .query(
            "SELECT source_key, action, status, content_hash, size_bytes
             FROM sync_queue WHERE share_id = ?1 ORDER BY id ASC",
            params![share_id],
        )
        .await
        .map_err(|e| DbError::Query(e.to_string()))?;

    let mut map = HashMap::new();
    while let Some(row) = rows.next().await.map_err(|e| DbError::Query(e.to_string()))? {
        if let Ok(source_key) = row.get::<String>(0) {
            map.insert(
                source_key,
                LatestShareSyncState {
                    action: row.get(1).unwrap_or_else(|_| "PUT".to_string()),
                    status: row.get(2).unwrap_or_else(|_| "pending".to_string()),
                    content_hash: row.get(3).ok(),
                    size_bytes: row.get(4).unwrap_or(0),
                },
            );
        }
    }
    Ok(map)
}

/// Expedites pending and failed tasks for enabled shares (all or targeting a recovered peer).
pub async fn expedite_pending_for_peer(
    conn: &Connection,
    remote_server_id: Option<i64>,
) -> Result<u64, AppError> {
    let share_ids = if let Some(peer_id) = remote_server_id {
        let mut rows = conn
            .query(
                "SELECT id FROM cross_server_shares WHERE remote_server_id = ?1 AND enabled = 1",
                params![peer_id],
            )
            .await
            .map_err(|e| DbError::Query(e.to_string()))?;
        let mut ids = Vec::new();
        while let Some(row) = rows.next().await.map_err(|e| DbError::Query(e.to_string()))? {
            if let Ok(id) = row.get::<i64>(0) {
                ids.push(id);
            }
        }
        ids
    } else {
        let mut rows = conn
            .query(
                "SELECT id FROM cross_server_shares WHERE enabled = 1",
                params![],
            )
            .await
            .map_err(|e| DbError::Query(e.to_string()))?;
        let mut ids = Vec::new();
        while let Some(row) = rows.next().await.map_err(|e| DbError::Query(e.to_string()))? {
            if let Ok(id) = row.get::<i64>(0) {
                ids.push(id);
            }
        }
        ids
    };

    let mut affected: u64 = 0;
    for sid in share_ids {
        let updated = conn
            .execute(
                "UPDATE sync_queue
                 SET status = 'pending',
                     next_retry_at = CURRENT_TIMESTAMP,
                     attempts = CASE WHEN status = 'failed' THEN 0 ELSE attempts END,
                     updated_at = CURRENT_TIMESTAMP
                 WHERE share_id = ?1 AND status IN ('pending', 'failed')",
                params![sid],
            )
            .await
            .map_err(|e| DbError::Query(e.to_string()))?;
        affected += updated;
    }
    Ok(affected)
}

/// Updates failed task backoff, marking permanent 4xx errors as `failed` once `max_attempts` is reached.
pub async fn mark_item_retry_or_failed(
    conn: &Connection,
    id: i64,
    error: &str,
    next_retry_sec: i64,
    next_attempts: i64,
    max_attempts: i64,
    is_permanent: bool,
) -> Result<&'static str, AppError> {
    if is_permanent && next_attempts >= max_attempts {
        conn.execute(
            "UPDATE sync_queue
             SET status = 'failed',
                 attempts = ?1,
                 last_error = ?2,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = ?3",
            params![next_attempts, error, id],
        )
        .await
        .map_err(|e| DbError::Query(e.to_string()))?;
        return Ok("failed");
    }

    conn.execute(
        "UPDATE sync_queue
         SET status = 'pending',
             attempts = ?1,
             last_error = ?2,
             next_retry_at = datetime('now', '+' || ?3 || ' seconds'),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?4",
        params![next_attempts, error, next_retry_sec, id],
    )
    .await
    .map_err(|e| DbError::Query(e.to_string()))?;
    Ok("pending")
}

/// Returns server-paginated Outbox & RTO queue items together with global status counters.
pub async fn list_sync_queue_paginated(
    conn: &Connection,
    status_filter: Option<&str>,
    search: Option<&str>,
    page: i64,
    limit: i64,
) -> Result<PaginatedSyncQueue, AppError> {
    let safe_limit = limit.clamp(1, 200);
    let safe_page = page.max(1);
    let (counts, pending_bytes) = compute_queue_stats(conn).await?;

    let mut clauses: Vec<String> = Vec::new();
    let mut filter_params: Vec<Value> = Vec::new();

    match status_filter.map(str::trim).filter(|s| !s.is_empty() && *s != "all") {
        Some("pending") => clauses.push("status = 'pending' AND attempts = 0".to_string()),
        Some("retrying") => clauses.push("status = 'pending' AND attempts > 0".to_string()),
        Some("failed") => clauses.push("(status = 'failed' OR (status = 'pending' AND attempts > 0))".to_string()),
        Some("syncing") => clauses.push("status = 'syncing'".to_string()),
        Some("completed") => clauses.push("status = 'completed'".to_string()),
        _ => {}
    }

    if let Some(q) = search.map(str::trim).filter(|s| !s.is_empty()) {
        let idx = filter_params.len() + 1;
        clauses.push(format!(
            "(source_key LIKE ?{idx} OR source_bucket LIKE ?{idx} OR target_key LIKE ?{idx} \
             OR target_bucket LIKE ?{idx} OR action LIKE ?{idx} OR COALESCE(last_error, '') LIKE ?{idx})"
        ));
        filter_params.push(format!("%{q}%").into());
    }

    let where_sql = if clauses.is_empty() {
        String::new()
    } else {
        format!("WHERE {}", clauses.join(" AND "))
    };

    let count_sql = format!("SELECT COUNT(*) FROM sync_queue {where_sql}");
    let mut count_rows = conn
        .query(&count_sql, params_from_iter(filter_params.clone()))
        .await
        .map_err(|e| DbError::Query(e.to_string()))?;
    let total = if let Some(r) = count_rows.next().await.map_err(|e| DbError::Query(e.to_string()))? {
        r.get::<i64>(0).unwrap_or(0)
    } else {
        0
    };

    let total_pages = ((total + safe_limit - 1) / safe_limit).max(1);
    let clamped_page = safe_page.min(total_pages);
    let offset = (clamped_page - 1) * safe_limit;

    let limit_idx = filter_params.len() + 1;
    let offset_idx = filter_params.len() + 2;
    let mut query_params = filter_params;
    query_params.push(safe_limit.into());
    query_params.push(offset.into());

    let items_sql = format!(
        "SELECT id, share_id, source_bucket, source_key, target_bucket, target_key,
                action, version_id, content_hash, size_bytes, status, attempts,
                max_attempts, next_retry_at, last_error, created_at, updated_at
         FROM sync_queue {where_sql}
         ORDER BY id DESC LIMIT ?{limit_idx} OFFSET ?{offset_idx}"
    );
    let mut rows = conn
        .query(&items_sql, params_from_iter(query_params))
        .await
        .map_err(|e| DbError::Query(e.to_string()))?;

    let mut items = Vec::new();
    while let Some(row) = rows.next().await.map_err(|e| DbError::Query(e.to_string()))? {
        items.push(row_to_sync_queue(&row)?);
    }

    Ok(PaginatedSyncQueue {
        items,
        total,
        page: clamped_page,
        limit: safe_limit,
        total_pages,
        counts,
        pending_bytes,
    })
}

async fn compute_queue_stats(conn: &Connection) -> Result<(QueueCounts, i64), AppError> {
    let mut rows = conn
        .query(
            "SELECT
                COUNT(*),
                COALESCE(SUM(CASE WHEN status = 'pending' AND attempts = 0 THEN 1 ELSE 0 END), 0),
                COALESCE(SUM(CASE WHEN status = 'pending' AND attempts > 0 THEN 1 ELSE 0 END), 0),
                COALESCE(SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END), 0),
                COALESCE(SUM(CASE WHEN status = 'syncing' THEN 1 ELSE 0 END), 0),
                COALESCE(SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END), 0),
                COALESCE(SUM(CASE WHEN status IN ('pending', 'syncing', 'failed') THEN size_bytes ELSE 0 END), 0)
             FROM sync_queue",
            params![],
        )
        .await
        .map_err(|e| DbError::Query(e.to_string()))?;

    let mut counts = QueueCounts::default();
    let mut pending_bytes: i64 = 0;
    if let Some(row) = rows.next().await.map_err(|e| DbError::Query(e.to_string()))? {
        counts.all = row.get(0).unwrap_or(0);
        counts.pending = row.get(1).unwrap_or(0);
        counts.retrying = row.get(2).unwrap_or(0);
        counts.failed = row.get(3).unwrap_or(0);
        counts.syncing = row.get(4).unwrap_or(0);
        counts.completed = row.get(5).unwrap_or(0);
        pending_bytes = row.get(6).unwrap_or(0);
    }

    Ok((counts, pending_bytes))
}

fn row_to_sync_queue(row: &libsql::Row) -> Result<SyncQueueRow, AppError> {
    Ok(SyncQueueRow {
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
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{federation, Database};

    #[tokio::test]
    async fn rto_recovery_should_expedite_queue_and_paginate_accurately() {
        let tmp_dir =
            std::env::temp_dir().join(format!("grav_fed_rec_{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&tmp_dir).unwrap();
        let db = Database::open_federation(tmp_dir.join("fed.db").to_str().unwrap())
            .await
            .unwrap();
        let conn = db.conn().unwrap();

        let peer_id = federation::create_remote_server(&conn, "p1", "http://p1:8080", None, "ak", "sk")
            .await
            .unwrap();
        let share_id = federation::create_share(&conn, "s1", "src", "", peer_id, "dst", "", "one_way")
            .await
            .unwrap();

        for i in 1..=5 {
            federation::enqueue_sync_item(&conn, share_id, "src", &format!("f{i}.txt"), "dst", &format!("f{i}.txt"), "PUT", "", Some("h"), 100)
                .await
                .unwrap();
        }
        assert!(has_pending_sync_item(&conn, share_id, "f1.txt", "PUT").await.unwrap());

        // Simulate item #1 failed permanently and item #2 delayed for 300s backoff
        mark_item_retry_or_failed(&conn, 1, "403 forbidden", 300, 10, 10, true).await.unwrap();
        mark_item_retry_or_failed(&conn, 2, "timeout", 300, 2, 10, false).await.unwrap();

        let page1 = list_sync_queue_paginated(&conn, Some("all"), None, 1, 2).await.unwrap();
        assert_eq!(page1.items.len(), 2);
        assert_eq!(page1.total, 5);
        assert_eq!(page1.total_pages, 3);
        assert_eq!(page1.counts.failed, 1);
        assert_eq!(page1.counts.retrying, 1);
        assert_eq!(page1.counts.pending, 3);

        // Expedite on peer recovery brings both #1 (failed) and #2 (delayed) immediately back to runnable pending
        let expedited = expedite_pending_for_peer(&conn, Some(peer_id)).await.unwrap();
        assert_eq!(expedited, 5);
        let runnable = federation::get_pending_sync_items(&conn, 10).await.unwrap();
        assert_eq!(runnable.len(), 5);

        let _ = std::fs::remove_dir_all(&tmp_dir);
    }
}
