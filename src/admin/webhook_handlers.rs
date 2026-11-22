use crate::db;
use crate::error::AppError;
use crate::storage::FileStorage;
use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde::Deserialize;
use serde_json::json;

pub async fn list_webhooks(
    State(storage): State<FileStorage>,
    Path(bucket): Path<String>,
) -> Result<Response, AppError> {
    let conn = storage.db.conn()?;
    let webhooks = db::webhooks::list_webhooks(&conn, &bucket).await?;
    Ok((StatusCode::OK, Json(webhooks)).into_response())
}

#[derive(Deserialize)]
pub struct CreateWebhookPayload {
    pub url: String,
    pub events: Vec<String>,
    pub secret: Option<String>,
}

pub async fn create_webhook(
    State(storage): State<FileStorage>,
    Path(bucket): Path<String>,
    Json(payload): Json<CreateWebhookPayload>,
) -> Result<Response, AppError> {
    let conn = storage.db.conn()?;
    let events_json = serde_json::to_string(&payload.events).unwrap_or_default();
    let id = db::webhooks::create_webhook(
        &conn,
        &bucket,
        &payload.url,
        &events_json,
        payload.secret.as_deref(),
    )
    .await?;
    Ok((StatusCode::OK, Json(json!({ "id": id, "success": true }))).into_response())
}

pub async fn delete_webhook(
    State(storage): State<FileStorage>,
    Path((_bucket, id)): Path<(String, i64)>,
) -> Result<Response, AppError> {
    let conn = storage.db.conn()?;
    db::webhooks::delete_webhook(&conn, id).await?;
    Ok((StatusCode::OK, Json(json!({ "success": true }))).into_response())
}

pub async fn list_webhook_dlq(
    State(storage): State<FileStorage>,
    Path(bucket): Path<String>,
) -> Result<Response, AppError> {
    let conn = storage.db.conn()?;
    let dlq = db::webhooks::list_webhook_dlq(&conn, &bucket).await?;
    Ok((StatusCode::OK, Json(dlq)).into_response())
}

pub async fn delete_webhook_dlq(
    State(storage): State<FileStorage>,
    Path((_bucket, id)): Path<(String, i64)>,
) -> Result<Response, AppError> {
    let conn = storage.db.conn()?;
    db::webhooks::delete_webhook_dlq(&conn, id).await?;
    Ok((StatusCode::OK, Json(json!({ "success": true }))).into_response())
}

pub async fn retry_webhook_dlq(
    State(storage): State<FileStorage>,
    Path((_bucket, id)): Path<(String, i64)>,
) -> Result<Response, AppError> {
    let conn = storage.db.conn()?;
    let mut rows = conn
        .query(
            "SELECT id, webhook_id, bucket, url, event_name, payload FROM webhook_dlq WHERE id = ?1",
            libsql::params![id],
        )
        .await
        .map_err(|e| crate::error::DbError::Query(e.to_string()))?;

    let record = if let Some(row) = rows.next().await.map_err(|e| crate::error::DbError::Query(e.to_string()))? {
        (
            row.get::<i64>(0).unwrap_or(id),
            row.get::<String>(3).unwrap_or_default(),
            row.get::<String>(4).unwrap_or_default(),
            row.get::<String>(5).unwrap_or_default(),
        )
    } else {
        return Err(AppError::NotFound("DLQ record not found".to_string()));
    };

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| AppError::Internal(e.to_string()))?;

    let resp = client
        .post(&record.1)
        .header("Content-Type", "application/json")
        .header("User-Agent", "GravSpace-Webhook-Dispatcher/1.0")
        .header("X-GravSpace-Event", &record.2)
        .header("X-GravSpace-Retry", "true")
        .body(record.3)
        .send()
        .await
        .map_err(|e| AppError::Internal(format!("Retry failed: {e}")))?;

    if resp.status().is_success() {
        db::webhooks::delete_webhook_dlq(&conn, id).await?;
        Ok((StatusCode::OK, Json(json!({ "success": true, "status": resp.status().as_u16() }))).into_response())
    } else {
        Err(AppError::Internal(format!("Target returned error status: {}", resp.status())))
    }
}
