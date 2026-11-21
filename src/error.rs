use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde_json::json;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum AppError {
    #[error("Storage error: {0}")]
    Storage(#[from] StorageError),

    #[error("Auth error: {0}")]
    Auth(#[from] AuthError),

    #[error("Database error: {0}")]
    Db(#[from] DbError),

    #[error("Not found: {0}")]
    NotFound(String),

    #[error("Bad request: {0}")]
    BadRequest(String),

    #[error("Unauthorized: {0}")]
    Unauthorized(String),

    #[error("Forbidden: {0}")]
    Forbidden(String),

    #[error("Internal server error: {0}")]
    Internal(String),
}

#[derive(Error, Debug)]
pub enum StorageError {
    #[error("Bucket not found: {0}")]
    BucketNotFound(String),

    #[error("Object not found: {0}")]
    ObjectNotFound(String),

    #[error("Bucket already exists: {0}")]
    BucketAlreadyExists(String),

    #[error("Object is locked by retention or legal hold: {0}")]
    ObjectLocked(String),

    #[error("Bucket quota exceeded: {0}")]
    QuotaExceeded(String),

    #[error("Invalid byte range requested")]
    InvalidRange,

    #[error("IO error: {0}")]
    Io(String),
}

#[derive(Error, Debug)]
pub enum AuthError {
    #[error("Invalid username or password")]
    InvalidCredentials,

    #[error("Signature does not match")]
    SignatureMismatch,

    #[error("Request has expired")]
    RequestExpired,

    #[error("Invalid token")]
    TokenInvalid,

    #[error("Access denied")]
    AccessDenied,

    #[error("Malformed authorization header: {0}")]
    MalformedHeader(String),
}

#[derive(Error, Debug)]
pub enum DbError {
    #[error("Database query failed: {0}")]
    Query(String),

    #[error("Record not found")]
    NotFound,
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, message) = match self {
            AppError::NotFound(msg) => (StatusCode::NOT_FOUND, msg),
            AppError::BadRequest(msg) => (StatusCode::BAD_REQUEST, msg),
            AppError::Unauthorized(msg) => (StatusCode::UNAUTHORIZED, msg),
            AppError::Forbidden(msg) => (StatusCode::FORBIDDEN, msg),
            AppError::Storage(StorageError::BucketNotFound(b)) => {
                (StatusCode::NOT_FOUND, format!("Bucket '{b}' not found"))
            }
            AppError::Storage(StorageError::ObjectNotFound(k)) => {
                (StatusCode::NOT_FOUND, format!("Object '{k}' not found"))
            }
            AppError::Storage(StorageError::BucketAlreadyExists(b)) => (
                StatusCode::CONFLICT,
                format!("Bucket '{b}' already exists"),
            ),
            AppError::Storage(StorageError::ObjectLocked(msg)) => (StatusCode::FORBIDDEN, msg),
            AppError::Storage(StorageError::QuotaExceeded(msg)) => {
                (StatusCode::PAYLOAD_TOO_LARGE, msg)
            }
            AppError::Storage(StorageError::InvalidRange) => (
                StatusCode::RANGE_NOT_SATISFIABLE,
                "Invalid range requested".to_string(),
            ),
            AppError::Auth(AuthError::InvalidCredentials) => (
                StatusCode::UNAUTHORIZED,
                "Invalid credentials".to_string(),
            ),
            AppError::Auth(AuthError::SignatureMismatch) => (
                StatusCode::FORBIDDEN,
                "Signature does not match".to_string(),
            ),
            AppError::Auth(AuthError::RequestExpired) => {
                (StatusCode::FORBIDDEN, "Request has expired".to_string())
            }
            AppError::Auth(AuthError::AccessDenied) => {
                (StatusCode::FORBIDDEN, "Access denied".to_string())
            }
            AppError::Auth(AuthError::TokenInvalid) => {
                (StatusCode::UNAUTHORIZED, "Invalid token".to_string())
            }
            AppError::Auth(AuthError::MalformedHeader(msg)) => (StatusCode::BAD_REQUEST, msg),
            AppError::Db(DbError::NotFound) => (StatusCode::NOT_FOUND, "Record not found".to_string()),
            AppError::Storage(StorageError::Io(ref msg))
            | AppError::Db(DbError::Query(ref msg))
            | AppError::Internal(ref msg) => {
                tracing::error!("Internal server error (500): {msg}");
                (StatusCode::INTERNAL_SERVER_ERROR, msg.clone())
            }
        };

        (status, Json(json!({ "error": message }))).into_response()
    }
}
