use crate::db;
use crate::error::AppError;
use crate::storage::FileStorage;
use crate::workers::sync;
use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde::Deserialize;
use serde_json::json;

pub async fn list_buckets(State(storage): State<FileStorage>) -> Result<Response, AppError> {
    let buckets = storage.list_buckets().await?;
    Ok((StatusCode::OK, Json(buckets)).into_response())
}

pub async fn create_bucket(
    State(storage): State<FileStorage>,
    Path(bucket): Path<String>,
) -> Result<Response, AppError> {
    storage.create_bucket(&bucket).await?;
    Ok((StatusCode::OK, Json(json!({ "success": true }))).into_response())
}

pub async fn delete_bucket(
    State(storage): State<FileStorage>,
    Path(bucket): Path<String>,
) -> Result<Response, AppError> {
    storage.delete_bucket(&bucket).await?;
    Ok((StatusCode::OK, Json(json!({ "success": true }))).into_response())
}

pub async fn get_bucket_info(
    State(storage): State<FileStorage>,
    Path(bucket): Path<String>,
) -> Result<Response, AppError> {
    let info = storage.get_bucket_info(&bucket).await?;
    match info {
        Some(b) => {
            let (_, current_size) = storage.get_bucket_stats(&bucket).await.unwrap_or((0, 0));
            let resp = json!({
                "Name": b.name,
                "name": b.name,
                "CreatedAt": b.created_at,
                "created_at": b.created_at,
                "Owner": b.owner,
                "owner": b.owner,
                "VersioningEnabled": b.versioning_enabled,
                "versioning_enabled": b.versioning_enabled,
                "ObjectLockEnabled": b.object_lock_enabled,
                "object_lock_enabled": b.object_lock_enabled,
                "DefaultRetentionMode": b.default_retention_mode,
                "default_retention_mode": b.default_retention_mode,
                "DefaultRetentionDays": b.default_retention_days,
                "default_retention_days": b.default_retention_days,
                "SoftDeleteEnabled": b.soft_delete_enabled,
                "soft_delete_enabled": b.soft_delete_enabled,
                "SoftDeleteRetention": b.soft_delete_retention,
                "soft_delete_retention": b.soft_delete_retention,
                "QuotaBytes": b.quota_bytes,
                "quota_bytes": b.quota_bytes,
                "CurrentSize": current_size,
                "current_size": current_size,
            });
            Ok((StatusCode::OK, Json(resp)).into_response())
        }
        None => {
            if storage.bucket_exists(&bucket).await {
                let _ = storage.create_bucket(&bucket).await;
                let (_, current_size) = storage.get_bucket_stats(&bucket).await.unwrap_or((0, 0));
                let now = chrono::Utc::now().to_rfc3339();
                let resp = json!({
                    "Name": bucket,
                    "name": bucket,
                    "CreatedAt": now,
                    "created_at": now,
                    "Owner": "admin",
                    "owner": "admin",
                    "VersioningEnabled": false,
                    "versioning_enabled": false,
                    "ObjectLockEnabled": false,
                    "object_lock_enabled": false,
                    "DefaultRetentionMode": null,
                    "default_retention_mode": null,
                    "DefaultRetentionDays": null,
                    "default_retention_days": null,
                    "SoftDeleteEnabled": false,
                    "soft_delete_enabled": false,
                    "SoftDeleteRetention": 30,
                    "soft_delete_retention": 30,
                    "QuotaBytes": 0,
                    "quota_bytes": 0,
                    "CurrentSize": current_size,
                    "current_size": current_size,
                });
                return Ok((StatusCode::OK, Json(resp)).into_response());
            }
            Err(AppError::NotFound(format!("Bucket '{bucket}' not found")))
        }
    }
}

pub async fn sync_all_buckets(State(storage): State<FileStorage>) -> Result<Response, AppError> {
    sync::sync_all(&storage).await.map_err(AppError::Internal)?;
    Ok((StatusCode::OK, Json(json!({ "success": true }))).into_response())
}

pub async fn sync_bucket(
    State(storage): State<FileStorage>,
    Path(bucket): Path<String>,
) -> Result<Response, AppError> {
    sync::sync_bucket(&storage, &bucket).await.map_err(AppError::Internal)?;
    Ok((StatusCode::OK, Json(json!({ "success": true }))).into_response())
}

#[derive(Deserialize)]
pub struct VersioningPayload {
    pub enabled: bool,
}

pub async fn set_bucket_versioning(
    State(storage): State<FileStorage>,
    Path(bucket): Path<String>,
    Json(payload): Json<VersioningPayload>,
) -> Result<Response, AppError> {
    storage.set_bucket_versioning(&bucket, payload.enabled).await?;
    Ok((StatusCode::OK, Json(json!({ "success": true }))).into_response())
}

#[derive(Deserialize)]
pub struct ObjectLockPayload {
    pub enabled: bool,
}

pub async fn set_bucket_object_lock(
    State(storage): State<FileStorage>,
    Path(bucket): Path<String>,
    Json(payload): Json<ObjectLockPayload>,
) -> Result<Response, AppError> {
    storage.set_bucket_object_lock(&bucket, payload.enabled).await?;
    Ok((StatusCode::OK, Json(json!({ "success": true }))).into_response())
}

