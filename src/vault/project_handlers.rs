use crate::db;
use crate::error::AppError;
use crate::storage::FileStorage;
use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde::Deserialize;
use serde_json::json;

#[derive(Deserialize)]
pub struct CreateProjectPayload {
    pub name: String,
    pub slug: Option<String>,
    pub description: Option<String>,
    pub color: Option<String>,
    pub icon: Option<String>,
}

#[derive(Deserialize)]
pub struct UpdateProjectPayload {
    pub name: String,
    pub description: Option<String>,
    pub color: String,
    pub icon: String,
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

pub async fn list_projects(
    State(storage): State<FileStorage>,
) -> Result<Response, AppError> {
    let conn = storage.db.conn()?;
    let projs = db::vault_project::list_projects(&conn).await?;
    Ok((StatusCode::OK, Json(projs)).into_response())
}

pub async fn create_project(
    State(storage): State<FileStorage>,
    Json(payload): Json<CreateProjectPayload>,
) -> Result<Response, AppError> {
    if payload.name.trim().is_empty() {
        return Err(AppError::BadRequest("Project name cannot be empty".to_string()));
    }

    let slug = payload
        .slug
        .map(|s| slugify(&s))
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| slugify(&payload.name));

    if slug.is_empty() {
        return Err(AppError::BadRequest("Invalid project slug".to_string()));
    }

    let conn = storage.db.conn()?;
    if let Ok(Some(_)) = db::vault_project::get_project(&conn, &slug).await {
        return Err(AppError::BadRequest(format!(
            "Project with identifier '{slug}' already exists"
        )));
    }

    let id = format!("proj_{}", &uuid::Uuid::new_v4().to_string().replace('-', "")[..8]);
    let color = payload.color.unwrap_or_else(|| "indigo".to_string());
    let icon = payload.icon.unwrap_or_else(|| "folder".to_string());

    let proj = db::vault_project::VaultProject {
        id: id.clone(),
        slug: slug.clone(),
        name: payload.name.trim().to_string(),
        description: payload.description,
        color,
        icon,
        created_at: String::new(),
        updated_at: String::new(),
    };

    db::vault_project::create_project(&conn, &proj).await?;

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

pub async fn update_project(
    State(storage): State<FileStorage>,
    Path(id): Path<String>,
    Json(payload): Json<UpdateProjectPayload>,
) -> Result<Response, AppError> {
    if payload.name.trim().is_empty() {
        return Err(AppError::BadRequest("Project name cannot be empty".to_string()));
    }

    let conn = storage.db.conn()?;
    db::vault_project::update_project(
        &conn,
        &id,
        payload.name.trim(),
        payload.description.as_deref(),
        &payload.color,
        &payload.icon,
    )
    .await?;

    Ok((StatusCode::OK, Json(json!({ "success": true }))).into_response())
}

pub async fn delete_project(
    State(storage): State<FileStorage>,
    Path(id): Path<String>,
) -> Result<Response, AppError> {
    let conn = storage.db.conn()?;
    db::vault_project::delete_project(&conn, &id).await?;
    Ok((StatusCode::OK, Json(json!({ "success": true }))).into_response())
}
