use crate::error::{AppError, DbError};
use libsql::{params, Connection};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PolicyRecord {
    pub name: String,
    pub data: String,
}

pub async fn upsert_user_policy(
    conn: &Connection,
    username: &str,
    name: &str,
    policy_json: &str,
) -> Result<(), AppError> {
    conn.execute(
        r#"INSERT INTO user_policies (username, name, policy_data) VALUES (?1, ?2, ?3)
           ON CONFLICT(username, name) DO UPDATE SET policy_data = excluded.policy_data"#,
        params![username, name, policy_json],
    )
    .await
    .map_err(|e| DbError::Query(e.to_string()))?;
    Ok(())
}

pub async fn list_user_policies(
    conn: &Connection,
    username: &str,
) -> Result<Vec<PolicyRecord>, AppError> {
    let mut rows = conn
        .query(
            "SELECT name, policy_data FROM user_policies WHERE username = ?1 ORDER BY name ASC",
            params![username],
        )
        .await
        .map_err(|e| DbError::Query(e.to_string()))?;

    let mut list = Vec::new();
    while let Some(row) = rows.next().await.map_err(|e| DbError::Query(e.to_string()))? {
        list.push(PolicyRecord {
            name: row.get(0).map_err(|e| DbError::Query(e.to_string()))?,
            data: row.get(1).unwrap_or_default(),
        });
    }
    Ok(list)
}

pub async fn delete_user_policy(
    conn: &Connection,
    username: &str,
    name: &str,
) -> Result<(), AppError> {
    conn.execute(
        "DELETE FROM user_policies WHERE username = ?1 AND name = ?2",
        params![username, name],
    )
    .await
    .map_err(|e| DbError::Query(e.to_string()))?;
    Ok(())
}

pub async fn upsert_global_policy(
    conn: &Connection,
    name: &str,
    policy_json: &str,
) -> Result<(), AppError> {
    conn.execute(
        r#"INSERT INTO global_policies (name, policy_data) VALUES (?1, ?2)
           ON CONFLICT(name) DO UPDATE SET policy_data = excluded.policy_data"#,
        params![name, policy_json],
    )
    .await
    .map_err(|e| DbError::Query(e.to_string()))?;
    Ok(())
}

pub async fn list_global_policies(conn: &Connection) -> Result<Vec<PolicyRecord>, AppError> {
    let mut rows = conn
        .query(
            "SELECT name, policy_data FROM global_policies ORDER BY name ASC",
            (),
        )
        .await
        .map_err(|e| DbError::Query(e.to_string()))?;

    let mut list = Vec::new();
    while let Some(row) = rows.next().await.map_err(|e| DbError::Query(e.to_string()))? {
        list.push(PolicyRecord {
            name: row.get(0).map_err(|e| DbError::Query(e.to_string()))?,
            data: row.get(1).unwrap_or_default(),
        });
    }
    Ok(list)
}

pub async fn delete_global_policy(conn: &Connection, name: &str) -> Result<(), AppError> {
    conn.execute(
        "DELETE FROM global_policies WHERE name = ?1",
        params![name],
    )
    .await
    .map_err(|e| DbError::Query(e.to_string()))?;
    Ok(())
}
