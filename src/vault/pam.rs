use crate::db;
use crate::error::AppError;
use libsql::Connection;
use serde::Serialize;

#[derive(Debug, Serialize)]
#[serde(tag = "status")]
pub enum AccessDecision {
    #[serde(rename = "allowed")]
    Allowed,
    #[serde(rename = "requires_pam_approval")]
    RequiresPamApproval {
        secret_id: String,
        secret_name: String,
        environment: String,
        message: String,
    },
    #[serde(rename = "denied")]
    Denied { reason: String },
}

pub async fn evaluate_reveal_access(
    conn: &Connection,
    username: &str,
    secret: &db::vault::VaultSecretRow,
) -> Result<AccessDecision, AppError> {
    // 1. Check if user has an active, approved PAM grant
    let has_grant = db::vault::check_active_pam_grant(
        conn,
        username,
        Some(&secret.id),
        &secret.environment,
    )
    .await?;

    if has_grant {
        return Ok(AccessDecision::Allowed);
    }

    // 2. If secret strictly requires PAM approval (Dual Control / Four-Eyes Principle)
    if secret.requires_approval {
        return Ok(AccessDecision::RequiresPamApproval {
            secret_id: secret.id.clone(),
            secret_name: secret.name.clone(),
            environment: secret.environment.clone(),
            message: format!(
                "Secret '{}' in environment '{}' is PAM protected and requires an approved access request.",
                secret.name, secret.environment
            ),
        });
    }

    // 3. Admin user has default reveal rights if approval flag is not set
    if username == "admin" {
        return Ok(AccessDecision::Allowed);
    }

    // 4. Non-admin users without explicit approval
    Ok(AccessDecision::RequiresPamApproval {
        secret_id: secret.id.clone(),
        secret_name: secret.name.clone(),
        environment: secret.environment.clone(),
        message: "You need to request Just-In-Time access elevation to reveal this secret.".to_string(),
    })
}
