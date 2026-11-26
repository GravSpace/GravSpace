use crate::auth::jwt::verify_jwt;
use crate::config::Config;
use crate::error::{AppError, AuthError};
use axum::{
    extract::{Request, State},
    http::{header, HeaderMap},
    middleware::Next,
    response::Response,
};
use std::collections::HashMap;
use std::sync::Arc;

pub use super::s3_auth::verify_s3_http;

pub(crate) fn extract_cookie(headers: &HeaderMap, cookie_name: &str) -> Option<String> {
    for val in headers.get_all(header::COOKIE) {
        if let Ok(raw) = val.to_str() {
            for pair in raw.split(';') {
                if let Some((k, v)) = pair.trim().split_once('=') {
                    if k.trim() == cookie_name {
                        let trimmed = v.trim();
                        if !trimmed.is_empty() {
                            return Some(trimmed.to_string());
                        }
                    }
                }
            }
        }
    }
    None
}

pub(crate) fn extract_client_ip(headers: &HeaderMap) -> Option<String> {
    if let Some(xff) = headers.get("x-forwarded-for").and_then(|v| v.to_str().ok()) {
        if let Some(first) = xff.split(',').next() {
            let trimmed = first.trim();
            if !trimmed.is_empty() {
                return Some(trimmed.to_string());
            }
        }
    }
    if let Some(real_ip) = headers.get("x-real-ip").and_then(|v| v.to_str().ok()) {
        let trimmed = real_ip.trim();
        if !trimmed.is_empty() {
            return Some(trimmed.to_string());
        }
    }
    None
}

#[derive(Clone)]
pub struct AuthContext {
    pub username: String,
    pub is_admin: bool,
}

pub async fn admin_jwt_middleware(
    State(config): State<Arc<Config>>,
    mut request: Request,
    next: Next,
) -> Result<Response, AppError> {
    let headers = request.headers();
    let auth_header = headers
        .get("Authorization")
        .and_then(|h| h.to_str().ok())
        .map(|s| s.to_string());

    let token_str = if let Some(h) = auth_header {
        h.strip_prefix("Bearer ")
            .map(|s| s.to_string())
            .unwrap_or(h)
    } else if let Some(cookie_tok) = extract_cookie(headers, "gravspace_session") {
        cookie_tok
    } else {
        let uri = request.uri();
        let query: HashMap<String, String> = uri
            .query()
            .map(|q| {
                q.split('&')
                    .filter_map(|pair| pair.split_once('='))
                    .map(|(k, v)| (k.to_string(), v.to_string()))
                    .collect()
            })
            .unwrap_or_default();
        query.get("token").cloned().unwrap_or_default()
    };

    if token_str.is_empty() {
        return Err(AuthError::TokenInvalid.into());
    }

    let username = verify_jwt(&token_str, &config.jwt_secret)?;
    let is_admin = username == "admin";

    request.extensions_mut().insert(AuthContext {
        username,
        is_admin,
    });

    Ok(next.run(request).await)
}

pub async fn admin_only_middleware(
    request: Request,
    next: Next,
) -> Result<Response, AppError> {
    if let Some(ctx) = request.extensions().get::<AuthContext>() {
        if ctx.is_admin {
            return Ok(next.run(request).await);
        }
    }
    Err(AppError::Forbidden("Administrator access required".to_string()))
}
