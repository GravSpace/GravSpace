use crate::auth::signature::{calculate_signature, uri_encode};
use crate::db;
use crate::error::AppError;
use crate::storage::FileStorage;
use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
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
}

pub async fn generate_presign_url(
    State(storage): State<FileStorage>,
    Query(query): Query<GeneratePresignQuery>,
) -> Result<Response, AppError> {
    let expires_in = query.expires.unwrap_or(3600);
    let method = query
        .method
        .map(|m| m.to_uppercase())
        .unwrap_or_else(|| "GET".to_string());
    let now = Utc::now();
    let amz_date = now.format("%Y%m%dT%H%M%SZ").to_string();
    let date_stamp = now.format("%Y%m%d").to_string();

    let host = if storage.config.server_host.is_empty() {
        format!("localhost:{}", storage.config.s3_port)
    } else {
        storage.config.server_host.clone()
    };

    let conn = storage.db.conn()?;
    let admin_key = db::users::list_access_keys(&conn, "admin")
        .await?
        .into_iter()
        .next()
        .unwrap_or(db::users::AccessKeyRecord {
            access_key_id: "admin".to_string(),
            secret_access_key: "admin".to_string(),
            username: "admin".to_string(),
            created_at: String::new(),
        });

    let credential = format!("{}/{date_stamp}/us-east-1/s3/aws4_request", admin_key.access_key_id);
    let path = format!("/{}/{}", query.bucket, query.key.trim_start_matches('/'));

    let mut query_params = vec![
        ("X-Amz-Algorithm", "AWS4-HMAC-SHA256".to_string()),
        ("X-Amz-Credential", credential),
        ("X-Amz-Date", amz_date.clone()),
        ("X-Amz-Expires", expires_in.to_string()),
        ("X-Amz-SignedHeaders", "host".to_string()),
    ];
    query_params.sort_by(|a, b| a.0.cmp(b.0));

    let canonical_query: Vec<String> = query_params
        .iter()
        .map(|(k, v)| format!("{}={}", uri_encode(k, true), uri_encode(v, true)))
        .collect();
    let canonical_query_str = canonical_query.join("&");

    let canonical_headers = format!("host:{host}\n");
    let canonical_request = format!(
        "{method}\n{path}\n{canonical_query_str}\n{canonical_headers}\nhost\nUNSIGNED-PAYLOAD"
    );

    let string_to_sign = format!(
        "AWS4-HMAC-SHA256\n{amz_date}\n{date_stamp}/us-east-1/s3/aws4_request\n{}",
        crate::auth::signature::sha256_hex(canonical_request.as_bytes())
    );

    let signature = calculate_signature(
        &admin_key.secret_access_key,
        &date_stamp,
        "us-east-1",
        "s3",
        &string_to_sign,
    );

    let presigned_url = format!("http://{host}{path}?{canonical_query_str}&X-Amz-Signature={signature}");

    let expires_at = (now + chrono::Duration::seconds(expires_in)).to_rfc3339();
    let _ = db::presign::create_presigned_url(
        &conn,
        &query.bucket,
        &query.key,
        &presigned_url,
        &signature,
        &method,
        &expires_at,
        None,
        false,
    )
    .await;

    Ok((StatusCode::OK, Json(json!({ "url": presigned_url }))).into_response())
}
