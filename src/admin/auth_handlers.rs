use crate::auth::jwt::create_jwt;
use crate::auth::middleware::{extract_client_ip, AuthContext};
use crate::db;
use crate::error::{AppError, AuthError};
use crate::storage::FileStorage;
use axum::{
    extract::{Extension, State},
    http::{header, HeaderMap, HeaderValue, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use moka::future::Cache;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::sync::OnceLock;
use std::time::{Duration, Instant};

const SESSION_COOKIE_NAME: &str = "gravspace_session";
const SESSION_MAX_AGE_SECS: i64 = 72 * 3600;
const MAX_LOGIN_FAILURES: u32 = 10;
const LOGIN_WINDOW: Duration = Duration::from_secs(300);

#[derive(Clone, Copy)]
struct FailureEntry {
    count: u32,
    window_start: Instant,
}

fn login_failures() -> &'static Cache<String, FailureEntry> {
    static CACHE: OnceLock<Cache<String, FailureEntry>> = OnceLock::new();
    CACHE.get_or_init(|| {
        Cache::builder()
            .max_capacity(4096)
            .time_to_live(LOGIN_WINDOW)
            .build()
    })
}

fn is_https_request(headers: &HeaderMap) -> bool {
    headers
        .get("x-forwarded-proto")
        .and_then(|v| v.to_str().ok())
        .is_some_and(|p| p.eq_ignore_ascii_case("https"))
        || headers
            .get(header::ORIGIN)
            .and_then(|v| v.to_str().ok())
            .is_some_and(|o| o.starts_with("https://"))
}

fn build_session_cookie(token: &str, max_age_secs: i64, secure: bool) -> String {
    let secure_attr = if secure { "; Secure" } else { "" };
    format!(
        "{SESSION_COOKIE_NAME}={token}; HttpOnly; SameSite=Lax; Path=/; Max-Age={max_age_secs}{secure_attr}"
    )
}

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

async fn check_login_rate_limit(rate_key: &str) -> Result<(), AppError> {
    if let Some(entry) = login_failures().get(rate_key).await {
        if entry.window_start.elapsed() <= LOGIN_WINDOW && entry.count >= MAX_LOGIN_FAILURES {
            return Err(AppError::TooManyRequests(
                "Too many failed login attempts. Please wait 5 minutes before retrying."
                    .to_string(),
            ));
        }
    }
    Ok(())
}

async fn record_login_failure(rate_key: &str) {
    let now = Instant::now();
    let updated = match login_failures().get(rate_key).await {
        Some(prev) if prev.window_start.elapsed() <= LOGIN_WINDOW => FailureEntry {
            count: prev.count.saturating_add(1),
            window_start: prev.window_start,
        },
        _ => FailureEntry {
            count: 1,
            window_start: now,
        },
    };
    login_failures().insert(rate_key.to_string(), updated).await;
}

pub async fn login_handler(
    State(storage): State<FileStorage>,
    headers: HeaderMap,
    Json(payload): Json<LoginPayload>,
) -> Result<Response, AppError> {
    let conn = storage.db.conn()?;
    let identifier = payload.username.trim();
    let secret = payload.password.trim();
    let client_ip = extract_client_ip(&headers).unwrap_or_else(|| "local".to_string());
    let rate_key = format!("{client_ip}:{identifier}");
    check_login_rate_limit(&rate_key).await?;

    let secure_cookie = is_https_request(&headers);

    // 1. Try matching by Access Key ID (Go parity: um.Authenticate)
    if let Ok(Some(key_rec)) = db::users::get_access_key(&conn, identifier).await {
        if key_rec.secret_access_key == secret {
            login_failures().invalidate(&rate_key).await;
            let token = create_jwt(&key_rec.username, &storage.config.jwt_secret)?;
            let mut resp = (
                StatusCode::OK,
                Json(LoginResponse {
                    token: token.clone(),
                    username: key_rec.username,
                    is_default_password: false,
                }),
            )
                .into_response();
            if let Ok(hv) = HeaderValue::from_str(&build_session_cookie(
                &token,
                SESSION_MAX_AGE_SECS,
                secure_cookie,
            )) {
                resp.headers_mut().insert(header::SET_COOKIE, hv);
            }
            return Ok(resp);
        }
    }

    // 2. Try matching by Username (including "root" as alias for "admin")
    let username = if identifier == "root" { "admin" } else { identifier };
    let user_rec = match db::users::get_user(&conn, username).await? {
        Some(rec) => rec,
        None => {
            record_login_failure(&rate_key).await;
            return Err(AuthError::InvalidCredentials.into());
        }
    };

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
        record_login_failure(&rate_key).await;
        return Err(AuthError::InvalidCredentials.into());
    }

    login_failures().invalidate(&rate_key).await;
    let token = create_jwt(username, &storage.config.jwt_secret)?;
    let is_default_password = username == "admin" && secret == default_pass;

    let mut resp = (
        StatusCode::OK,
        Json(LoginResponse {
            token: token.clone(),
            username: username.to_string(),
            is_default_password,
        }),
    )
        .into_response();
    if let Ok(hv) = HeaderValue::from_str(&build_session_cookie(
        &token,
        SESSION_MAX_AGE_SECS,
        secure_cookie,
    )) {
        resp.headers_mut().insert(header::SET_COOKIE, hv);
    }
    Ok(resp)
}

pub async fn logout_handler(headers: HeaderMap) -> Response {
    let mut resp = (StatusCode::OK, Json(json!({ "success": true }))).into_response();
    if let Ok(hv) = HeaderValue::from_str(&build_session_cookie(
        "",
        0,
        is_https_request(&headers),
    )) {
        resp.headers_mut().insert(header::SET_COOKIE, hv);
    }
    resp
}

pub async fn session_handler(Extension(ctx): Extension<AuthContext>) -> Response {
    (
        StatusCode::OK,
        Json(json!({
            "authenticated": true,
            "username": ctx.username,
            "is_admin": ctx.is_admin,
        })),
    )
        .into_response()
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
