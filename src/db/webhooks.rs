use crate::error::{AppError, DbError};
use libsql::{params, Connection};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WebhookRecord {
    pub id: i64,
    pub bucket: String,
    pub url: String,
    pub events: String,
    pub secret: Option<String>,
    pub active: bool,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WebhookDlqRecord {
    pub id: i64,
    pub webhook_id: Option<i64>,
    pub bucket: String,
    pub url: String,
    pub event_name: String,
    pub payload: String,
    pub error_message: Option<String>,
    pub failed_at: String,
}

pub async fn create_webhook(
    conn: &Connection,
    bucket: &str,
    url: &str,
    events_json: &str,
    secret: Option<&str>,
) -> Result<i64, AppError> {
    conn.execute(
        "INSERT INTO webhooks (bucket, url, events, secret) VALUES (?1, ?2, ?3, ?4)",
        params![bucket, url, events_json, secret],
    )
    .await
    .map_err(|e| DbError::Query(e.to_string()))?;

    let mut rows = conn
        .query("SELECT last_insert_rowid()", ())
        .await
        .map_err(|e| DbError::Query(e.to_string()))?;

    if let Some(row) = rows.next().await.map_err(|e| DbError::Query(e.to_string()))? {
        Ok(row.get(0).unwrap_or(0))
    } else {
        Ok(0)
    }
}

pub async fn list_webhooks(conn: &Connection, bucket: &str) -> Result<Vec<WebhookRecord>, AppError> {
    let mut rows = conn
        .query(
            "SELECT id, bucket, url, events, secret, active, created_at FROM webhooks WHERE bucket = ?1 ORDER BY id DESC",
            params![bucket],
        )
        .await
        .map_err(|e| DbError::Query(e.to_string()))?;

    let mut list = Vec::new();
    while let Some(row) = rows.next().await.map_err(|e| DbError::Query(e.to_string()))? {
        let active: i64 = row.get(5).unwrap_or(1);
        list.push(WebhookRecord {
            id: row.get(0).map_err(|e| DbError::Query(e.to_string()))?,
            bucket: row.get(1).unwrap_or_default(),
            url: row.get(2).unwrap_or_default(),
            events: row.get(3).unwrap_or_default(),
            secret: row.get(4).ok(),
            active: active != 0,
            created_at: row.get(6).unwrap_or_default(),
        });
    }
    Ok(list)
}

pub async fn delete_webhook(conn: &Connection, id: i64) -> Result<(), AppError> {
    conn.execute("DELETE FROM webhooks WHERE id = ?1", params![id])
        .await
        .map_err(|e| DbError::Query(e.to_string()))?;
    Ok(())
}

pub async fn insert_webhook_dlq(
    conn: &Connection,
    webhook_id: Option<i64>,
    bucket: &str,
    url: &str,
    event_name: &str,
    payload: &str,
    error_message: Option<&str>,
) -> Result<(), AppError> {
    conn.execute(
        r#"INSERT INTO webhook_dlq (webhook_id, bucket, url, event_name, payload, error_message)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6)"#,
        params![webhook_id, bucket, url, event_name, payload, error_message],
    )
    .await
    .map_err(|e| DbError::Query(e.to_string()))?;
    Ok(())
}

pub async fn list_webhook_dlq(conn: &Connection, bucket: &str) -> Result<Vec<WebhookDlqRecord>, AppError> {
    let mut rows = conn
        .query(
            "SELECT id, webhook_id, bucket, url, event_name, payload, error_message, failed_at
             FROM webhook_dlq WHERE bucket = ?1 ORDER BY id DESC",
            params![bucket],
        )
        .await
        .map_err(|e| DbError::Query(e.to_string()))?;

    let mut list = Vec::new();
    while let Some(row) = rows.next().await.map_err(|e| DbError::Query(e.to_string()))? {
        list.push(WebhookDlqRecord {
            id: row.get(0).map_err(|e| DbError::Query(e.to_string()))?,
            webhook_id: row.get(1).ok(),
            bucket: row.get(2).unwrap_or_default(),
            url: row.get(3).unwrap_or_default(),
            event_name: row.get(4).unwrap_or_default(),
            payload: row.get(5).unwrap_or_default(),
            error_message: row.get(6).ok(),
            failed_at: row.get(7).unwrap_or_default(),
        });
    }
    Ok(list)
}

pub async fn delete_webhook_dlq(conn: &Connection, id: i64) -> Result<(), AppError> {
    conn.execute("DELETE FROM webhook_dlq WHERE id = ?1", params![id])
        .await
        .map_err(|e| DbError::Query(e.to_string()))?;
    Ok(())
}
