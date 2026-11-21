use crate::error::{AppError, DbError};
use libsql::{params, Connection};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReplicationRow {
    pub id: i64,
    pub source_bucket: String,
    pub destination_bucket: String,
    pub prefix: Option<String>,
    pub enabled: bool,
    pub created_at: String,
}

pub async fn create_replication_rule(
    conn: &Connection,
    source: &str,
    dest: &str,
    prefix: Option<&str>,
) -> Result<(), AppError> {
    conn.execute(
        r#"INSERT INTO bucket_replications (source_bucket, destination_bucket, prefix)
           VALUES (?1, ?2, ?3)
           ON CONFLICT(source_bucket, destination_bucket, prefix) DO UPDATE SET enabled = TRUE"#,
        params![source, dest, prefix],
    )
    .await
    .map_err(|e| DbError::Query(e.to_string()))?;
    Ok(())
}

pub async fn list_replication_rules(
    conn: &Connection,
    bucket: &str,
) -> Result<Vec<ReplicationRow>, AppError> {
    let mut rows = conn
        .query(
            "SELECT id, source_bucket, destination_bucket, prefix, enabled, created_at
             FROM bucket_replications WHERE source_bucket = ?1 ORDER BY id ASC",
            params![bucket],
        )
        .await
        .map_err(|e| DbError::Query(e.to_string()))?;

    let mut list = Vec::new();
    while let Some(row) = rows.next().await.map_err(|e| DbError::Query(e.to_string()))? {
        let enabled: i64 = row.get(4).unwrap_or(1);
        list.push(ReplicationRow {
            id: row.get(0).map_err(|e| DbError::Query(e.to_string()))?,
            source_bucket: row.get(1).unwrap_or_default(),
            destination_bucket: row.get(2).unwrap_or_default(),
            prefix: row.get(3).ok(),
            enabled: enabled != 0,
            created_at: row.get(5).unwrap_or_default(),
        });
    }
    Ok(list)
}

pub async fn delete_replication_rule(conn: &Connection, id: i64) -> Result<(), AppError> {
    conn.execute(
        "DELETE FROM bucket_replications WHERE id = ?1",
        params![id],
    )
    .await
    .map_err(|e| DbError::Query(e.to_string()))?;
    Ok(())
}
