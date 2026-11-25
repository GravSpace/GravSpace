use crate::error::{AppError, DbError};
use libsql::{params, Connection, Row};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VaultEnvironment {
    pub id: String,
    pub slug: String,
    pub name: String,
    pub color: String,
    pub description: Option<String>,
    pub position: i64,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VaultEnvironmentWithCount {
    pub id: String,
    pub slug: String,
    pub name: String,
    pub color: String,
    pub description: Option<String>,
    pub position: i64,
    pub secrets_count: i64,
    pub created_at: String,
}

fn parse_env_row(row: &Row) -> Result<VaultEnvironment, AppError> {
    Ok(VaultEnvironment {
        id: row.get::<String>(0).map_err(|e| DbError::Query(e.to_string()))?,
        slug: row.get::<String>(1).map_err(|e| DbError::Query(e.to_string()))?,
        name: row.get::<String>(2).map_err(|e| DbError::Query(e.to_string()))?,
        color: row.get::<String>(3).unwrap_or_else(|_| "sky".to_string()),
        description: row.get::<Option<String>>(4).unwrap_or(None),
        position: row.get::<i64>(5).unwrap_or(0),
        created_at: row.get::<String>(6).unwrap_or_default(),
    })
}

pub async fn list_environments(
    conn: &Connection,
    project_id: Option<&str>,
) -> Result<Vec<VaultEnvironmentWithCount>, AppError> {
    let mut rows = match project_id {
        Some(proj) if !proj.is_empty() && proj != "all" => {
            let sql = "SELECT e.id, e.slug, e.name, e.color, e.description, e.position, e.created_at, \
                       COUNT(s.id) as secrets_count \
                       FROM vault_environments e \
                       LEFT JOIN vault_secrets s ON s.environment = e.slug \
                         AND (s.project_id = ?1 OR s.project_id IN (SELECT id FROM vault_projects WHERE slug = ?1)) \
                       GROUP BY e.id, e.slug, e.name, e.color, e.description, e.position, e.created_at \
                       ORDER BY e.position ASC, e.created_at ASC";
            conn.query(sql, params![proj.to_string()])
                .await
                .map_err(|e| DbError::Query(e.to_string()))?
        }
        _ => {
            let sql = "SELECT e.id, e.slug, e.name, e.color, e.description, e.position, e.created_at, \
                       COUNT(s.id) as secrets_count \
                       FROM vault_environments e \
                       LEFT JOIN vault_secrets s ON s.environment = e.slug \
                       GROUP BY e.id, e.slug, e.name, e.color, e.description, e.position, e.created_at \
                       ORDER BY e.position ASC, e.created_at ASC";
            conn.query(sql, ())
                .await
                .map_err(|e| DbError::Query(e.to_string()))?
        }
    };

    let mut list = Vec::new();
    while let Some(row) = rows.next().await.map_err(|e| DbError::Query(e.to_string()))? {
        list.push(VaultEnvironmentWithCount {
            id: row.get::<String>(0).map_err(|e| DbError::Query(e.to_string()))?,
            slug: row.get::<String>(1).map_err(|e| DbError::Query(e.to_string()))?,
            name: row.get::<String>(2).map_err(|e| DbError::Query(e.to_string()))?,
            color: row.get::<String>(3).unwrap_or_else(|_| "sky".to_string()),
            description: row.get::<Option<String>>(4).unwrap_or(None),
            position: row.get::<i64>(5).unwrap_or(0),
            created_at: row.get::<String>(6).unwrap_or_default(),
            secrets_count: row.get::<i64>(7).unwrap_or(0),
        });
    }
    Ok(list)
}

pub async fn get_environment(conn: &Connection, id_or_slug: &str) -> Result<Option<VaultEnvironment>, AppError> {
    let sql = "SELECT id, slug, name, color, description, position, created_at \
               FROM vault_environments WHERE id = ?1 OR slug = ?1 LIMIT 1";
    let mut rows = conn
        .query(sql, params![id_or_slug])
        .await
        .map_err(|e| DbError::Query(e.to_string()))?;

    if let Some(row) = rows.next().await.map_err(|e| DbError::Query(e.to_string()))? {
        Ok(Some(parse_env_row(&row)?))
    } else {
        Ok(None)
    }
}

pub async fn create_environment(conn: &Connection, env: &VaultEnvironment) -> Result<(), AppError> {
    let sql = "INSERT INTO vault_environments (id, slug, name, color, description, position) \
               VALUES (?1, ?2, ?3, ?4, ?5, ?6)";
    conn.execute(
        sql,
        params![
            env.id.clone(),
            env.slug.clone(),
            env.name.clone(),
            env.color.clone(),
            env.description.clone(),
            env.position,
        ],
    )
    .await
    .map_err(|e| DbError::Query(format!("Failed to insert vault environment: {e}")))?;
    Ok(())
}

pub async fn update_environment(
    conn: &Connection,
    id: &str,
    name: &str,
    color: &str,
    description: Option<&str>,
    position: i64,
) -> Result<bool, AppError> {
    let sql = "UPDATE vault_environments \
               SET name = ?1, color = ?2, description = ?3, position = ?4 \
               WHERE id = ?5";
    let count = conn
        .execute(sql, params![name, color, description, position, id])
        .await
        .map_err(|e| DbError::Query(e.to_string()))?;
    Ok(count > 0)
}

pub async fn delete_environment(conn: &Connection, id: &str) -> Result<bool, AppError> {
    // Check if any secrets are assigned to this environment
    let check_sql = "SELECT COUNT(*) FROM vault_secrets \
                     WHERE environment = (SELECT slug FROM vault_environments WHERE id = ?1)";
    let mut check_rows = conn
        .query(check_sql, params![id])
        .await
        .map_err(|e| DbError::Query(e.to_string()))?;

    if let Some(row) = check_rows.next().await.map_err(|e| DbError::Query(e.to_string()))? {
        let count: i64 = row.get(0).unwrap_or(0);
        if count > 0 {
            return Err(AppError::BadRequest(format!(
                "Cannot delete environment. It contains {count} secrets. Please delete or move them first."
            )));
        }
    }

    let delete_sql = "DELETE FROM vault_environments WHERE id = ?1";
    let count = conn
        .execute(delete_sql, params![id])
        .await
        .map_err(|e| DbError::Query(e.to_string()))?;
    Ok(count > 0)
}
