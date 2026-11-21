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
    let settings = db::settings::list_settings(&conn).await?;
    Ok((StatusCode::OK, Json(settings)).into_response())
}

pub async fn update_system_settings(
    State(storage): State<FileStorage>,
    Json(payload): Json<HashMap<String, String>>,
) -> Result<Response, AppError> {
    let conn = storage.db.conn()?;
    for (k, v) in payload {
        db::settings::set_setting(&conn, &k, &v).await?;
    }
    Ok((StatusCode::OK, Json(serde_json::json!({ "success": true }))).into_response())
}
