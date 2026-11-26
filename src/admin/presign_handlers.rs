use crate::auth::signature::{calculate_signature, sha256_hex, uri_encode};
use crate::db;
use crate::error::AppError;
use crate::storage::FileStorage;
use axum::{
    extract::{Path, Query, State},
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use chrono::Utc;
use serde::Deserialize;
use serde_json::json;

pub async fn list_presigned_urls(
    State(storage): State<FileStorage>,
) -> Result<Response, AppError> {
    let conn = storage.db.conn()?;
    let urls = db::presign::list_presigned_urls(&conn).await?;
    Ok((StatusCode::OK, Json(urls)).into_response())
}

#[derive(Deserialize)]
pub struct RevokePresignQuery {
    pub signature: Option<String>,
    pub id: Option<i64>,
}

pub async fn revoke_presigned_url(
    State(storage): State<FileStorage>,
    Query(query): Query<RevokePresignQuery>,
) -> Result<Response, AppError> {
    let conn = storage.db.conn()?;
    if let Some(id) = query.id {
        db::presign::revoke_presigned_url_by_id(&conn, id).await?;
    } else if let Some(ref sig) = query.signature {
        db::presign::revoke_presigned_url(&conn, sig).await?;
    }
    Ok((StatusCode::OK, Json(json!({ "success": true }))).into_response())
}

pub async fn revoke_presigned_url_by_path(
    State(storage): State<FileStorage>,
    Path(id): Path<i64>,
) -> Result<Response, AppError> {
    let conn = storage.db.conn()?;
    db::presign::revoke_presigned_url_by_id(&conn, id).await?;
    Ok((StatusCode::OK, Json(json!({ "success": true }))).into_response())
}

#[derive(Deserialize)]
pub struct GeneratePresignQuery {
    pub bucket: String,
    pub key: String,
    pub expires: Option<i64>,
    pub method: Option<String>,
    pub allowed_ip: Option<String>,
    pub one_time_use: Option<bool>,
}

pub(crate) struct PresignRequestSpec<'a> {
    pub bucket: &'a str,
    pub key: &'a str,
    pub method: &'a str,
    pub expires_secs: i64,
    pub allowed_ip: Option<&'a str>,
    pub one_time_use: bool,
}

fn resolve_presign_scheme_and_host(storage: &FileStorage, headers: &HeaderMap) -> (&'static str, String) {
    let raw_host = storage.config.server_host.trim();
    if let Some(rest) = raw_host.strip_prefix("https://") {
        return ("https", rest.trim_end_matches('/').to_string());
    }
    if let Some(rest) = raw_host.strip_prefix("http://") {
        return ("http", rest.trim_end_matches('/').to_string());
    }
    let host = if raw_host.is_empty() {
        format!("localhost:{}", storage.config.s3_port)
    } else {
        raw_host.trim_end_matches('/').to_string()
    };
    let is_https = headers
        .get("x-forwarded-proto")
        .and_then(|v| v.to_str().ok())
        .is_some_and(|p| p.eq_ignore_ascii_case("https"));
    (if is_https { "https" } else { "http" }, host)
}

pub(crate) async fn build_and_store_presigned_url(
    storage: &FileStorage,
    headers: &HeaderMap,
    spec: PresignRequestSpec<'_>,
) -> Result<String, AppError> {
    let expires_in = spec.expires_secs.clamp(1, 604_800);
    let method = spec.method.trim().to_uppercase();
    let method = if method.is_empty() { "GET" } else { method.as_str() };

    let now = Utc::now();
    let amz_date = now.format("%Y%m%dT%H%M%SZ").to_string();
    let date_stamp = now.format("%Y%m%d").to_string();
    let (scheme, host) = resolve_presign_scheme_and_host(storage, headers);

    let conn = storage.db.conn()?;
    let admin_key = db::users::list_access_keys(&conn, "admin")
        .await?
        .into_iter()
        .next()
        .ok_or_else(|| {
            AppError::BadRequest(
                "No active S3 access key found for user 'admin'; generate an access key first."
                    .to_string(),
            )
        })?;

    let credential = format!("{}/{date_stamp}/us-east-1/s3/aws4_request", admin_key.access_key_id);
    let path = format!("/{}/{}", spec.bucket, spec.key.trim_start_matches('/'));

    let mut query_params = [
        ("X-Amz-Algorithm", "AWS4-HMAC-SHA256".to_string()),
        ("X-Amz-Credential", credential),
        ("X-Amz-Date", amz_date.clone()),
        ("X-Amz-Expires", expires_in.to_string()),
        ("X-Amz-SignedHeaders", "host".to_string()),
    ];
    query_params.sort_by(|a, b| a.0.cmp(b.0));

    let canonical_query_str: String = query_params
        .iter()
        .map(|(k, v)| format!("{}={}", uri_encode(k, true), uri_encode(v, true)))
        .collect::<Vec<_>>()
        .join("&");

    let canonical_headers = format!("host:{host}\n");
    let canonical_request = format!(
        "{method}\n{path}\n{canonical_query_str}\n{canonical_headers}\nhost\nUNSIGNED-PAYLOAD"
    );

    let string_to_sign = format!(
        "AWS4-HMAC-SHA256\n{amz_date}\n{date_stamp}/us-east-1/s3/aws4_request\n{}",
        sha256_hex(canonical_request.as_bytes())
    );

    let signature = calculate_signature(
        &admin_key.secret_access_key,
        &date_stamp,
        "us-east-1",
        "s3",
        &string_to_sign,
    );

    let presigned_url =
        format!("{scheme}://{host}{path}?{canonical_query_str}&X-Amz-Signature={signature}");

    let expires_at = (now + chrono::Duration::seconds(expires_in)).to_rfc3339();
    db::presign::create_presigned_url(
        &conn,
        spec.bucket,
        spec.key,
        &presigned_url,
        &signature,
        method,
        &expires_at,
        spec.allowed_ip.filter(|ip| !ip.trim().is_empty()),
        spec.one_time_use,
    )
    .await?;

    Ok(presigned_url)
}

pub async fn generate_presign_url(
    State(storage): State<FileStorage>,
    headers: HeaderMap,
    Query(query): Query<GeneratePresignQuery>,
) -> Result<Response, AppError> {
    let presigned_url = build_and_store_presigned_url(
        &storage,
        &headers,
        PresignRequestSpec {
            bucket: &query.bucket,
            key: &query.key,
            method: query.method.as_deref().unwrap_or("GET"),
            expires_secs: query.expires.unwrap_or(3600),
            allowed_ip: query.allowed_ip.as_deref(),
            one_time_use: query.one_time_use.unwrap_or(false),
        },
    )
    .await?;

    Ok((StatusCode::OK, Json(json!({ "url": presigned_url }))).into_response())
}
