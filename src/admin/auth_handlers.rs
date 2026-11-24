use crate::auth::jwt::create_jwt;
use crate::db;
use crate::error::{AppError, AuthError};
use crate::storage::FileStorage;
use axum::{
    extract::State,
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde::{Deserialize, Serialize};

#[derive(Deserialize)]
pub struct LoginPayload {
    pub username: String,
    pub password: String,
}

#[derive(Serialize)]
pub struct LoginResponse {
    pub token: String,
    pub username: String,
    pub is_default_password: bool,
}

pub async fn login_handler(
    State(storage): State<FileStorage>,
    Json(payload): Json<LoginPayload>,
) -> Result<Response, AppError> {
    let conn = storage.db.conn()?;
    let identifier = payload.username.trim();
    let secret = payload.password.trim();

    // 1. Try matching by Access Key ID (Go parity: um.Authenticate)
    if let Ok(Some(key_rec)) = db::users::get_access_key(&conn, identifier).await {
        if key_rec.secret_access_key == secret {
            let token = create_jwt(&key_rec.username, &storage.config.jwt_secret)?;
            return Ok((
                StatusCode::OK,
                Json(LoginResponse {
                    token,
                    username: key_rec.username,
                    is_default_password: false,
                }),
            )
                .into_response());
        }
    }

    // 2. Try matching by Username (including "root" as alias for "admin")
    let username = if identifier == "root" { "admin" } else { identifier };
    let user_rec = db::users::get_user(&conn, username)
        .await?
        .ok_or(AuthError::InvalidCredentials)?;

    let default_pass = storage
        .config
        .initial_admin_password
        .as_deref()
        .unwrap_or("admin");

    let is_valid = if let Some(hash) = &user_rec.password_hash {
        bcrypt::verify(secret, hash).unwrap_or(false)
    } else {
        false
    };

    if !is_valid {
        return Err(AuthError::InvalidCredentials.into());
    }

    let token = create_jwt(username, &storage.config.jwt_secret)?;
    let is_default_password = username == "admin" && secret == default_pass;

    Ok((
        StatusCode::OK,
        Json(LoginResponse {
            token,
            username: username.to_string(),
            is_default_password,
        }),
    )
        .into_response())
}

#[derive(Deserialize)]
pub struct VerifyPasswordPayload {
    pub password: String,
}

pub async fn verify_admin_password(
    State(storage): State<FileStorage>,
    Json(payload): Json<VerifyPasswordPayload>,
) -> Result<Response, AppError> {
    let conn = storage.db.conn()?;
    let user_rec = db::users::get_user(&conn, "admin")
        .await?
        .ok_or(AuthError::InvalidCredentials)?;

    let is_valid = if let Some(hash) = &user_rec.password_hash {
        bcrypt::verify(&payload.password, hash).unwrap_or(false)
    } else {
        false
    };

    if is_valid {
        Ok(StatusCode::OK.into_response())
    } else {
        Err(AuthError::InvalidCredentials.into())
    }
}
