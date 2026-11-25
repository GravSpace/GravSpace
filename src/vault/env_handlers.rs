use crate::db;
use crate::error::AppError;
use crate::storage::FileStorage;
use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde::Deserialize;
use serde_json::json;

#[derive(Deserialize, Default)]
pub struct ListEnvQuery {
    pub project: Option<String>,
}

#[derive(Deserialize)]
pub struct CreateEnvironmentPayload {
    pub name: String,
    pub slug: Option<String>,
    pub color: Option<String>,
    pub description: Option<String>,
    pub position: Option<i64>,
}

#[derive(Deserialize)]
pub struct UpdateEnvironmentPayload {
    pub name: String,
    pub color: String,
    pub description: Option<String>,
    pub position: Option<i64>,
}

fn slugify(text: &str) -> String {
    text.to_lowercase()
        .chars()
        .map(|c| if c.is_alphanumeric() { c } else { '-' })
        .collect::<String>()
        .split('-')
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join("-")
}

pub async fn list_environments(
    Query(q): Query<ListEnvQuery>,
    State(storage): State<FileStorage>,
) -> Result<Response, AppError> {
    let conn = storage.db.conn()?;
    let envs = db::vault_env::list_environments(&conn, q.project.as_deref()).await?;
    Ok((StatusCode::OK, Json(envs)).into_response())
}

pub async fn create_environment(
    State(storage): State<FileStorage>,
    Json(payload): Json<CreateEnvironmentPayload>,
) -> Result<Response, AppError> {
    if payload.name.trim().is_empty() {
        return Err(AppError::BadRequest("Environment name cannot be empty".to_string()));
    }

    let slug = payload
        .slug
        .map(|s| slugify(&s))
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| slugify(&payload.name));

    if slug.is_empty() {
        return Err(AppError::BadRequest("Invalid environment slug".to_string()));
    }

    let conn = storage.db.conn()?;
    if let Ok(Some(_)) = db::vault_env::get_environment(&conn, &slug).await {
        return Err(AppError::BadRequest(format!(
            "Environment with slug '{slug}' already exists"
        )));
    }

    let id = format!("env_{}", &uuid::Uuid::new_v4().to_string()[..8]);
    let color = payload.color.unwrap_or_else(|| "sky".to_string());
    let position = payload.position.unwrap_or(0);

    let env = db::vault_env::VaultEnvironment {
        id: id.clone(),
        slug: slug.clone(),
        name: payload.name.trim().to_string(),
        color,
        description: payload.description,
        position,
        created_at: String::new(),
    };

    db::vault_env::create_environment(&conn, &env).await?;

    Ok((
        StatusCode::CREATED,
        Json(json!({
            "success": true,
            "id": id,
            "slug": slug,
        })),
    )
        .into_response())
}

pub async fn update_environment(
    State(storage): State<FileStorage>,
    Path(id): Path<String>,
    Json(payload): Json<UpdateEnvironmentPayload>,
) -> Result<Response, AppError> {
    if payload.name.trim().is_empty() {
        return Err(AppError::BadRequest("Environment name cannot be empty".to_string()));
    }

    let conn = storage.db.conn()?;
    let updated = db::vault_env::update_environment(
        &conn,
        &id,
        payload.name.trim(),
        &payload.color,
        payload.description.as_deref(),
        payload.position.unwrap_or(0),
    )
    .await?;

    if !updated {
        return Err(AppError::NotFound(format!("Environment '{id}' not found")));
    }

    Ok((StatusCode::OK, Json(json!({ "success": true }))).into_response())
}

pub async fn delete_environment(
    State(storage): State<FileStorage>,
    Path(id): Path<String>,
) -> Result<Response, AppError> {
    let conn = storage.db.conn()?;
    
    // Prevent deletion of system default environments
    if id == "env_dev" || id == "env_staging" || id == "env_prod" || id == "development" || id == "production" {
        return Err(AppError::BadRequest("System default environments cannot be deleted".to_string()));
    }

    let deleted = db::vault_env::delete_environment(&conn, &id).await?;
    if !deleted {
        return Err(AppError::NotFound(format!("Environment '{id}' not found")));
    }

    Ok((StatusCode::OK, Json(json!({ "success": true }))).into_response())
}
