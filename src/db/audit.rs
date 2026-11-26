use crate::error::{AppError, DbError};
use libsql::{params, Connection};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuditLogRow {
    pub id: i64,
    pub timestamp: String,
    pub username: Option<String>,
    pub action: String,
    pub resource: String,
    pub result: String,
    pub ip: Option<String>,
    pub user_agent: Option<String>,
    pub details: Option<String>,
}

#[allow(clippy::too_many_arguments)]
pub async fn insert_audit_log(
    conn: &Connection,
    username: Option<&str>,
    action: &str,
    resource: &str,
    result: &str,
    ip: Option<&str>,
    user_agent: Option<&str>,
    details: Option<&str>,
) -> Result<(), AppError> {
    conn.execute(
        r#"INSERT INTO audit_logs (username, action, resource, result, ip, user_agent, details)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)"#,
        params![username, action, resource, result, ip, user_agent, details],
    )
    .await
    .map_err(|e| DbError::Query(e.to_string()))?;
    Ok(())
}

pub async fn list_audit_logs(
    conn: &Connection,
    limit: i64,
    offset: i64,
) -> Result<Vec<AuditLogRow>, AppError> {
    let mut rows = conn
        .query(
            "SELECT id, timestamp, username, action, resource, result, ip, user_agent, details
             FROM audit_logs ORDER BY id DESC LIMIT ?1 OFFSET ?2",
            params![limit, offset],
        )
        .await
        .map_err(|e| DbError::Query(e.to_string()))?;

    let mut logs = Vec::new();
    while let Some(row) = rows.next().await.map_err(|e| DbError::Query(e.to_string()))? {
        logs.push(AuditLogRow {
            id: row.get(0).map_err(|e| DbError::Query(e.to_string()))?,
            timestamp: row.get(1).unwrap_or_default(),
            username: row.get(2).ok(),
            action: row.get(3).unwrap_or_default(),
            resource: row.get(4).unwrap_or_default(),
            result: row.get(5).unwrap_or_default(),
            ip: row.get(6).ok(),
            user_agent: row.get(7).ok(),
            details: row.get(8).ok(),
        });
    }
    Ok(logs)
}
