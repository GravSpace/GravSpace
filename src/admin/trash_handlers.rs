use crate::error::AppError;
use crate::storage::FileStorage;
use axum::{
    extract::{Query, State},
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde::Deserialize;
use serde_json::json;

#[derive(Deserialize, Default)]
pub struct TrashQuery {
    pub bucket: Option<String>,
    pub search: Option<String>,
}

pub async fn list_trash(
    State(storage): State<FileStorage>,
    Query(query): Query<TrashQuery>,
) -> Result<Response, AppError> {
    let bucket = query.bucket.unwrap_or_default();
    let search = query.search.unwrap_or_default();
    let trash_items = storage.list_trash(&bucket, &search).await?;
    Ok((StatusCode::OK, Json(trash_items)).into_response())
}

#[derive(Deserialize)]
pub struct RestorePayload {
    pub bucket: String,
    pub key: String,
    #[serde(default, alias = "versionId")]
    pub version_id: Option<String>,
}

pub async fn restore_object(
    State(storage): State<FileStorage>,
    Json(payload): Json<RestorePayload>,
) -> Result<Response, AppError> {
    let v_id = payload.version_id.as_deref().unwrap_or("");
    storage.restore_object(&payload.bucket, &payload.key, v_id).await?;
    Ok((StatusCode::OK, Json(json!({ "success": true }))).into_response())
}

#[derive(Deserialize)]
pub struct BulkRestorePayload {
    pub items: Vec<RestorePayload>,
}

pub async fn bulk_restore_objects(
    State(storage): State<FileStorage>,
    Json(payload): Json<BulkRestorePayload>,
) -> Result<Response, AppError> {
    for item in payload.items {
        let v_id = item.version_id.as_deref().unwrap_or("");
        let _ = storage.restore_object(&item.bucket, &item.key, v_id).await;
    }
    Ok((StatusCode::OK, Json(json!({ "success": true }))).into_response())
}

#[derive(Deserialize, Default)]
pub struct DeleteTrashPayload {
    #[serde(default)]
    pub bucket: Option<String>,
    #[serde(default)]
    pub key: Option<String>,
    #[serde(default, alias = "versionId")]
    pub version_id: Option<String>,
}

pub async fn delete_trash_object(
    State(storage): State<FileStorage>,
    Query(query): Query<DeleteTrashPayload>,
    body: Option<Json<DeleteTrashPayload>>,
) -> Result<Response, AppError> {
    let bucket = query
        .bucket
        .or_else(|| body.as_ref().and_then(|b| b.bucket.clone()))
        .unwrap_or_default();
    let key = query
        .key
        .or_else(|| body.as_ref().and_then(|b| b.key.clone()))
        .unwrap_or_default();
    let version_id = query
        .version_id
        .or_else(|| body.as_ref().and_then(|b| b.version_id.clone()))
        .unwrap_or_default();
    storage.delete_trash_object(&bucket, &key, &version_id).await?;
    Ok((StatusCode::OK, Json(json!({ "success": true }))).into_response())
}

#[derive(Deserialize)]
pub struct BulkDeleteTrashPayload {
    pub items: Vec<DeleteTrashPayload>,
}

pub async fn bulk_delete_trash_objects(
    State(storage): State<FileStorage>,
    Json(payload): Json<BulkDeleteTrashPayload>,
) -> Result<Response, AppError> {
    for item in payload.items {
        let bucket = item.bucket.as_deref().unwrap_or("");
        let key = item.key.as_deref().unwrap_or("");
        let v_id = item.version_id.as_deref().unwrap_or("");
        let _ = storage.delete_trash_object(bucket, key, v_id).await;
    }
    Ok((StatusCode::OK, Json(json!({ "success": true }))).into_response())
}

pub async fn empty_trash(
    State(storage): State<FileStorage>,
    Query(query): Query<TrashQuery>,
) -> Result<Response, AppError> {
    let bucket = query.bucket.unwrap_or_default();
    storage.empty_trash(&bucket).await?;
    Ok((StatusCode::OK, Json(json!({ "success": true }))).into_response())
}
