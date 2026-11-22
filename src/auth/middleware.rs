use crate::auth::jwt::verify_jwt;
use crate::auth::policy::{evaluate_policies, Policy};
use crate::auth::signature::{
    build_canonical_request, build_string_to_sign, calculate_signature, candidate_hosts,
    percent_decode,
};
use crate::config::Config;
use crate::db::{self, Database};
use crate::error::{AppError, AuthError};
use axum::{
    extract::{Request, State},
    http::{HeaderMap, Method},
    middleware::Next,
    response::Response,
};
use std::collections::HashMap;
use std::sync::Arc;

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

pub async fn verify_s3_request(
    db: &Database,
    config: &Config,
    method: &Method,
    path: &str,
    query_str: Option<&str>,
    headers: &HeaderMap,
    action: &str,
    bucket: &str,
    key: &str,
) -> Result<String, AppError> {
    let conn = db.conn()?;
    let query_map = parse_query(query_str);

    // 1. Check Presigned URL
    if let Some(sig) = query_map.get("X-Amz-Signature").and_then(|v| v.first()) {
        return verify_presigned(
            &conn, config, method, path, &query_map, headers, sig, action, bucket, key,
        )
        .await;
    }

    // 2. Check Authorization Header
    let auth_header = headers
        .get("Authorization")
        .and_then(|h| h.to_str().ok())
        .unwrap_or("");

    if auth_header.starts_with("AWS4-HMAC-SHA256 ") {
        return verify_header_auth(
            &conn, config, method, path, &query_map, headers, auth_header, action, bucket, key,
        )
        .await;
    }

    // 3. Anonymous / Public Check
    if action == "s3:GetObject" && !bucket.is_empty() {
        if let Ok(Some(b)) = db::buckets::get_bucket(&conn, bucket).await {
            if b.owner == "anonymous" {
                return Ok("anonymous".to_string());
            }
        }
    }

    Err(AuthError::AccessDenied.into())
}

async fn verify_presigned(
    conn: &libsql::Connection,
    config: &Config,
    method: &Method,
    path: &str,
    query_map: &HashMap<String, Vec<String>>,
    headers: &HeaderMap,
    provided_sig: &str,
    action: &str,
    bucket: &str,
    key: &str,
) -> Result<String, AppError> {
    // Check revoked
    if db::presign::is_signature_revoked(conn, provided_sig).await? {
        return Err(AuthError::AccessDenied.into());
    }
    // Check used (one-time)
    if db::presign::is_signature_used(conn, provided_sig).await? {
        return Err(AuthError::AccessDenied.into());
    }

    let credential = query_map
        .get("X-Amz-Credential")
        .and_then(|v| v.first())
        .ok_or_else(|| AuthError::MalformedHeader("Missing X-Amz-Credential".to_string()))?;

    let cred_parts: Vec<&str> = credential.split('/').collect();
    if cred_parts.len() < 4 {
        return Err(AuthError::MalformedHeader("Invalid Credential scope".to_string()).into());
    }
    let access_key_id = cred_parts[0];
    let date = cred_parts[1];
    let region = cred_parts[2];
    let service = cred_parts[3];

    let ak_record = db::users::get_access_key(conn, access_key_id)
        .await?
        .ok_or(AuthError::InvalidCredentials)?;

    let amz_date = query_map
        .get("X-Amz-Date")
        .and_then(|v| v.first())
        .unwrap_or(&date.to_string())
        .clone();

    let signed_headers_raw = query_map
        .get("X-Amz-SignedHeaders")
        .and_then(|v| v.first())
        .cloned()
        .unwrap_or_else(|| "host".to_string());
    let signed_headers: Vec<String> = signed_headers_raw.split(';').map(String::from).collect();

    let headers_map = header_map_to_hash(headers);
    let req_host = headers
        .get("host")
        .and_then(|h| h.to_str().ok())
        .unwrap_or("localhost");

    let candidates = candidate_hosts(req_host, &config.server_host, &config.cdn_hosts);
    let mut signature_matched = false;

    for host in &candidates {
        let canonical_request = build_canonical_request(
            method.as_str(),
            path,
            query_map,
            &headers_map,
            &signed_headers,
            "UNSIGNED-PAYLOAD",
            host,
        );
        let string_to_sign = build_string_to_sign(
            "AWS4-HMAC-SHA256",
            &amz_date,
            &format!("{date}/{region}/{service}/aws4_request"),
            &canonical_request,
        );
        let calculated = calculate_signature(
            &ak_record.secret_access_key,
            date,
            region,
            service,
            &string_to_sign,
        );

        if calculated.eq_ignore_ascii_case(provided_sig) {
            signature_matched = true;
            break;
        }
    }

    if !signature_matched {
        return Err(AuthError::SignatureMismatch.into());
    }

    authorize_user(conn, &ak_record.username, action, bucket, key).await
}

