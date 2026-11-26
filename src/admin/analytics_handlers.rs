use crate::audit::SharedAuditLogger;
use crate::auth::jwt::verify_jwt;
use crate::config::Config;
use crate::db;
use crate::error::AppError;
use crate::storage::FileStorage;
use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        Query, State,
    },
    http::{header, HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use libsql::params;
use serde::Deserialize;
use serde_json::json;
use std::collections::HashMap;
use std::sync::Arc;

#[derive(Clone)]
pub struct AuditStreamState {
    pub logger: SharedAuditLogger,
    pub config: Arc<Config>,
}

#[derive(Deserialize)]
pub struct AuditLogQuery {
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

pub async fn get_system_stats(State(storage): State<FileStorage>) -> Result<Response, AppError> {
    let conn = storage.db.conn()?;

    let mut objects_count: i64 = 0;
    let mut total_size: i64 = 0;
    let mut physical_size: i64 = 0;
    let mut bucket_totals: HashMap<String, i64> = HashMap::new();

    for idx in 0..crate::db::shards::NUM_SHARDS {
        let table = crate::db::shards::shard_table_name(idx);
        let summary_sql = format!(
            "SELECT COUNT(*), COALESCE(SUM(COALESCE(original_size, size)), 0), COALESCE(SUM(size), 0) FROM {table} WHERE is_latest = TRUE AND deleted_at IS NULL"
        );
        let mut rows = conn
            .query(&summary_sql, ())
            .await
            .map_err(|e| crate::error::DbError::Query(e.to_string()))?;
        if let Some(row) = rows.next().await.unwrap_or(None) {
            objects_count += row.get::<i64>(0).unwrap_or(0);
            total_size += row.get::<i64>(1).unwrap_or(0);
            physical_size += row.get::<i64>(2).unwrap_or(0);
        }

        let bucket_sql = format!(
            "SELECT bucket, COALESCE(SUM(size), 0) FROM {table} WHERE is_latest = TRUE AND deleted_at IS NULL GROUP BY bucket"
        );
        let mut b_rows = conn
            .query(&bucket_sql, ())
            .await
            .map_err(|e| crate::error::DbError::Query(e.to_string()))?;
        while let Ok(Some(row)) = b_rows.next().await {
            let name = row.get::<String>(0).unwrap_or_default();
            let size = row.get::<i64>(1).unwrap_or(0);
            *bucket_totals.entry(name).or_insert(0) += size;
        }
    }

    let bucket_stats: Vec<serde_json::Value> = bucket_totals
        .into_iter()
        .map(|(name, size)| {
            json!({
                "name": name,
                "Name": name,
                "size": size,
                "Size": size,
            })
        })
        .collect();

    let buckets_count = if bucket_stats.is_empty() {
        storage.list_buckets().await?.len()
    } else {
        bucket_stats.len()
    };

    Ok((
        StatusCode::OK,
        Json(json!({
            "version": env!("CARGO_PKG_VERSION"),
            "app_version": env!("CARGO_PKG_VERSION"),
            "buckets_count": buckets_count,
            "total_buckets": buckets_count,
            "objects_count": objects_count,
            "total_objects": objects_count,
            "total_size": total_size,
            "physical_size": physical_size,
            "buckets": bucket_stats,
        })),
    )
        .into_response())
}

pub async fn get_audit_logs(
    State(storage): State<FileStorage>,
    Query(query): Query<AuditLogQuery>,
) -> Result<Response, AppError> {
    let conn = storage.db.conn()?;
    let limit = query.limit.unwrap_or(50);
    let offset = query.offset.unwrap_or(0);
    let logs = db::audit::list_audit_logs(&conn, limit, offset).await?;

    let formatted: Vec<serde_json::Value> = logs
        .into_iter()
        .map(|log| {
            json!({
                "ID": log.id,
                "id": log.id,
                "Timestamp": log.timestamp,
                "timestamp": log.timestamp,
                "Username": log.username,
                "username": log.username,
                "Action": log.action,
                "action": log.action,
                "Resource": log.resource,
                "resource": log.resource,
                "Result": log.result,
                "result": log.result,
                "IP": log.ip,
                "ip": log.ip,
                "UserAgent": log.user_agent,
                "user_agent": log.user_agent,
                "Details": log.details,
                "details": log.details,
            })
        })
        .collect();

    Ok((StatusCode::OK, Json(formatted)).into_response())
}

pub async fn stream_audit_logs(
    ws: WebSocketUpgrade,
    State(state): State<AuditStreamState>,
    Query(params): Query<HashMap<String, String>>,
    headers: HeaderMap,
) -> Result<Response, AppError> {
    if let Some(ticket) = params.get("ticket") {
        if crate::admin::federation_handlers::consume_ws_ticket(ticket) {
            let logger = state.logger.clone();
            return Ok(ws
                .on_upgrade(move |socket| handle_audit_ws(socket, logger))
                .into_response());
        }
        return Err(crate::error::AuthError::TokenInvalid.into());
    }

    // Fallback: check ?token=... or Authorization header
    let token = if let Some(t) = params.get("token") {
        t.clone()
    } else if let Some(auth) = headers
        .get(header::AUTHORIZATION)
        .and_then(|h| h.to_str().ok())
    {
        auth.strip_prefix("Bearer ").unwrap_or(auth).to_string()
    } else {
        String::new()
    };

    if token.is_empty() {
        return Err(crate::error::AuthError::TokenInvalid.into());
    }

    let username = verify_jwt(&token, &state.config.jwt_secret)?;
    if username != "admin" {
        return Err(AppError::Forbidden(
            "Administrator access required".to_string(),
        ));
    }

    let logger = state.logger.clone();
    Ok(ws
        .on_upgrade(move |socket| handle_audit_ws(socket, logger))
        .into_response())
}

async fn handle_audit_ws(mut socket: WebSocket, logger: SharedAuditLogger) {
    let mut rx = logger.subscribe();
    let mut ping_interval = tokio::time::interval(std::time::Duration::from_secs(25));

    loop {
        tokio::select! {
            _ = ping_interval.tick() => {
                if socket.send(Message::Ping(vec![].into())).await.is_err() {
                    break;
                }
            }
            Ok(log) = rx.recv() => {
                let details_val = log
                    .details
                    .as_deref()
                    .and_then(|d| serde_json::from_str::<serde_json::Value>(d).ok())
                    .unwrap_or(json!({}));

                let msg = json!({
                    "timestamp": log.timestamp,
                    "Timestamp": log.timestamp,
                    "user": log.username.as_deref().unwrap_or("anonymous"),
                    "username": log.username.as_deref().unwrap_or("anonymous"),
                    "Username": log.username.as_deref().unwrap_or("anonymous"),
                    "action": log.action,
                    "Action": log.action,
                    "resource": log.resource,
                    "Resource": log.resource,
                    "result": log.result,
                    "Result": log.result,
                    "status": log.result,
                    "Status": log.result,
                    "ip": log.ip.as_deref().unwrap_or("-"),
                    "IP": log.ip.as_deref().unwrap_or("-"),
                    "user_agent": log.user_agent.as_deref().unwrap_or("-"),
                    "UserAgent": log.user_agent.as_deref().unwrap_or("-"),
                    "details": details_val,
                    "Details": log.details.unwrap_or_else(|| "{}".to_string()),
                });
                if socket.send(Message::Text(msg.to_string().into())).await.is_err() {
                    break;
                }
            }
            msg = socket.recv() => {
                match msg {
                    Some(Ok(Message::Close(_))) | None => break,
                    Some(Ok(Message::Ping(payload))) => {
                        let _ = socket.send(Message::Pong(payload)).await;
                    }
                    _ => {}
                }
            }
        }
    }
}

pub async fn get_storage_analytics(
    State(storage): State<FileStorage>,
) -> Result<Response, AppError> {
    let conn = storage.db.conn()?;
    let mut rows = conn
        .query(
            "SELECT bucket, size, timestamp FROM storage_snapshots ORDER BY id DESC LIMIT 100",
            (),
        )
        .await
        .map_err(|e| crate::error::DbError::Query(e.to_string()))?;

    let mut snapshots = Vec::new();
    while let Ok(Some(row)) = rows.next().await {
        let b = row.get::<String>(0).unwrap_or_default();
        let s = row.get::<i64>(1).unwrap_or(0);
        let t = row.get::<String>(2).unwrap_or_default();
        snapshots.push(json!({
            "bucket": b,
            "Bucket": b,
            "size": s,
            "Size": s,
            "timestamp": t,
            "Timestamp": t,
        }));
    }
    Ok((StatusCode::OK, Json(snapshots)).into_response())
}

pub async fn get_content_type_breakdown(
    State(storage): State<FileStorage>,
) -> Result<Response, AppError> {
    let conn = storage.db.conn()?;
    let mut totals: HashMap<String, (i64, i64)> = HashMap::new();

    for idx in 0..crate::db::shards::NUM_SHARDS {
        let table = crate::db::shards::shard_table_name(idx);
        let sql = format!(
            "SELECT COALESCE(content_type, 'unknown'), COUNT(*), COALESCE(SUM(size), 0)
             FROM {table} WHERE is_latest = TRUE AND deleted_at IS NULL
             GROUP BY content_type"
        );
        let mut rows = conn
            .query(&sql, ())
            .await
            .map_err(|e| crate::error::DbError::Query(e.to_string()))?;
        while let Ok(Some(row)) = rows.next().await {
            let ct = row.get::<String>(0).unwrap_or_default();
            let count = row.get::<i64>(1).unwrap_or(0);
            let size = row.get::<i64>(2).unwrap_or(0);
            let entry = totals.entry(ct).or_insert((0, 0));
            entry.0 += count;
            entry.1 += size;
        }
    }

    let mut entries: Vec<(String, i64, i64)> = totals
        .into_iter()
        .map(|(ct, (count, size))| (ct, count, size))
        .collect();
    entries.sort_by_key(|a| std::cmp::Reverse(a.1));

    let breakdown: Vec<serde_json::Value> = entries
        .into_iter()
        .map(|(ct, count, size)| {
            json!({
                "content_type": ct,
                "ContentType": ct,
                "count": count,
                "Count": count,
                "size": size,
                "TotalSize": size,
            })
        })
        .collect();
    Ok((StatusCode::OK, Json(breakdown)).into_response())
}

#[derive(Deserialize)]
pub struct ActionAnalyticsQuery {
    pub days: Option<i64>,
}

#[derive(Deserialize)]
pub struct SearchQuery {
    pub q: Option<String>,
}

pub async fn get_action_analytics(
    State(storage): State<FileStorage>,
    Query(query): Query<ActionAnalyticsQuery>,
) -> Result<Response, AppError> {
    let conn = storage.db.conn()?;
    let days = query.days.unwrap_or(30);
    let modifier = format!("-{} days", days);
    let mut rows = conn
        .query(
            "SELECT strftime('%Y-%m-%d', timestamp) as day, action, COUNT(*) as count
             FROM audit_logs
             WHERE timestamp >= date('now', ?1) OR timestamp >= date((SELECT MAX(timestamp) FROM audit_logs), ?1)
             GROUP BY day, action
             ORDER BY day ASC",
            params![modifier],
        )
        .await
        .map_err(|e| crate::error::DbError::Query(e.to_string()))?;

    let mut trends: HashMap<String, Vec<serde_json::Value>> = HashMap::new();
    while let Ok(Some(row)) = rows.next().await {
        let day: String = row.get(0).unwrap_or_default();
        let action: String = row.get(1).unwrap_or_default();
        let count: i64 = row.get(2).unwrap_or(0);
        trends.entry(action).or_default().push(json!({
            "day": day,
            "Day": day,
            "count": count,
            "Count": count,
        }));
    }

    Ok((StatusCode::OK, Json(trends)).into_response())
}

pub async fn global_search(
    State(storage): State<FileStorage>,
    Query(query): Query<SearchQuery>,
) -> Result<Response, AppError> {
    let q = match query.q {
        Some(s) if !s.trim().is_empty() => s,
        _ => return Ok((StatusCode::OK, Json(Vec::<serde_json::Value>::new())).into_response()),
    };

    let conn = storage.db.conn()?;
    let pattern = format!("%{}%", q.trim());
    let mut matches: Vec<(String, serde_json::Value)> = Vec::new();

    for idx in 0..crate::db::shards::NUM_SHARDS {
        let table = crate::db::shards::shard_table_name(idx);
        let sql = format!(
            "SELECT bucket, key, size, modified_at, content_type
             FROM {table}
             WHERE is_latest = TRUE AND deleted_at IS NULL AND key LIKE ?1
             ORDER BY modified_at DESC LIMIT 100"
        );
        let mut rows = conn
            .query(&sql, params![pattern.as_str()])
            .await
            .map_err(|e| crate::error::DbError::Query(e.to_string()))?;

        while let Ok(Some(row)) = rows.next().await {
            let content_type = row.get::<String>(4).ok();
            if content_type.as_deref() == Some("application/x-directory") {
                continue;
            }
            let modified_at = row.get::<String>(3).unwrap_or_default();
            matches.push((
                modified_at.clone(),
                json!({
                    "Bucket": row.get::<String>(0).unwrap_or_default(),
                    "Key": row.get::<String>(1).unwrap_or_default(),
                    "Size": row.get::<i64>(2).unwrap_or(0),
                    "ModTime": modified_at,
                    "ContentType": content_type.unwrap_or_default(),
                }),
            ));
        }
    }

    matches.sort_by(|a, b| b.0.cmp(&a.0));
    let results: Vec<serde_json::Value> = matches.into_iter().take(100).map(|(_, v)| v).collect();

    Ok((StatusCode::OK, Json(results)).into_response())
}
