use crate::auth::middleware::AuthContext;
use crate::db;
use crate::error::AppError;
use crate::storage::FileStorage;
use crate::vault::{crypto, pam};
use axum::{
    extract::{Extension, Path, Query, State},
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use chrono::Duration;
use serde::Deserialize;
use serde_json::json;

#[derive(Deserialize)]
pub struct ListSecretsQuery {
    pub project: Option<String>,
    pub env: Option<String>,
    pub r#type: Option<String>,
    pub q: Option<String>,
}

pub async fn list_secrets(
    State(storage): State<FileStorage>,
    Extension(ctx): Extension<AuthContext>,
    Query(q): Query<ListSecretsQuery>,
) -> Result<Response, AppError> {
    let conn = storage.vault_conn()?;
    let secrets = db::vault::list_secrets(
        &conn,
        q.project.as_deref(),
        q.env.as_deref(),
        q.r#type.as_deref(),
        q.q.as_deref(),
    )
    .await?;

    let mut result = Vec::new();
    for s in secrets {
        let has_grant =
            db::vault::check_active_pam_grant(&conn, &ctx.username, Some(&s.id), &s.environment)
                .await
                .unwrap_or(false);

        let tags_vec: Vec<String> = s
            .tags
            .as_deref()
            .map(|t| {
                serde_json::from_str::<Vec<String>>(t)
                    .unwrap_or_else(|_| t.split(',').map(|x| x.trim().to_string()).filter(|x| !x.is_empty()).collect())
            })
            .unwrap_or_default();

        let metadata_val: Option<serde_json::Value> = s
            .metadata_json
            .as_deref()
            .and_then(|m| serde_json::from_str(m).ok());

        result.push(json!({
            "id": s.id,
            "project_id": s.project_id,
            "name": s.name,
            "environment": s.environment,
            "secret_type": s.secret_type,
            "description": s.description,
            "tags": tags_vec,
            "current_version": s.current_version,
            "has_value": true,
            "value_masked": "••••••••••••••••",
            "requires_approval": s.requires_approval,
            "has_active_grant": has_grant,
            "metadata": metadata_val,
            "created_by": s.created_by,
            "created_at": s.created_at,
            "updated_at": s.updated_at,
        }));
    }

    Ok((StatusCode::OK, Json(result)).into_response())
}

#[derive(Deserialize)]
pub struct CreateSecretPayload {
    pub name: String,
    pub project_id: Option<String>,
    pub environment: Option<String>,
    pub secret_type: Option<String>,
    pub value: String,
    pub description: Option<String>,
    pub tags: Option<Vec<String>>,
    pub metadata: Option<serde_json::Value>,
    pub requires_approval: Option<bool>,
}

pub async fn create_secret(
    State(storage): State<FileStorage>,
    Extension(ctx): Extension<AuthContext>,
    Json(payload): Json<CreateSecretPayload>,
) -> Result<Response, AppError> {
    let conn = storage.vault_conn()?;
    let id = uuid::Uuid::new_v4().to_string();
    let project_id = payload.project_id.unwrap_or_else(|| "default".to_string());
    let env = payload.environment.unwrap_or_else(|| "development".to_string());
    let s_type = payload.secret_type.unwrap_or_else(|| "kv".to_string());

    // Check conflict within same project & environment
    if let Ok(Some(_)) = db::vault::get_secret_by_name(&conn, Some(&project_id), &env, &payload.name).await {
        return Err(AppError::BadRequest(format!(
            "Secret '{}' already exists in environment '{}' for this project",
            payload.name, env
        )));
    }

    let encrypted = crypto::encrypt_secret(payload.value.as_bytes())?;
    let tags_str = payload.tags.map(|t| serde_json::to_string(&t).unwrap_or_default());
    let meta_str = payload.metadata.map(|m| serde_json::to_string(&m).unwrap_or_default());

    let row = db::vault::VaultSecretRow {
        id: id.clone(),
        project_id,
        name: payload.name,
        environment: env,
        secret_type: s_type,
        description: payload.description,
        tags: tags_str,
        current_version: 1,
        encrypted_value: encrypted,
        metadata_json: meta_str,
        requires_approval: payload.requires_approval.unwrap_or(false),
        created_by: Some(ctx.username.clone()),
        created_at: String::new(),
        updated_at: String::new(),
    };

    db::vault::create_secret(&conn, &row).await?;
    Ok((StatusCode::CREATED, Json(json!({ "success": true, "id": id }))).into_response())
}

pub async fn reveal_secret(
    State(storage): State<FileStorage>,
    Extension(ctx): Extension<AuthContext>,
    Path(id): Path<String>,
) -> Result<Response, AppError> {
    let conn = storage.vault_conn()?;
    let secret = db::vault::get_secret(&conn, &id)
        .await?
        .ok_or_else(|| AppError::NotFound(format!("Secret {id} not found")))?;

    // PAM & Access Control Check
    let decision = pam::evaluate_reveal_access(&conn, &ctx.username, &secret).await?;
    match decision {
        pam::AccessDecision::Allowed => {
            let plaintext_bytes = crypto::decrypt_secret(&secret.encrypted_value)?;
            let plaintext = String::from_utf8(plaintext_bytes)
                .map_err(|_| AppError::Internal("Decrypted data is not valid UTF-8".to_string()))?;

            if let Some(ref audit) = storage.audit {
                audit
                    .log(
                        Some(&ctx.username),
                        "vault:RevealSecret",
                        &format!("{}/{}", secret.environment, secret.name),
                        "success",
                        None,
                        None,
                        None,
                    )
                    .await;
            }

            Ok((
                StatusCode::OK,
                Json(json!({
                    "id": secret.id,
                    "name": secret.name,
                    "value": plaintext,
                    "version": secret.current_version,
                })),
            )
                .into_response())
        }
        pam::AccessDecision::RequiresPamApproval { .. } => {
            Ok((StatusCode::FORBIDDEN, Json(decision)).into_response())
        }
        pam::AccessDecision::Denied { reason } => {
            Err(AppError::Forbidden(reason))
        }
    }
}

#[derive(Deserialize)]
pub struct UpdateSecretPayload {
    pub value: Option<String>,
    pub description: Option<String>,
    pub tags: Option<Vec<String>>,
    pub metadata: Option<serde_json::Value>,
    pub requires_approval: Option<bool>,
    pub comment: Option<String>,
}

pub async fn update_secret(
    State(storage): State<FileStorage>,
    Extension(ctx): Extension<AuthContext>,
    Path(id): Path<String>,
    Json(payload): Json<UpdateSecretPayload>,
) -> Result<Response, AppError> {
    let conn = storage.vault_conn()?;
    let secret = db::vault::get_secret(&conn, &id)
        .await?
        .ok_or_else(|| AppError::NotFound(format!("Secret {id} not found")))?;

    let meta_str = payload.metadata.as_ref().map(|m| serde_json::to_string(m).unwrap_or_default());
    let tags_str = payload.tags.as_ref().map(|t| serde_json::to_string(t).unwrap_or_default());

    // Update metadata/PAM settings
    if payload.description.is_some() || payload.tags.is_some() || payload.requires_approval.is_some() {
        let req_approval = payload.requires_approval.unwrap_or(secret.requires_approval);
        db::vault::update_secret_meta(
            &conn,
            &id,
            payload.description.as_deref().or(secret.description.as_deref()),
            tags_str.as_deref().or(secret.tags.as_deref()),
            req_approval,
        )
        .await?;
    }

    // Rotate value if new value provided
    if let Some(new_val) = payload.value {
        let encrypted = crypto::encrypt_secret(new_val.as_bytes())?;
        let next_v = secret.current_version + 1;
        db::vault::update_secret_value(
            &conn,
            &id,
            next_v,
            &encrypted,
            meta_str.as_deref(),
            payload.comment.as_deref(),
            Some(&ctx.username),
        )
        .await?;
        if let Some(ref audit) = storage.audit {
            audit
                .log(
                    Some(&ctx.username),
                    "vault:RotateSecret",
                    &format!("{}/{}", secret.environment, secret.name),
                    "success",
                    None,
                    None,
                    None,
                )
                .await;
        }
    }

    Ok((StatusCode::OK, Json(json!({ "success": true }))).into_response())
}

pub async fn delete_secret(
    State(storage): State<FileStorage>,
    Path(id): Path<String>,
) -> Result<Response, AppError> {
    let conn = storage.vault_conn()?;
    db::vault::delete_secret(&conn, &id).await?;
    Ok((StatusCode::OK, Json(json!({ "success": true }))).into_response())
}

pub async fn list_versions(
    State(storage): State<FileStorage>,
    Path(id): Path<String>,
) -> Result<Response, AppError> {
    let conn = storage.vault_conn()?;
    let versions = db::vault::list_secret_versions(&conn, &id).await?;
    let list: Vec<serde_json::Value> = versions
        .into_iter()
        .map(|v| {
            json!({
                "version": v.version,
                "comment": v.comment,
                "created_by": v.created_by,
                "created_at": v.created_at,
            })
        })
        .collect();
    Ok((StatusCode::OK, Json(list)).into_response())
}

#[derive(Deserialize)]
pub struct RollbackPayload {
    pub target_version: i64,
}

pub async fn rollback_version(
    State(storage): State<FileStorage>,
    Path(id): Path<String>,
    Json(payload): Json<RollbackPayload>,
) -> Result<Response, AppError> {
    let conn = storage.vault_conn()?;
    let next_v = db::vault::rollback_secret_version(&conn, &id, payload.target_version).await?;
    Ok((StatusCode::OK, Json(json!({ "success": true, "current_version": next_v }))).into_response())
}

// PAM Access Request Handlers
#[derive(Deserialize)]
pub struct CreateAccessRequestPayload {
    pub secret_id: Option<String>,
    pub environment: String,
    pub justification: String,
    pub requested_duration_minutes: Option<i64>,
}

pub async fn create_access_request(
    State(storage): State<FileStorage>,
    Extension(ctx): Extension<AuthContext>,
    Json(payload): Json<CreateAccessRequestPayload>,
) -> Result<Response, AppError> {
    let conn = storage.vault_conn()?;
    let id = uuid::Uuid::new_v4().to_string();
    let row = db::vault::VaultAccessRequestRow {
        id: id.clone(),
        secret_id: payload.secret_id,
        environment: payload.environment,
        requester: ctx.username,
        justification: payload.justification,
        requested_duration_minutes: payload.requested_duration_minutes.unwrap_or(60),
        status: "pending".to_string(),
        reviewed_by: None,
        reviewed_at: None,
        review_comment: None,
        access_granted_until: None,
        created_at: String::new(),
    };
    db::vault::create_access_request(&conn, &row).await?;
    Ok((StatusCode::CREATED, Json(json!({ "success": true, "id": id }))).into_response())
}

#[derive(Deserialize)]
pub struct ListAccessRequestsQuery {
    pub status: Option<String>,
    pub requester: Option<String>,
}

pub async fn list_access_requests(
    State(storage): State<FileStorage>,
    Query(q): Query<ListAccessRequestsQuery>,
) -> Result<Response, AppError> {
    let conn = storage.vault_conn()?;
    let requests = db::vault::list_access_requests(&conn, q.status.as_deref(), q.requester.as_deref()).await?;
    
    // Enrich with secret name if available
    let mut list = Vec::new();
    for r in requests {
        let s_name = if let Some(ref sid) = r.secret_id {
            db::vault::get_secret(&conn, sid).await.ok().flatten().map(|s| s.name)
        } else {
            None
        };
        list.push(json!({
            "id": r.id,
            "secret_id": r.secret_id,
            "secret_name": s_name,
            "environment": r.environment,
            "requester": r.requester,
            "justification": r.justification,
            "requested_duration_minutes": r.requested_duration_minutes,
            "status": r.status,
            "reviewed_by": r.reviewed_by,
            "reviewed_at": r.reviewed_at,
            "review_comment": r.review_comment,
            "access_granted_until": r.access_granted_until,
            "created_at": r.created_at,
        }));
    }
    Ok((StatusCode::OK, Json(list)).into_response())
}

#[derive(Deserialize)]
pub struct ReviewAccessRequestPayload {
    pub comment: Option<String>,
    pub duration_minutes: Option<i64>,
}

pub async fn approve_access_request(
    State(storage): State<FileStorage>,
    Extension(ctx): Extension<AuthContext>,
    Path(id): Path<String>,
    Json(payload): Json<ReviewAccessRequestPayload>,
) -> Result<Response, AppError> {
    let conn = storage.vault_conn()?;
    let req = db::vault::get_access_request(&conn, &id)
        .await?
        .ok_or_else(|| AppError::NotFound(format!("Request {id} not found")))?;

    let duration_mins = payload.duration_minutes.unwrap_or(req.requested_duration_minutes);
    let granted_until = chrono::Utc::now() + Duration::minutes(duration_mins);
    let granted_str = granted_until.format("%Y-%m-%d %H:%M:%S").to_string();

    db::vault::review_access_request(
        &conn,
        &id,
        "approved",
        &ctx.username,
        payload.comment.as_deref(),
        Some(&granted_str),
    )
    .await?;

    if let Some(ref audit) = storage.audit {
        audit
            .log(
                Some(&ctx.username),
                "vault:ApproveAccess",
                &id,
                "success",
                None,
                None,
                None,
            )
            .await;
    }

    Ok((StatusCode::OK, Json(json!({ "success": true, "access_granted_until": granted_str }))).into_response())
}

pub async fn reject_access_request(
    State(storage): State<FileStorage>,
    Extension(ctx): Extension<AuthContext>,
    Path(id): Path<String>,
    Json(payload): Json<ReviewAccessRequestPayload>,
) -> Result<Response, AppError> {
    let conn = storage.vault_conn()?;
    db::vault::review_access_request(
        &conn,
        &id,
        "rejected",
        &ctx.username,
        payload.comment.as_deref(),
        None,
    )
    .await?;
    if let Some(ref audit) = storage.audit {
        audit
            .log(
                Some(&ctx.username),
                "vault:RejectAccess",
                &id,
                "success",
                None,
                None,
                None,
            )
            .await;
    }
    Ok((StatusCode::OK, Json(json!({ "success": true }))).into_response())
}

pub use super::export_handlers::import_secrets;
