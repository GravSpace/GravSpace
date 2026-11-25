use crate::error::{AppError, DbError};
use libsql::{params, Connection, Row};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VaultProject {
    pub id: String,
    pub slug: String,
    pub name: String,
    pub description: Option<String>,
    pub color: String,
    pub icon: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VaultProjectWithCount {
    pub id: String,
    pub slug: String,
    pub name: String,
    pub description: Option<String>,
    pub color: String,
    pub icon: String,
    pub secrets_count: i64,
    pub created_at: String,
    pub updated_at: String,
}

fn parse_project_row(row: &Row) -> Result<VaultProject, AppError> {
    Ok(VaultProject {
        id: row.get::<String>(0).map_err(|e| DbError::Query(e.to_string()))?,
        slug: row.get::<String>(1).map_err(|e| DbError::Query(e.to_string()))?,
        name: row.get::<String>(2).map_err(|e| DbError::Query(e.to_string()))?,
        description: row.get::<Option<String>>(3).unwrap_or(None),
        color: row.get::<String>(4).unwrap_or_else(|_| "indigo".to_string()),
        icon: row.get::<String>(5).unwrap_or_else(|_| "folder".to_string()),
        created_at: row.get::<String>(6).unwrap_or_default(),
        updated_at: row.get::<String>(7).unwrap_or_default(),
    })
}

pub async fn list_projects(conn: &Connection) -> Result<Vec<VaultProjectWithCount>, AppError> {
    let sql = "SELECT p.id, p.slug, p.name, p.description, p.color, p.icon, \
               p.created_at, p.updated_at, \
               COUNT(s.id) as secrets_count \
               FROM vault_projects p \
               LEFT JOIN vault_secrets s ON (s.project_id = p.id OR s.project_id = p.slug) \
               GROUP BY p.id, p.slug, p.name, p.description, p.color, p.icon, p.created_at, p.updated_at \
               ORDER BY CASE WHEN p.slug = 'default' THEN 0 ELSE 1 END, p.name ASC";

    let mut rows = conn
        .query(sql, ())
        .await
        .map_err(|e| DbError::Query(e.to_string()))?;

    let mut list = Vec::new();
    while let Some(row) = rows.next().await.map_err(|e| DbError::Query(e.to_string()))? {
        list.push(VaultProjectWithCount {
            id: row.get::<String>(0).map_err(|e| DbError::Query(e.to_string()))?,
            slug: row.get::<String>(1).map_err(|e| DbError::Query(e.to_string()))?,
            name: row.get::<String>(2).map_err(|e| DbError::Query(e.to_string()))?,
            description: row.get::<Option<String>>(3).unwrap_or(None),
            color: row.get::<String>(4).unwrap_or_else(|_| "indigo".to_string()),
            icon: row.get::<String>(5).unwrap_or_else(|_| "folder".to_string()),
            created_at: row.get::<String>(6).unwrap_or_default(),
            updated_at: row.get::<String>(7).unwrap_or_default(),
            secrets_count: row.get::<i64>(8).unwrap_or(0),
        });
    }
    Ok(list)
}

pub async fn get_project(conn: &Connection, id_or_slug: &str) -> Result<Option<VaultProject>, AppError> {
    let sql = "SELECT id, slug, name, description, color, icon, created_at, updated_at \
               FROM vault_projects WHERE id = ?1 OR slug = ?1 LIMIT 1";
    let mut rows = conn
        .query(sql, params![id_or_slug])
        .await
        .map_err(|e| DbError::Query(e.to_string()))?;

    if let Some(row) = rows.next().await.map_err(|e| DbError::Query(e.to_string()))? {
        Ok(Some(parse_project_row(&row)?))
    } else {
        Ok(None)
    }
}

pub async fn create_project(conn: &Connection, p: &VaultProject) -> Result<(), AppError> {
    let sql = "INSERT INTO vault_projects (id, slug, name, description, color, icon) \
               VALUES (?1, ?2, ?3, ?4, ?5, ?6)";
    conn.execute(
        sql,
        params![
            p.id.clone(),
            p.slug.clone(),
            p.name.clone(),
            p.description.clone(),
            p.color.clone(),
            p.icon.clone(),
        ],
    )
    .await
    .map_err(|e| DbError::Query(format!("Failed to insert vault project: {e}")))?;
    Ok(())
}

pub async fn update_project(
    conn: &Connection,
    id_or_slug: &str,
    name: &str,
    description: Option<&str>,
    color: &str,
    icon: &str,
) -> Result<(), AppError> {
    let sql = "UPDATE vault_projects \
               SET name = ?2, description = ?3, color = ?4, icon = ?5, updated_at = CURRENT_TIMESTAMP \
               WHERE id = ?1 OR slug = ?1";
    conn.execute(
        sql,
        params![
            id_or_slug,
            name,
            description,
            color,
            icon,
        ],
    )
    .await
    .map_err(|e| DbError::Query(format!("Failed to update vault project: {e}")))?;
    Ok(())
}

pub async fn delete_project(conn: &Connection, id_or_slug: &str) -> Result<(), AppError> {
    let proj = get_project(conn, id_or_slug)
        .await?
        .ok_or_else(|| AppError::NotFound(format!("Project '{id_or_slug}' not found")))?;

    if proj.slug == "default" || proj.id == "proj_default" {
        return Err(AppError::BadRequest("Cannot delete the default project".to_string()));
    }

    // Check if any secrets belong to this project
    let mut count_rows = conn
        .query(
            "SELECT COUNT(*) FROM vault_secrets WHERE project_id = ?1 OR project_id = ?2",
            params![proj.id.clone(), proj.slug.clone()],
        )
        .await
        .map_err(|e| DbError::Query(e.to_string()))?;

    let count: i64 = if let Some(row) = count_rows.next().await.map_err(|e| DbError::Query(e.to_string()))? {
        row.get(0).unwrap_or(0)
    } else {
        0
    };

    if count > 0 {
        return Err(AppError::BadRequest(format!(
            "Cannot delete project '{}' because it still contains {} secret(s). Please move or delete the secrets first.",
            proj.name, count
        )));
    }

    let sql = "DELETE FROM vault_projects WHERE id = ?1 OR slug = ?1";
    conn.execute(sql, params![id_or_slug])
        .await
        .map_err(|e| DbError::Query(format!("Failed to delete vault project: {e}")))?;

    Ok(())
}
