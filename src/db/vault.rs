use crate::error::{AppError, DbError};
use libsql::{params, Connection};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VaultSecretRow {
    pub id: String,
    pub project_id: String,
    pub name: String,
    pub environment: String,
    pub secret_type: String,
    pub description: Option<String>,
    pub tags: Option<String>,
    pub current_version: i64,
    pub encrypted_value: String,
    pub metadata_json: Option<String>,
    pub requires_approval: bool,
    pub created_by: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VaultSecretVersionRow {
    pub id: i64,
    pub secret_id: String,
    pub version: i64,
    pub encrypted_value: String,
    pub metadata_json: Option<String>,
    pub comment: Option<String>,
    pub created_by: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VaultAccessRequestRow {
    pub id: String,
    pub secret_id: Option<String>,
    pub environment: String,
    pub requester: String,
    pub justification: String,
    pub requested_duration_minutes: i64,
    pub status: String,
    pub reviewed_by: Option<String>,
    pub reviewed_at: Option<String>,
    pub review_comment: Option<String>,
    pub access_granted_until: Option<String>,
    pub created_at: String,
}

pub async fn list_secrets(
    conn: &Connection,
    project_id: Option<&str>,
    environment: Option<&str>,
    secret_type: Option<&str>,
    query: Option<&str>,
) -> Result<Vec<VaultSecretRow>, AppError> {
    let mut sql = String::from(
        "SELECT id, name, environment, secret_type, description, tags, current_version, \
         encrypted_value, metadata_json, requires_approval, created_by, created_at, updated_at, project_id \
         FROM vault_secrets WHERE 1=1",
    );
    let mut p_vec: Vec<libsql::Value> = Vec::new();

    if let Some(proj) = project_id {
        if !proj.is_empty() && proj != "all" {
            sql.push_str(" AND (project_id = ? OR project_id = (SELECT slug FROM vault_projects WHERE id = ? LIMIT 1) OR project_id = (SELECT id FROM vault_projects WHERE slug = ? LIMIT 1))");
            p_vec.push(proj.to_string().into());
            p_vec.push(proj.to_string().into());
            p_vec.push(proj.to_string().into());
        }
    }
    if let Some(env) = environment {
        if !env.is_empty() && env != "all" {
            sql.push_str(" AND environment = ?");
            p_vec.push(env.to_string().into());
        }
    }
    if let Some(st) = secret_type {
        if !st.is_empty() && st != "all" {
            sql.push_str(" AND secret_type = ?");
            p_vec.push(st.to_string().into());
        }
    }
    if let Some(q) = query {
        if !q.trim().is_empty() {
            sql.push_str(" AND (name LIKE ? OR description LIKE ? OR tags LIKE ?)");
            let wild = format!("%{}%", q.trim());
            p_vec.push(wild.clone().into());
            p_vec.push(wild.clone().into());
            p_vec.push(wild.into());
        }
    }
    sql.push_str(" ORDER BY name ASC");

    let mut rows = conn
        .query(&sql, libsql::params_from_iter(p_vec))
        .await
        .map_err(|e| DbError::Query(e.to_string()))?;

    let mut list = Vec::new();
    while let Some(row) = rows.next().await.map_err(|e| DbError::Query(e.to_string()))? {
        list.push(parse_secret_row(&row)?);
    }
    Ok(list)
}

pub async fn get_secret(conn: &Connection, id: &str) -> Result<Option<VaultSecretRow>, AppError> {
    let mut rows = conn
        .query(
            "SELECT id, name, environment, secret_type, description, tags, current_version, \
             encrypted_value, metadata_json, requires_approval, created_by, created_at, updated_at, project_id \
             FROM vault_secrets WHERE id = ?1",
            params![id],
        )
        .await
        .map_err(|e| DbError::Query(e.to_string()))?;

    if let Some(row) = rows.next().await.map_err(|e| DbError::Query(e.to_string()))? {
        Ok(Some(parse_secret_row(&row)?))
    } else {
        Ok(None)
    }
}

pub async fn get_secret_by_name(
    conn: &Connection,
    project_id: Option<&str>,
    environment: &str,
    name: &str,
) -> Result<Option<VaultSecretRow>, AppError> {
    let proj = project_id.unwrap_or("default");
    let mut rows = conn
        .query(
            "SELECT id, name, environment, secret_type, description, tags, current_version, \
             encrypted_value, metadata_json, requires_approval, created_by, created_at, updated_at, project_id \
             FROM vault_secrets WHERE (project_id = ?1 OR project_id = (SELECT slug FROM vault_projects WHERE id = ?1 LIMIT 1) OR project_id = (SELECT id FROM vault_projects WHERE slug = ?1 LIMIT 1)) AND environment = ?2 AND name = ?3",
            params![proj, environment, name],
        )
        .await
        .map_err(|e| DbError::Query(e.to_string()))?;

    if let Some(row) = rows.next().await.map_err(|e| DbError::Query(e.to_string()))? {
        Ok(Some(parse_secret_row(&row)?))
    } else {
        Ok(None)
    }
}

pub async fn create_secret(conn: &Connection, s: &VaultSecretRow) -> Result<(), AppError> {
    conn.execute(
        "INSERT INTO vault_secrets (id, name, environment, secret_type, description, tags, current_version, \
         encrypted_value, metadata_json, requires_approval, created_by, created_at, updated_at, project_id) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?12)",
        params![
            s.id.clone(), s.name.clone(), s.environment.clone(), s.secret_type.clone(),
            s.description.clone(), s.tags.clone(), s.current_version, s.encrypted_value.clone(),
            s.metadata_json.clone(), s.requires_approval, s.created_by.clone(),
            if s.project_id.is_empty() { "default".to_string() } else { s.project_id.clone() }
        ],
    ).await.map_err(|e| DbError::Query(e.to_string()))?;

    // Record initial version 1
    conn.execute(
        "INSERT INTO vault_secret_versions (secret_id, version, encrypted_value, metadata_json, comment, created_by, created_at) \
         VALUES (?1, 1, ?2, ?3, 'Initial creation', ?4, CURRENT_TIMESTAMP)",
        params![s.id.clone(), s.encrypted_value.clone(), s.metadata_json.clone(), s.created_by.clone()],
    ).await.map_err(|e| DbError::Query(e.to_string()))?;
    Ok(())
}

pub async fn update_secret_value(
    conn: &Connection,
    id: &str,
    new_version: i64,
    encrypted_value: &str,
    metadata_json: Option<&str>,
    comment: Option<&str>,
    updated_by: Option<&str>,
) -> Result<(), AppError> {
    conn.execute(
        "UPDATE vault_secrets SET current_version = ?1, encrypted_value = ?2, metadata_json = COALESCE(?3, metadata_json), updated_at = CURRENT_TIMESTAMP WHERE id = ?4",
        params![new_version, encrypted_value, metadata_json, id],
    ).await.map_err(|e| DbError::Query(e.to_string()))?;

    conn.execute(
        "INSERT INTO vault_secret_versions (secret_id, version, encrypted_value, metadata_json, comment, created_by, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, CURRENT_TIMESTAMP)",
        params![id, new_version, encrypted_value, metadata_json, comment, updated_by],
    ).await.map_err(|e| DbError::Query(e.to_string()))?;
    Ok(())
}

pub async fn update_secret_meta(
    conn: &Connection,
    id: &str,
    description: Option<&str>,
    tags: Option<&str>,
    requires_approval: bool,
) -> Result<(), AppError> {
    conn.execute(
        r#"UPDATE vault_secrets SET 
           description = ?1,
           tags = ?2,
           requires_approval = ?3,
           updated_at = CURRENT_TIMESTAMP
           WHERE id = ?4"#,
        params![description, tags, requires_approval, id],
    )
    .await
    .map_err(|e| DbError::Query(e.to_string()))?;
    Ok(())
}

pub async fn delete_secret(conn: &Connection, id: &str) -> Result<(), AppError> {
    conn.execute("DELETE FROM vault_secrets WHERE id = ?1", params![id])
        .await
        .map_err(|e| DbError::Query(e.to_string()))?;
    Ok(())
}

pub async fn list_secret_versions(
    conn: &Connection,
    secret_id: &str,
) -> Result<Vec<VaultSecretVersionRow>, AppError> {
    let mut rows = conn
        .query(
            "SELECT id, secret_id, version, encrypted_value, metadata_json, comment, created_by, created_at \
             FROM vault_secret_versions WHERE secret_id = ?1 ORDER BY version DESC",
            params![secret_id],
        )
        .await
        .map_err(|e| DbError::Query(e.to_string()))?;

    let mut list = Vec::new();
    while let Some(row) = rows.next().await.map_err(|e| DbError::Query(e.to_string()))? {
        list.push(VaultSecretVersionRow {
            id: row.get(0).map_err(|e| DbError::Query(e.to_string()))?,
            secret_id: row.get(1).map_err(|e| DbError::Query(e.to_string()))?,
            version: row.get(2).map_err(|e| DbError::Query(e.to_string()))?,
            encrypted_value: row.get(3).map_err(|e| DbError::Query(e.to_string()))?,
            metadata_json: row.get(4).ok(),
            comment: row.get(5).ok(),
            created_by: row.get(6).ok(),
            created_at: row.get(7).unwrap_or_default(),
        });
    }
    Ok(list)
}

pub async fn get_secret_version(
    conn: &Connection,
    secret_id: &str,
    version: i64,
) -> Result<Option<VaultSecretVersionRow>, AppError> {
    let mut rows = conn
        .query(
            "SELECT id, secret_id, version, encrypted_value, metadata_json, comment, created_by, created_at \
             FROM vault_secret_versions WHERE secret_id = ?1 AND version = ?2",
            params![secret_id, version],
        )
        .await
        .map_err(|e| DbError::Query(e.to_string()))?;

    if let Some(row) = rows.next().await.map_err(|e| DbError::Query(e.to_string()))? {
        Ok(Some(VaultSecretVersionRow {
            id: row.get(0).map_err(|e| DbError::Query(e.to_string()))?,
            secret_id: row.get(1).map_err(|e| DbError::Query(e.to_string()))?,
            version: row.get(2).map_err(|e| DbError::Query(e.to_string()))?,
            encrypted_value: row.get(3).map_err(|e| DbError::Query(e.to_string()))?,
            metadata_json: row.get(4).ok(),
            comment: row.get(5).ok(),
            created_by: row.get(6).ok(),
            created_at: row.get(7).unwrap_or_default(),
        }))
    } else {
        Ok(None)
    }
}

pub async fn rollback_secret_version(
    conn: &Connection,
    secret_id: &str,
    target_version: i64,
) -> Result<i64, AppError> {
    let target = get_secret_version(conn, secret_id, target_version)
        .await?
        .ok_or_else(|| AppError::NotFound(format!("Version {target_version} not found")))?;

    let secret = get_secret(conn, secret_id)
        .await?
        .ok_or_else(|| AppError::NotFound(format!("Secret {secret_id} not found")))?;

    let next_v = secret.current_version + 1;
    let comment = format!("Rollback to version {target_version}");

    update_secret_value(
        conn,
        secret_id,
        next_v,
        &target.encrypted_value,
        target.metadata_json.as_deref(),
        Some(&comment),
        Some("system"),
    )
    .await?;

    Ok(next_v)
}

// PAM Access Request DB functions
pub async fn create_access_request(conn: &Connection, r: &VaultAccessRequestRow) -> Result<(), AppError> {
    conn.execute(
        r#"INSERT INTO vault_access_requests 
           (id, secret_id, environment, requester, justification, requested_duration_minutes, 
            status, created_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'pending', CURRENT_TIMESTAMP)"#,
        params![
            r.id.clone(),
            r.secret_id.clone(),
            r.environment.clone(),
            r.requester.clone(),
            r.justification.clone(),
            r.requested_duration_minutes
        ],
    )
    .await
    .map_err(|e| DbError::Query(e.to_string()))?;
    Ok(())
}

pub async fn list_access_requests(
    conn: &Connection,
    status: Option<&str>,
    requester: Option<&str>,
) -> Result<Vec<VaultAccessRequestRow>, AppError> {
    let mut sql = String::from(
        "SELECT id, secret_id, environment, requester, justification, requested_duration_minutes, \
         status, reviewed_by, reviewed_at, review_comment, access_granted_until, created_at \
         FROM vault_access_requests WHERE 1=1",
    );
    let mut p_vec: Vec<libsql::Value> = Vec::new();

    if let Some(s) = status {
        if !s.is_empty() && s != "all" {
            sql.push_str(" AND status = ?");
            p_vec.push(s.to_string().into());
        }
    }
    if let Some(req) = requester {
        if !req.is_empty() {
            sql.push_str(" AND requester = ?");
            p_vec.push(req.to_string().into());
        }
    }
    sql.push_str(" ORDER BY created_at DESC");

    let mut rows = conn
        .query(&sql, libsql::params_from_iter(p_vec))
        .await
        .map_err(|e| DbError::Query(e.to_string()))?;

    let mut list = Vec::new();
    while let Some(row) = rows.next().await.map_err(|e| DbError::Query(e.to_string()))? {
        list.push(parse_access_request_row(&row)?);
    }
    Ok(list)
}

pub async fn get_access_request(conn: &Connection, id: &str) -> Result<Option<VaultAccessRequestRow>, AppError> {
    let mut rows = conn
        .query(
            "SELECT id, secret_id, environment, requester, justification, requested_duration_minutes, \
             status, reviewed_by, reviewed_at, review_comment, access_granted_until, created_at \
             FROM vault_access_requests WHERE id = ?1",
            params![id],
        )
        .await
        .map_err(|e| DbError::Query(e.to_string()))?;

    if let Some(row) = rows.next().await.map_err(|e| DbError::Query(e.to_string()))? {
        Ok(Some(parse_access_request_row(&row)?))
    } else {
        Ok(None)
    }
}

pub async fn review_access_request(
    conn: &Connection,
    id: &str,
    status: &str,
    reviewer: &str,
    comment: Option<&str>,
    granted_until: Option<&str>,
) -> Result<(), AppError> {
    conn.execute(
        r#"UPDATE vault_access_requests SET 
           status = ?1,
           reviewed_by = ?2,
           reviewed_at = CURRENT_TIMESTAMP,
           review_comment = ?3,
           access_granted_until = ?4
           WHERE id = ?5"#,
        params![status, reviewer, comment, granted_until, id],
    )
    .await
    .map_err(|e| DbError::Query(e.to_string()))?;
    Ok(())
}

pub async fn check_active_pam_grant(
    conn: &Connection,
    requester: &str,
    secret_id: Option<&str>,
    environment: &str,
) -> Result<bool, AppError> {
    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let mut sql = String::from(
        "SELECT COUNT(*) FROM vault_access_requests \
         WHERE requester = ?1 AND status = 'approved' AND access_granted_until > ?2 \
         AND (environment = ?3 OR environment = 'all')",
    );
    let mut p_vec: Vec<libsql::Value> = vec![requester.to_string().into(), now.into(), environment.to_string().into()];

    if let Some(sid) = secret_id {
        sql.push_str(" AND (secret_id = ? OR secret_id IS NULL)");
        p_vec.push(sid.to_string().into());
    }

    let mut rows = conn
        .query(&sql, libsql::params_from_iter(p_vec))
        .await
        .map_err(|e| DbError::Query(e.to_string()))?;

    if let Some(row) = rows.next().await.map_err(|e| DbError::Query(e.to_string()))? {
        let count: i64 = row.get(0).unwrap_or(0);
        Ok(count > 0)
    } else {
        Ok(false)
    }
}

fn parse_secret_row(row: &libsql::Row) -> Result<VaultSecretRow, AppError> {
    Ok(VaultSecretRow {
        id: row.get(0).map_err(|e| DbError::Query(e.to_string()))?,
        name: row.get(1).map_err(|e| DbError::Query(e.to_string()))?,
        environment: row.get(2).map_err(|e| DbError::Query(e.to_string()))?,
        secret_type: row.get(3).map_err(|e| DbError::Query(e.to_string()))?,
        description: row.get(4).ok(),
        tags: row.get(5).ok(),
        current_version: row.get(6).map_err(|e| DbError::Query(e.to_string()))?,
        encrypted_value: row.get(7).map_err(|e| DbError::Query(e.to_string()))?,
        metadata_json: row.get(8).ok(),
        requires_approval: row.get::<i64>(9).unwrap_or(0) != 0,
        created_by: row.get(10).ok(),
        created_at: row.get(11).unwrap_or_default(),
        updated_at: row.get(12).unwrap_or_default(),
        project_id: row.get::<String>(13).unwrap_or_else(|_| "default".to_string()),
    })
}

fn parse_access_request_row(row: &libsql::Row) -> Result<VaultAccessRequestRow, AppError> {
    Ok(VaultAccessRequestRow {
        id: row.get(0).map_err(|e| DbError::Query(e.to_string()))?,
        secret_id: row.get(1).ok(),
        environment: row.get(2).map_err(|e| DbError::Query(e.to_string()))?,
        requester: row.get(3).map_err(|e| DbError::Query(e.to_string()))?,
        justification: row.get(4).map_err(|e| DbError::Query(e.to_string()))?,
        requested_duration_minutes: row.get(5).map_err(|e| DbError::Query(e.to_string()))?,
        status: row.get(6).map_err(|e| DbError::Query(e.to_string()))?,
        reviewed_by: row.get(7).ok(),
        reviewed_at: row.get(8).ok(),
        review_comment: row.get(9).ok(),
        access_granted_until: row.get(10).ok(),
        created_at: row.get(11).unwrap_or_default(),
    })
}