#[derive(Deserialize)]
pub struct QuotaPayload {
    pub quota_bytes: i64,
}

pub async fn set_bucket_quota(
    State(storage): State<FileStorage>,
    Path(bucket): Path<String>,
    Json(payload): Json<QuotaPayload>,
) -> Result<Response, AppError> {
    storage.set_bucket_quota(&bucket, payload.quota_bytes).await?;
    Ok((StatusCode::OK, Json(json!({ "success": true }))).into_response())
}

#[derive(Deserialize)]
pub struct DefaultRetentionPayload {
    pub mode: String,
    pub days: i64,
}

pub async fn set_bucket_default_retention(
    State(storage): State<FileStorage>,
    Path(bucket): Path<String>,
    Json(payload): Json<DefaultRetentionPayload>,
) -> Result<Response, AppError> {
    storage
        .set_bucket_default_retention(&bucket, &payload.mode, payload.days)
        .await?;
    Ok((StatusCode::OK, Json(json!({ "success": true }))).into_response())
}

fn default_soft_delete_days() -> i64 {
    30
}

#[derive(Deserialize)]
pub struct SoftDeletePayload {
    pub enabled: bool,
    #[serde(default = "default_soft_delete_days", alias = "retentionDays")]
    pub retention_days: i64,
}

pub async fn set_bucket_soft_delete(
    State(storage): State<FileStorage>,
    Path(bucket): Path<String>,
    Json(payload): Json<SoftDeletePayload>,
) -> Result<Response, AppError> {
    storage
        .set_bucket_soft_delete(&bucket, payload.enabled, payload.retention_days)
        .await?;
    Ok((StatusCode::OK, Json(json!({ "success": true }))).into_response())
}

pub async fn get_bucket_cors(
    State(storage): State<FileStorage>,
    Path(bucket): Path<String>,
) -> Result<Response, AppError> {
    let cors_opt = storage.get_bucket_cors(&bucket).await?;
    let val: serde_json::Value = cors_opt
        .as_deref()
        .and_then(|s| serde_json::from_str(s).ok())
        .unwrap_or_else(|| json!([]));
    Ok((StatusCode::OK, Json(val)).into_response())
}

pub async fn set_bucket_cors(
    State(storage): State<FileStorage>,
    Path(bucket): Path<String>,
    body: String,
) -> Result<Response, AppError> {
    storage.set_bucket_cors(&bucket, &body).await?;
    Ok((StatusCode::OK, Json(json!({ "success": true }))).into_response())
}

pub async fn get_bucket_website(
    State(storage): State<FileStorage>,
    Path(bucket): Path<String>,
) -> Result<Response, AppError> {
    let website_opt = storage.get_bucket_website(&bucket).await?;
    let val: serde_json::Value = website_opt
        .as_deref()
        .and_then(|s| serde_json::from_str(s).ok())
        .unwrap_or(serde_json::Value::Null);
    Ok((StatusCode::OK, Json(val)).into_response())
}

pub async fn set_bucket_website(
    State(storage): State<FileStorage>,
    Path(bucket): Path<String>,
    body: String,
) -> Result<Response, AppError> {
    storage.set_bucket_website(&bucket, &body).await?;
    Ok((StatusCode::OK, Json(json!({ "success": true }))).into_response())
}

pub async fn delete_bucket_cors(
    State(storage): State<FileStorage>,
    Path(bucket): Path<String>,
) -> Result<Response, AppError> {
    storage.delete_bucket_cors(&bucket).await?;
    Ok((StatusCode::OK, Json(json!({ "success": true }))).into_response())
}

pub async fn delete_bucket_website(
    State(storage): State<FileStorage>,
    Path(bucket): Path<String>,
) -> Result<Response, AppError> {
    storage.delete_bucket_website(&bucket).await?;
    Ok((StatusCode::OK, Json(json!({ "success": true }))).into_response())
}

#[derive(Deserialize)]
pub struct CreateReplicationPayload {
    #[serde(alias = "destinationBucket", alias = "destination_bucket")]
    pub destination_bucket: String,
    pub prefix: Option<String>,
}

pub async fn list_replication_rules(
    State(storage): State<FileStorage>,
    Path(bucket): Path<String>,
) -> Result<Response, AppError> {
    let conn = storage.db.conn()?;
    let rules = db::replications::list_replication_rules(&conn, &bucket).await?;
    Ok((StatusCode::OK, Json(rules)).into_response())
}

pub async fn create_replication_rule(
    State(storage): State<FileStorage>,
    Path(bucket): Path<String>,
    Json(payload): Json<CreateReplicationPayload>,
) -> Result<Response, AppError> {
    let conn = storage.db.conn()?;
    db::replications::create_replication_rule(
        &conn,
        &bucket,
        &payload.destination_bucket,
        payload.prefix.as_deref(),
    )
    .await?;
    Ok((StatusCode::CREATED, Json(json!({ "success": true }))).into_response())
}

pub async fn delete_replication_rule(
    State(storage): State<FileStorage>,
    Path((_bucket, id)): Path<(String, i64)>,
) -> Result<Response, AppError> {
    let conn = storage.db.conn()?;
    db::replications::delete_replication_rule(&conn, id).await?;
    Ok((StatusCode::OK, Json(json!({ "success": true }))).into_response())
}
