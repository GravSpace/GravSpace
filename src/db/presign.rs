use crate::error::{AppError, DbError};
use libsql::{params, Connection};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PresignedUrlRow {
    pub id: i64,
    pub bucket: String,
    pub key: String,
    pub url: String,
    pub signature: String,
    pub method: String,
    pub expires_at: String,
    pub allowed_ip: Option<String>,
    pub one_time_use: bool,
    pub is_revoked: bool,
    pub created_at: String,
}

pub async fn create_presigned_url(
    conn: &Connection,
    bucket: &str,
    key: &str,
    url: &str,
    signature: &str,
    method: &str,
    expires_at: &str,
    allowed_ip: Option<&str>,
    one_time_use: bool,
) -> Result<(), AppError> {
    conn.execute(
        r#"INSERT INTO presigned_urls (
            bucket, key, url, signature, method, expires_at, allowed_ip, one_time_use
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)"#,
        params![
            bucket,
            key,
            url,
            signature,
            method,
            expires_at,
            allowed_ip,
            one_time_use as i64
        ],
    )
    .await
    .map_err(|e| DbError::Query(e.to_string()))?;
    Ok(())
}

pub async fn list_presigned_urls(conn: &Connection) -> Result<Vec<PresignedUrlRow>, AppError> {
    let mut rows = conn
        .query(
            "SELECT id, bucket, key, url, signature, method, expires_at, allowed_ip,
                    one_time_use, is_revoked, created_at
             FROM presigned_urls ORDER BY id DESC",
            (),
        )
        .await
        .map_err(|e| DbError::Query(e.to_string()))?;

    let mut list = Vec::new();
    while let Some(row) = rows.next().await.map_err(|e| DbError::Query(e.to_string()))? {
        let one_time: i64 = row.get(8).unwrap_or(0);
        let revoked: i64 = row.get(9).unwrap_or(0);
        list.push(PresignedUrlRow {
            id: row.get(0).map_err(|e| DbError::Query(e.to_string()))?,
            bucket: row.get(1).unwrap_or_default(),
            key: row.get(2).unwrap_or_default(),
            url: row.get(3).unwrap_or_default(),
            signature: row.get(4).unwrap_or_default(),
            method: row.get(5).unwrap_or_else(|_| "GET".to_string()),
            expires_at: row.get(6).unwrap_or_default(),
            allowed_ip: row.get(7).ok(),
            one_time_use: one_time != 0,
            is_revoked: revoked != 0,
            created_at: row.get(10).unwrap_or_default(),
        });
    }
    Ok(list)
}

pub async fn revoke_presigned_url(conn: &Connection, signature: &str) -> Result<(), AppError> {
    conn.execute(
        "UPDATE presigned_urls SET is_revoked = TRUE WHERE signature = ?1",
        params![signature],
    )
    .await
    .map_err(|e| DbError::Query(e.to_string()))?;

    conn.execute(
        "INSERT INTO revoked_signatures (signature) VALUES (?1) ON CONFLICT(signature) DO NOTHING",
        params![signature],
    )
    .await
    .map_err(|e| DbError::Query(e.to_string()))?;

    Ok(())
}

pub async fn revoke_presigned_url_by_id(conn: &Connection, id: i64) -> Result<(), AppError> {
    let mut rows = conn
        .query(
            "SELECT signature FROM presigned_urls WHERE id = ?1",
            params![id],
        )
        .await
        .map_err(|e| DbError::Query(e.to_string()))?;

    if let Some(row) = rows.next().await.map_err(|e| DbError::Query(e.to_string()))? {
        let sig: String = row.get(0).map_err(|e| DbError::Query(e.to_string()))?;
        revoke_presigned_url(conn, &sig).await?;
    }
    Ok(())
}

pub async fn is_signature_revoked(conn: &Connection, signature: &str) -> Result<bool, AppError> {
    let mut rows = conn
        .query(
            "SELECT 1 FROM revoked_signatures WHERE signature = ?1",
            params![signature],
        )
        .await
        .map_err(|e| DbError::Query(e.to_string()))?;

    Ok(rows.next().await.map_err(|e| DbError::Query(e.to_string()))?.is_some())
}

pub async fn record_used_signature(
    conn: &Connection,
    signature: &str,
    expires_at: &str,
) -> Result<(), AppError> {
    conn.execute(
        "INSERT INTO used_signatures (signature, expires_at) VALUES (?1, ?2) ON CONFLICT(signature) DO NOTHING",
        params![signature, expires_at],
    )
    .await
    .map_err(|e| DbError::Query(e.to_string()))?;
    Ok(())
}

pub async fn is_signature_used(conn: &Connection, signature: &str) -> Result<bool, AppError> {
    let mut rows = conn
        .query(
            "SELECT 1 FROM used_signatures WHERE signature = ?1",
            params![signature],
        )
        .await
        .map_err(|e| DbError::Query(e.to_string()))?;

    Ok(rows.next().await.map_err(|e| DbError::Query(e.to_string()))?.is_some())
}
