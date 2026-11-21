use crate::error::{AppError, DbError};
use libsql::{params, Connection};
use std::collections::HashMap;

pub async fn get_setting(conn: &Connection, key: &str) -> Result<Option<String>, AppError> {
    let mut rows = conn
        .query(
            "SELECT value FROM system_settings WHERE key = ?1",
            params![key],
        )
        .await
        .map_err(|e| DbError::Query(e.to_string()))?;

    if let Some(row) = rows.next().await.map_err(|e| DbError::Query(e.to_string()))? {
        Ok(row.get(0).ok())
    } else {
        Ok(None)
    }
}

pub async fn set_setting(conn: &Connection, key: &str, value: &str) -> Result<(), AppError> {
    conn.execute(
        r#"INSERT INTO system_settings (key, value, updated_at) VALUES (?1, ?2, CURRENT_TIMESTAMP)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP"#,
        params![key, value],
    )
    .await
    .map_err(|e| DbError::Query(e.to_string()))?;
    Ok(())
}

pub async fn list_settings(conn: &Connection) -> Result<HashMap<String, String>, AppError> {
    let mut rows = conn
        .query("SELECT key, value FROM system_settings", ())
        .await
        .map_err(|e| DbError::Query(e.to_string()))?;

    let mut map = HashMap::new();
    while let Some(row) = rows.next().await.map_err(|e| DbError::Query(e.to_string()))? {
        if let (Ok(k), Ok(v)) = (row.get::<String>(0), row.get::<String>(1)) {
            map.insert(k, v);
        }
    }
    Ok(map)
}
