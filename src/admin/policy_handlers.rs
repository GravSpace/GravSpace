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

pub async fn list_policies(State(storage): State<FileStorage>) -> Result<Response, AppError> {
    let conn = storage.db.conn()?;
    let policies = db::policies::list_global_policies(&conn).await?;
    Ok((StatusCode::OK, Json(policies)).into_response())
}

#[derive(Deserialize)]
pub struct CreatePolicyPayload {
    pub name: String,
    #[serde(default)]
    pub policy: Option<serde_json::Value>,
    #[serde(default)]
    pub version: Option<String>,
    #[serde(default)]
    pub statement: Option<serde_json::Value>,
    #[serde(rename = "Statement", default)]
    pub statement_upper: Option<serde_json::Value>,
}

pub async fn create_policy(
    State(storage): State<FileStorage>,
    Json(payload): Json<CreatePolicyPayload>,
) -> Result<Response, AppError> {
    let conn = storage.db.conn()?;
    let policy_doc = if let Some(p) = payload.policy {
        p
    } else {
        let stmts = payload.statement.or(payload.statement_upper).unwrap_or(json!([]));
        let ver = payload.version.unwrap_or_else(|| "2012-10-17".to_string());
        json!({
            "Version": ver,
            "Statement": stmts,
        })
    };
    let json_str = serde_json::to_string(&policy_doc).unwrap_or_default();
    db::policies::upsert_global_policy(&conn, &payload.name, &json_str).await?;
    Ok((StatusCode::OK, Json(json!({ "success": true }))).into_response())
}

pub async fn delete_policy(
    State(storage): State<FileStorage>,
    Path(name): Path<String>,
) -> Result<Response, AppError> {
    let conn = storage.db.conn()?;
    db::policies::delete_global_policy(&conn, &name).await?;
    Ok((StatusCode::OK, Json(json!({ "success": true }))).into_response())
}
