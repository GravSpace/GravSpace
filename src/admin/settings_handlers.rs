use crate::db;
use crate::error::AppError;
use crate::storage::FileStorage;
use axum::{
    extract::State,
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use std::collections::HashMap;

pub async fn get_system_settings(State(storage): State<FileStorage>) -> Result<Response, AppError> {
    let conn = storage.db.conn()?;
    let mut settings = db::settings::list_settings(&conn).await?;
    let version = env!("CARGO_PKG_VERSION");
    settings.insert("app_version".to_string(), version.to_string());
    settings.insert("version".to_string(), version.to_string());
    Ok((StatusCode::OK, Json(settings)).into_response())
}

pub async fn update_system_settings(
    State(storage): State<FileStorage>,
    Json(payload): Json<HashMap<String, String>>,
) -> Result<Response, AppError> {
    let conn = storage.db.conn()?;
    for (k, v) in payload {
        if k == "app_version" || k == "version" {
            continue;
        }
        db::settings::set_setting(&conn, &k, &v).await?;
    }
    Ok((StatusCode::OK, Json(serde_json::json!({ "success": true }))).into_response())
}

pub async fn trigger_db_checkpoint(
    State(storage): State<FileStorage>,
) -> Result<Response, AppError> {
    let (busy, log, checkpointed) = storage.db.checkpoint().await?;

    let wal_size_bytes = std::fs::metadata("./db/turso.db-wal")
        .or_else(|_| std::fs::metadata("./db/metadata.db-wal"))
        .map(|m| m.len())
        .unwrap_or(0);

    Ok((
        StatusCode::OK,
        Json(serde_json::json!({
            "success": true,
            "busy": busy,
            "log_pages": log,
            "checkpointed_pages": checkpointed,
            "wal_size_bytes": wal_size_bytes,
            "wal_size_human": format!("{:.2} MB", wal_size_bytes as f64 / 1_048_576.0),
        })),
    )
        .into_response())
}
