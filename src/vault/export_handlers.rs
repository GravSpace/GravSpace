use crate::auth::middleware::AuthContext;
use crate::db;
use crate::error::AppError;
use crate::storage::FileStorage;
use crate::vault::crypto;
use axum::{
    extract::{Extension, Query, State},
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde::Deserialize;
use serde_json::json;
use std::collections::HashMap;

#[derive(Deserialize)]
pub struct ExportSecretsQuery {
    pub project: Option<String>,
    pub env: Option<String>,
    pub format: Option<String>,
    pub types: Option<String>,
    pub include_pam: Option<bool>,
}

fn escape_csv(val: &str) -> String {
    if val.contains(',') || val.contains('"') || val.contains('\n') || val.contains('\r') {
        format!("\"{}\"", val.replace('"', "\"\""))
    } else {
        val.to_string()
    }
}

pub async fn export_secrets(
    State(storage): State<FileStorage>,
    Extension(ctx): Extension<AuthContext>,
    Query(q): Query<ExportSecretsQuery>,
) -> Result<Response, AppError> {
    if let Some(ref audit) = storage.audit {
        audit
            .log(
                Some(&ctx.username),
                "vault:ExportSecrets",
                q.project.as_deref().unwrap_or("all"),
                "success",
                None,
                None,
                None,
            )
            .await;
    }
    let conn = storage.vault_conn()?;
    let project_filter = q.project.as_deref().filter(|p| *p != "all" && !p.is_empty());
    let env_filter = q.env.as_deref().filter(|e| *e != "all" && !e.is_empty());
    let format = q.format.unwrap_or_else(|| "dotenv".to_string()).to_lowercase();
    let include_pam = q.include_pam.unwrap_or(false);

    // Fetch secrets
    let secrets = db::vault::list_secrets(&conn, project_filter, env_filter, None, None).await?;

    // Filter by types if specified
    let type_filter = q.types.as_deref().unwrap_or("all");
    let allowed_types: Vec<&str> = if type_filter == "all" {
        Vec::new()
    } else {
        type_filter.split(',').map(|s| s.trim()).collect()
    };

    let filtered: Vec<_> = secrets
        .into_iter()
        .filter(|s| {
            if !include_pam && s.requires_approval {
                return false;
            }
            if !allowed_types.is_empty() && !allowed_types.contains(&s.secret_type.as_str()) {
                return false;
            }
            true
        })
        .collect();

    match format.as_str() {
        "json" => {
            let mut list = Vec::new();
            for s in filtered {
                let decrypted = crypto::decrypt_secret(&s.encrypted_value)
                    .ok()
                    .and_then(|b| String::from_utf8(b).ok())
                    .unwrap_or_default();

                let tags: Vec<String> = s
                    .tags
                    .as_deref()
                    .and_then(|t| serde_json::from_str(t).ok())
                    .unwrap_or_default();

                list.push(json!({
                    "id": s.id,
                    "name": s.name,
                    "environment": s.environment,
                    "secret_type": s.secret_type,
                    "description": s.description,
                    "tags": tags,
                    "current_version": s.current_version,
                    "value": decrypted,
                    "requires_approval": s.requires_approval,
                    "created_at": s.created_at,
                    "updated_at": s.updated_at,
                }));
            }

            let wrapper = json!({
                "vault_version": "1.0",
                "exported_at": chrono::Utc::now().to_rfc3339(),
                "environment": q.env.unwrap_or_else(|| "all".to_string()),
                "total_secrets": list.len(),
                "secrets": list,
            });

            Ok((
                StatusCode::OK,
                [("content-type", "application/json; charset=utf-8")],
                serde_json::to_string_pretty(&wrapper).unwrap_or_default(),
            )
                .into_response())
        }
        "csv" => {
            let mut csv = String::from("name,environment,secret_type,value,description,tags,requires_approval\n");
            for s in filtered {
                let decrypted = crypto::decrypt_secret(&s.encrypted_value)
                    .ok()
                    .and_then(|b| String::from_utf8(b).ok())
                    .unwrap_or_default();

                csv.push_str(&format!(
                    "{},{},{},{},{},{},{}\n",
                    escape_csv(&s.name),
                    escape_csv(&s.environment),
                    escape_csv(&s.secret_type),
                    escape_csv(&decrypted),
                    escape_csv(s.description.as_deref().unwrap_or("")),
                    escape_csv(s.tags.as_deref().unwrap_or("")),
                    s.requires_approval
                ));
            }

            Ok((
                StatusCode::OK,
                [("content-type", "text/csv; charset=utf-8")],
                csv,
            )
                .into_response())
        }
        _ => {
            // Default to .env format
            let target_env = q.env.unwrap_or_else(|| "development".to_string());
            let mut output = format!("# Exported from GravSpace Vault - Environment: {target_env}\n");
            output.push_str(&format!("# Exported at: {}\n\n", chrono::Utc::now().to_rfc3339()));

            let mut current_env_header = String::new();
            for s in filtered {
                if s.secret_type == "keystore" || s.secret_type == "file" {
                    continue;
                }
                if target_env == "all" && s.environment != current_env_header {
                    current_env_header = s.environment.clone();
                    output.push_str(&format!("\n# === Environment: {} ===\n", current_env_header));
                }

                if let Ok(bytes) = crypto::decrypt_secret(&s.encrypted_value) {
                    if let Ok(val) = String::from_utf8(bytes) {
                        let escaped = val.replace('\\', "\\\\").replace('"', "\\\"").replace('\n', "\\n");
                        output.push_str(&format!("{}=\"{}\"\n", s.name, escaped));
                    }
                }
            }

            Ok((
                StatusCode::OK,
                [("content-type", "text/plain; charset=utf-8")],
                output,
            )
                .into_response())
        }
    }
}

#[derive(Deserialize)]
pub struct ImportSecretsPayload {
    pub project_id: Option<String>,
    pub environment: String,
    pub raw_env: Option<String>,
    pub key_values: Option<HashMap<String, String>>,
}

pub async fn import_secrets(
    State(storage): State<FileStorage>,
    Extension(ctx): Extension<AuthContext>,
    Json(payload): Json<ImportSecretsPayload>,
) -> Result<Response, AppError> {
    let conn = storage.vault_conn()?;
    let mut imported = 0;
    let project_id = payload.project_id.unwrap_or_else(|| "default".to_string());

    let mut map = payload.key_values.unwrap_or_default();
    if let Some(raw) = payload.raw_env {
        for line in raw.lines() {
            let trimmed = line.trim();
            if trimmed.is_empty() || trimmed.starts_with('#') {
                continue;
            }
            if let Some((k, v)) = trimmed.split_once('=') {
                let key = k.trim().to_string();
                let val = v.trim().trim_matches('"').trim_matches('\'').to_string();
                if !key.is_empty() {
                    map.insert(key, val);
                }
            }
        }
    }

    for (k, v) in map {
        let encrypted = crypto::encrypt_secret(v.as_bytes())?;
        if let Ok(Some(existing)) =
            db::vault::get_secret_by_name(&conn, Some(&project_id), &payload.environment, &k).await
        {
            let next_v = existing.current_version + 1;
            let _ = db::vault::update_secret_value(
                &conn,
                &existing.id,
                next_v,
                &encrypted,
                None,
                Some("Bulk import update"),
                Some(&ctx.username),
            )
            .await;
        } else {
            let row = db::vault::VaultSecretRow {
                id: uuid::Uuid::new_v4().to_string(),
                project_id: project_id.clone(),
                name: k,
                environment: payload.environment.clone(),
                secret_type: "kv".to_string(),
                description: Some("Imported from .env".to_string()),
                tags: None,
                current_version: 1,
                encrypted_value: encrypted,
                metadata_json: None,
                requires_approval: false,
                created_by: Some(ctx.username.clone()),
                created_at: String::new(),
                updated_at: String::new(),
            };
            let _ = db::vault::create_secret(&conn, &row).await;
        }
        imported += 1;
    }

    if let Some(ref audit) = storage.audit {
        audit
            .log(
                Some(&ctx.username),
                "vault:ImportSecrets",
                &format!("{project_id}/{}", payload.environment),
                "success",
                None,
                None,
                Some(&format!("imported_count={imported}")),
            )
            .await;
    }

    Ok((StatusCode::OK, Json(json!({ "success": true, "imported_count": imported }))).into_response())
}
