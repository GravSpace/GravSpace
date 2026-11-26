use crate::db;
use crate::error::AppError;
use crate::storage::FileStorage;
use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde::Deserialize;
use serde_json::json;

#[derive(Deserialize)]
pub struct RetentionQuery {
    pub key: String,
    #[serde(rename = "versionId")]
    pub version_id: Option<String>,
}

#[derive(Deserialize)]
pub struct RetentionPayload {
    #[serde(default, rename = "retainUntilDate", alias = "retain_until_date", alias = "retain_until")]
    pub retain_until_date: Option<String>,
    #[serde(default)]
    pub mode: String,
}

pub async fn set_object_retention(
    State(storage): State<FileStorage>,
    Path(bucket): Path<String>,
    Query(query): Query<RetentionQuery>,
    Json(payload): Json<RetentionPayload>,
) -> Result<Response, AppError> {
    let mode_upper = payload.mode.trim().to_uppercase();
    let is_clear = mode_upper.is_empty() || mode_upper == "NONE";
    if !is_clear && mode_upper != "COMPLIANCE" && mode_upper != "GOVERNANCE" {
        return Err(AppError::BadRequest(
            "Mode must be COMPLIANCE, GOVERNANCE, or NONE".to_string(),
        ));
    }
    let conn = storage.db.conn()?;
    let key = query.key.trim_start_matches('/');
    let version_id = query.version_id.as_deref().unwrap_or("");
    let mode_arg = if is_clear { None } else { Some(mode_upper.as_str()) };
    let retain_arg = if is_clear {
        None
    } else {
        payload.retain_until_date.as_deref()
    };
    db::objects::set_object_retention(&conn, &bucket, key, version_id, retain_arg, mode_arg)
        .await?;
    Ok((StatusCode::OK, Json(json!({ "success": true }))).into_response())
}

#[derive(Deserialize)]
pub struct LegalHoldQuery {
    pub key: String,
    #[serde(rename = "versionId")]
    pub version_id: Option<String>,
}

#[derive(Deserialize)]
pub struct LegalHoldPayload {
    pub hold: bool,
    pub reason: Option<String>,
}

pub async fn set_object_legal_hold(
    State(storage): State<FileStorage>,
    Path(bucket): Path<String>,
    Query(query): Query<LegalHoldQuery>,
    Json(payload): Json<LegalHoldPayload>,
) -> Result<Response, AppError> {
    let conn = storage.db.conn()?;
    let key = query.key.trim_start_matches('/');
    let version_id = query.version_id.as_deref().unwrap_or("");
    db::objects::set_object_legal_hold(
        &conn,
        &bucket,
        key,
        version_id,
        payload.hold,
        payload.reason.as_deref().unwrap_or(""),
    )
    .await?;
    Ok((StatusCode::OK, Json(json!({ "success": true }))).into_response())
}
