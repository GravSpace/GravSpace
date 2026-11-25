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

pub async fn get_database_stats(State(storage): State<FileStorage>) -> Result<Response, AppError> {
    let wal_size_bytes = std::fs::metadata("./db/turso.db-wal")
        .or_else(|_| std::fs::metadata("./db/metadata.db-wal"))
        .map(|m| m.len())
        .unwrap_or(0);

    let db_size_bytes = std::fs::metadata("./db/turso.db")
        .or_else(|_| std::fs::metadata("./db/metadata.db"))
        .map(|m| m.len())
        .unwrap_or(0);

    let vault_size = std::fs::metadata("./db/vault.db").map(|m| m.len()).unwrap_or(0);
    let vault_wal_size = std::fs::metadata("./db/vault.db-wal").map(|m| m.len()).unwrap_or(0);
    let fed_size = std::fs::metadata("./db/federation.db").map(|m| m.len()).unwrap_or(0);
    let fed_wal_size = std::fs::metadata("./db/federation.db-wal").map(|m| m.len()).unwrap_or(0);

    let conn = storage.db.conn()?;
    let mut shards_info = Vec::new();
    for idx in 0..crate::db::shards::NUM_SHARDS {
        let table = format!("objects_{idx:02}");
        let count_sql = format!("SELECT COUNT(*) FROM {table} WHERE deleted_at IS NULL");
        let count: i64 = if let Ok(mut rows) = conn.query(&count_sql, ()).await {
            if let Ok(Some(row)) = rows.next().await {
                row.get(0).unwrap_or(0)
            } else {
                0
            }
        } else {
            0
        };

        shards_info.push(serde_json::json!({
            "shard_id": idx,
            "table_name": table,
            "active_objects": count,
        }));
    }

    Ok((
        StatusCode::OK,
        Json(serde_json::json!({
            "sharding_enabled": true,
            "sharding_architecture": "Table-Partition Sharding (Turso/libSQL)",
            "num_shards": crate::db::shards::NUM_SHARDS,
            "database_url": storage.config.database_url,
            "db_size_bytes": db_size_bytes,
            "db_size_human": format!("{:.2} MB", db_size_bytes as f64 / 1_048_576.0),
            "wal_size_bytes": wal_size_bytes,
            "wal_size_human": format!("{:.2} MB", wal_size_bytes as f64 / 1_048_576.0),
            "databases": {
                "turso": { "size_bytes": db_size_bytes, "wal_bytes": wal_size_bytes },
                "vault": { "size_bytes": vault_size, "wal_bytes": vault_wal_size },
                "federation": { "size_bytes": fed_size, "wal_bytes": fed_wal_size },
            },
            "shards": shards_info,
        })),
    )
        .into_response())
}