async fn verify_header_auth(
    conn: &libsql::Connection,
    config: &Config,
    method: &Method,
    path: &str,
    query_map: &HashMap<String, Vec<String>>,
    headers: &HeaderMap,
    auth_header: &str,
    action: &str,
    bucket: &str,
    key: &str,
) -> Result<String, AppError> {
    let auth_str = auth_header.strip_prefix("AWS4-HMAC-SHA256 ").unwrap_or("");
    let mut parts_map = HashMap::new();
    for part in auth_str.split(',') {
        if let Some((k, v)) = part.trim().split_once('=') {
            parts_map.insert(k.trim(), v.trim());
        }
    }

    let credential = parts_map
        .get("Credential")
        .ok_or_else(|| AuthError::MalformedHeader("Missing Credential".to_string()))?;
    let signed_headers_str = parts_map
        .get("SignedHeaders")
        .ok_or_else(|| AuthError::MalformedHeader("Missing SignedHeaders".to_string()))?;
    let provided_sig = parts_map
        .get("Signature")
        .ok_or_else(|| AuthError::MalformedHeader("Missing Signature".to_string()))?;

    let cred_parts: Vec<&str> = credential.split('/').collect();
    if cred_parts.len() < 4 {
        return Err(AuthError::MalformedHeader("Invalid Credential scope".to_string()).into());
    }
    let access_key_id = cred_parts[0];
    let date = cred_parts[1];
    let region = cred_parts[2];
    let service = cred_parts[3];

    let ak_record = db::users::get_access_key(conn, access_key_id)
        .await?
        .ok_or(AuthError::InvalidCredentials)?;

    let amz_date = headers
        .get("x-amz-date")
        .and_then(|h| h.to_str().ok())
        .unwrap_or(date);

    let signed_headers: Vec<String> = signed_headers_str.split(';').map(String::from).collect();
    let payload_hash = headers
        .get("x-amz-content-sha256")
        .and_then(|h| h.to_str().ok())
        .unwrap_or("UNSIGNED-PAYLOAD");

    let headers_map = header_map_to_hash(headers);
    let req_host = headers
        .get("host")
        .and_then(|h| h.to_str().ok())
        .unwrap_or("localhost");

    let candidates = candidate_hosts(req_host, &config.server_host, &config.cdn_hosts);
    let mut signature_matched = false;

    for host in &candidates {
        let canonical_request = build_canonical_request(
            method.as_str(),
            path,
            query_map,
            &headers_map,
            &signed_headers,
            payload_hash,
            host,
        );
        let string_to_sign = build_string_to_sign(
            "AWS4-HMAC-SHA256",
            amz_date,
            &format!("{date}/{region}/{service}/aws4_request"),
            &canonical_request,
        );
        let calculated = calculate_signature(
            &ak_record.secret_access_key,
            date,
            region,
            service,
            &string_to_sign,
        );

        if calculated.eq_ignore_ascii_case(provided_sig) {
            signature_matched = true;
            break;
        }
    }

    if !signature_matched {
        return Err(AuthError::SignatureMismatch.into());
    }

    authorize_user(conn, &ak_record.username, action, bucket, key).await
}

async fn authorize_user(
    conn: &libsql::Connection,
    username: &str,
    action: &str,
    bucket: &str,
    key: &str,
) -> Result<String, AppError> {
    if username == "admin" {
        return Ok(username.to_string());
    }

    let policy_records = db::policies::list_user_policies(conn, username).await?;
    let mut parsed_policies = Vec::new();
    for p in policy_records {
        if let Ok(parsed) = serde_json::from_str::<Policy>(&p.data) {
            parsed_policies.push(parsed);
        }
    }

    let resource = if key.is_empty() {
        format!("arn:aws:s3:::{bucket}")
    } else {
        format!("arn:aws:s3:::{bucket}/{key}")
    };

    if evaluate_policies(&parsed_policies, action, &resource) {
        Ok(username.to_string())
    } else {
        Err(AuthError::AccessDenied.into())
    }
}

fn parse_query(query_str: Option<&str>) -> HashMap<String, Vec<String>> {
    let mut map: HashMap<String, Vec<String>> = HashMap::new();
    if let Some(qs) = query_str {
        for pair in qs.split('&') {
            if let Some((k, v)) = pair.split_once('=') {
                let dec_k = percent_decode(k);
                let dec_v = percent_decode(v);
                map.entry(dec_k).or_default().push(dec_v);
            } else if !pair.is_empty() {
                map.entry(percent_decode(pair)).or_default().push(String::new());
            }
        }
    }
    map
}

fn header_map_to_hash(headers: &HeaderMap) -> HashMap<String, String> {
    let mut map = HashMap::new();
    for (k, v) in headers {
        if let Ok(v_str) = v.to_str() {
            map.insert(k.as_str().to_lowercase(), v_str.to_string());
        }
    }
    map
}
