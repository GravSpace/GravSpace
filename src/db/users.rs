use crate::error::{AppError, DbError};
use libsql::{params, Connection};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserRecord {
    pub username: String,
    pub password_hash: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AccessKeyRecord {
    pub access_key_id: String,
    pub secret_access_key: String,
    pub username: String,
    pub created_at: String,
}

pub async fn upsert_user(
    conn: &Connection,
    username: &str,
    password_hash: &str,
) -> Result<(), AppError> {
    conn.execute(
        r#"INSERT INTO users (username, password_hash) VALUES (?1, ?2)
           ON CONFLICT(username) DO UPDATE SET password_hash = CASE WHEN excluded.password_hash != '' THEN excluded.password_hash ELSE users.password_hash END"#,
        params![username, password_hash],
    )
    .await
    .map_err(|e| DbError::Query(e.to_string()))?;
    Ok(())
}

pub async fn get_user(conn: &Connection, username: &str) -> Result<Option<UserRecord>, AppError> {
    let mut rows = conn
        .query(
            "SELECT username, password_hash, created_at FROM users WHERE username = ?1",
            params![username],
        )
        .await
        .map_err(|e| DbError::Query(e.to_string()))?;

    let res = if let Some(row) = rows.next().await.map_err(|e| DbError::Query(e.to_string()))? {
        Some(UserRecord {
            username: row.get(0).map_err(|e| DbError::Query(e.to_string()))?,
            password_hash: row.get(1).ok(),
            created_at: row.get(2).unwrap_or_default(),
        })
    } else {
        None
    };
    drop(rows);
    Ok(res)
}

pub async fn list_users(conn: &Connection) -> Result<Vec<UserRecord>, AppError> {
    let mut rows = conn
        .query(
            "SELECT username, password_hash, created_at FROM users ORDER BY username ASC",
            (),
        )
        .await
        .map_err(|e| DbError::Query(e.to_string()))?;

    let mut list = Vec::new();
    while let Some(row) = rows.next().await.map_err(|e| DbError::Query(e.to_string()))? {
        list.push(UserRecord {
            username: row.get(0).map_err(|e| DbError::Query(e.to_string()))?,
            password_hash: row.get(1).ok(),
            created_at: row.get(2).unwrap_or_default(),
        });
    }
    Ok(list)
}

pub async fn delete_user(conn: &Connection, username: &str) -> Result<(), AppError> {
    conn.execute("DELETE FROM users WHERE username = ?1", params![username])
        .await
        .map_err(|e| DbError::Query(e.to_string()))?;
    Ok(())
}

pub async fn create_access_key(
    conn: &Connection,
    username: &str,
    key_id: &str,
    secret_key: &str,
) -> Result<(), AppError> {
    conn.execute(
        "INSERT INTO access_keys (access_key_id, secret_access_key, username) VALUES (?1, ?2, ?3)",
        params![key_id, secret_key, username],
    )
    .await
    .map_err(|e| DbError::Query(e.to_string()))?;
    Ok(())
}

pub async fn get_access_key(
    conn: &Connection,
    key_id: &str,
) -> Result<Option<AccessKeyRecord>, AppError> {
    let mut rows = conn
        .query(
            "SELECT access_key_id, secret_access_key, username, created_at FROM access_keys WHERE access_key_id = ?1",
            params![key_id],
        )
        .await
        .map_err(|e| DbError::Query(e.to_string()))?;

    let res = if let Some(row) = rows.next().await.map_err(|e| DbError::Query(e.to_string()))? {
        Some(AccessKeyRecord {
            access_key_id: row.get(0).map_err(|e| DbError::Query(e.to_string()))?,
            secret_access_key: row.get(1).map_err(|e| DbError::Query(e.to_string()))?,
            username: row.get(2).unwrap_or_default(),
            created_at: row.get(3).unwrap_or_default(),
        })
    } else {
        None
    };
    drop(rows);
    Ok(res)
}

pub async fn list_access_keys(
    conn: &Connection,
    username: &str,
) -> Result<Vec<AccessKeyRecord>, AppError> {
    let mut rows = conn
        .query(
            "SELECT access_key_id, secret_access_key, username, created_at FROM access_keys WHERE username = ?1",
            params![username],
        )
        .await
        .map_err(|e| DbError::Query(e.to_string()))?;

    let mut list = Vec::new();
    while let Some(row) = rows.next().await.map_err(|e| DbError::Query(e.to_string()))? {
        list.push(AccessKeyRecord {
            access_key_id: row.get(0).map_err(|e| DbError::Query(e.to_string()))?,
            secret_access_key: row.get(1).map_err(|e| DbError::Query(e.to_string()))?,
            username: row.get(2).unwrap_or_default(),
            created_at: row.get(3).unwrap_or_default(),
        });
    }
    Ok(list)
}

pub async fn delete_access_key(conn: &Connection, key_id: &str) -> Result<(), AppError> {
    conn.execute(
        "DELETE FROM access_keys WHERE access_key_id = ?1",
        params![key_id],
    )
    .await
    .map_err(|e| DbError::Query(e.to_string()))?;
    Ok(())
}
