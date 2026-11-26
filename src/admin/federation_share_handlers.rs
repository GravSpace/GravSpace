use crate::admin::federation_handlers::broadcast_federation_event;
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

pub async fn list_shares(State(storage): State<FileStorage>) -> Result<Response, AppError> {
    let conn = storage.federation_conn()?;
    let shares = db::federation::list_shares(&conn).await?;
    Ok((StatusCode::OK, Json(shares)).into_response())
}

#[derive(Deserialize)]
pub struct CreateSharePayload {
    pub name: String,
    pub source_bucket: String,
    #[serde(default)]
    pub source_prefix: String,
    pub remote_server_id: i64,
    pub target_bucket: String,
    #[serde(default)]
    pub target_prefix: String,
    #[serde(default = "default_sync_mode")]
    pub sync_mode: String,
}

#[derive(Deserialize)]
pub struct UpdateSharePayload {
    pub name: String,
    pub source_bucket: String,
    #[serde(default)]
    pub source_prefix: String,
    pub remote_server_id: i64,
    pub target_bucket: String,
    #[serde(default)]
    pub target_prefix: String,
    #[serde(default = "default_sync_mode")]
    pub sync_mode: String,
    #[serde(default = "default_enabled")]
    pub enabled: bool,
}

#[derive(Deserialize, Default)]
pub struct ToggleSharePayload {
    pub enabled: Option<bool>,
}

fn default_sync_mode() -> String {
    "one_way".to_string()
}

fn default_enabled() -> bool {
    true
}

fn normalize_sync_mode(mode: &str) -> Result<&'static str, AppError> {
    match mode.trim() {
        "one_way" => Ok("one_way"),
        "two_way" => Ok("two_way"),
        _ => Err(AppError::BadRequest(
            "sync_mode must be 'one_way' or 'two_way'".to_string(),
        )),
    }
}

pub async fn create_share(
    State(storage): State<FileStorage>,
    Json(payload): Json<CreateSharePayload>,
) -> Result<Response, AppError> {
    let name = payload.name.trim();
    if name.is_empty() || payload.source_bucket.trim().is_empty() || payload.target_bucket.trim().is_empty() {
        return Err(AppError::BadRequest(
            "Name, source_bucket, and target_bucket are required".to_string(),
        ));
    }
    let sync_mode = normalize_sync_mode(&payload.sync_mode)?;

    let conn = storage.federation_conn()?;
    let id = db::federation::create_share(
        &conn,
        name,
        payload.source_bucket.trim(),
        payload.source_prefix.trim(),
        payload.remote_server_id,
        payload.target_bucket.trim(),
        payload.target_prefix.trim(),
        sync_mode,
    )
    .await?;

    broadcast_federation_event("shares_changed", json!({ "action": "created", "id": id }));
    Ok((
        StatusCode::CREATED,
        Json(json!({ "id": id, "success": true })),
    )
        .into_response())
}

pub async fn update_share(
    State(storage): State<FileStorage>,
    Path(id): Path<i64>,
    Json(payload): Json<UpdateSharePayload>,
) -> Result<Response, AppError> {
    let name = payload.name.trim();
    if name.is_empty() || payload.source_bucket.trim().is_empty() || payload.target_bucket.trim().is_empty() {
        return Err(AppError::BadRequest(
            "Name, source_bucket, and target_bucket are required".to_string(),
        ));
    }
    let sync_mode = normalize_sync_mode(&payload.sync_mode)?;

    let conn = storage.federation_conn()?;
    let updated = db::federation_shares::update_share(
        &conn,
        id,
        &db::federation_shares::ShareUpdate {
            name,
            source_bucket: payload.source_bucket.trim(),
            source_prefix: payload.source_prefix.trim(),
            remote_server_id: payload.remote_server_id,
            target_bucket: payload.target_bucket.trim(),
            target_prefix: payload.target_prefix.trim(),
            sync_mode,
            enabled: payload.enabled,
        },
    )
    .await?;

    if !updated {
        return Err(AppError::Storage(
            crate::error::StorageError::BucketNotFound(format!("Share #{id} not found")),
        ));
    }

    if payload.enabled {
        let _ = storage.reconcile_share(id).await;
    }
    broadcast_federation_event("shares_changed", json!({ "action": "updated", "id": id }));
    Ok((StatusCode::OK, Json(json!({ "id": id, "success": true }))).into_response())
}

pub async fn toggle_share(
    State(storage): State<FileStorage>,
    Path(id): Path<i64>,
    payload: Option<Json<ToggleSharePayload>>,
) -> Result<Response, AppError> {
    let desired = payload.and_then(|Json(p)| p.enabled);
    let conn = storage.federation_conn()?;
    let Some(enabled) = db::federation_shares::set_share_enabled(&conn, id, desired).await? else {
        return Err(AppError::Storage(
            crate::error::StorageError::BucketNotFound(format!("Share #{id} not found")),
        ));
    };

    if enabled {
        let _ = storage.reconcile_share(id).await;
    }
    broadcast_federation_event(
        "shares_changed",
        json!({ "action": "toggled", "id": id, "enabled": enabled }),
    );
    Ok((
        StatusCode::OK,
        Json(json!({ "id": id, "enabled": enabled, "success": true })),
    )
        .into_response())
}

pub async fn delete_share(
    State(storage): State<FileStorage>,
    Path(id): Path<i64>,
) -> Result<Response, AppError> {
    let conn = storage.federation_conn()?;
    db::federation::delete_share(&conn, id).await?;
    broadcast_federation_event("shares_changed", json!({ "action": "deleted", "id": id }));
    Ok((StatusCode::OK, Json(json!({ "success": true }))).into_response())
}

pub async fn reconcile_share(
    State(storage): State<FileStorage>,
    Path(id): Path<i64>,
) -> Result<Response, AppError> {
    let enqueued = storage.reconcile_share(id).await?;
    broadcast_federation_event(
        "shares_changed",
        json!({ "action": "reconciled", "id": id, "enqueued_count": enqueued }),
    );
    Ok((
        StatusCode::OK,
        Json(json!({ "success": true, "enqueued_count": enqueued })),
    )
        .into_response())
}
