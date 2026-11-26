use super::middleware::extract_client_ip;
use crate::auth::policy::{evaluate_policies, Policy};
use crate::auth::signature::{
    build_canonical_request, build_string_to_sign, calculate_signature, candidate_hosts,
    percent_decode,
};
use crate::config::Config;
use crate::db::{self, Database};
use crate::error::{AppError, AuthError};
use axum::{
    extract::{ConnectInfo, Request},
    http::{HeaderMap, Method},
};
use chrono::{DateTime, Duration, NaiveDate, NaiveDateTime, Utc};
use std::collections::HashMap;
use std::net::SocketAddr;

pub struct S3RequestAuth<'a> {
    pub method: &'a Method,
    pub path: &'a str,
    pub query_str: Option<&'a str>,
    pub headers: &'a HeaderMap,
    pub client_ip: Option<&'a str>,
    pub action: &'a str,
    pub bucket: &'a str,
    pub key: &'a str,
}

pub fn verify_s3_http(
    db: &Database,
    config: &Config,
    request: &Request,
    action: &str,
    bucket: &str,
    key: &str,
) -> impl std::future::Future<Output = Result<String, AppError>> + Send {
    let db = db.clone();
    let config = config.clone();
    let method = request.method().clone();
    let path = request.uri().path().to_string();
    let query_str = request.uri().query().map(str::to_string);
    let headers = request.headers().clone();
    let conn_ip = request
        .extensions()
        .get::<ConnectInfo<SocketAddr>>()
        .map(|ci| ci.0.ip().to_string());
    let resolved_ip = extract_client_ip(&headers).or(conn_ip);
    let action = action.to_string();
    let bucket = bucket.to_string();
    let key = key.to_string();

    async move {
        let req_auth = S3RequestAuth {
            method: &method,
            path: &path,
            query_str: query_str.as_deref(),
            headers: &headers,
            client_ip: resolved_ip.as_deref(),
            action: &action,
            bucket: &bucket,
            key: &key,
        };
        verify_s3_request(&db, &config, &req_auth).await
    }
}

pub async fn verify_s3_request(
    db: &Database,
    config: &Config,
    req: &S3RequestAuth<'_>,
) -> Result<String, AppError> {
    let conn = db.conn()?;
    let query_map = parse_query(req.query_str);

    // 1. Check Presigned URL
    if let Some(sig) = query_map.get("X-Amz-Signature").and_then(|v| v.first()) {
        return verify_presigned(&conn, config, req, &query_map, sig).await;
    }

    // 2. Check Authorization Header
    let auth_header = req
        .headers
        .get("Authorization")
        .and_then(|h| h.to_str().ok())
        .unwrap_or("");

    if auth_header.starts_with("AWS4-HMAC-SHA256 ") {
        return verify_header_auth(&conn, config, req, &query_map, auth_header).await;
    }

    // 3. Anonymous / Public Check
    if !req.bucket.is_empty() {
        if authorize_user(&conn, "anonymous", req.action, req.bucket, req.key)
            .await
            .is_ok()
        {
            return Ok("anonymous".to_string());
        }
        if req.action == "s3:GetObject" {
            if let Ok(Some(b)) = db::buckets::get_bucket(&conn, req.bucket).await {
                if b.owner == "anonymous" {
                    return Ok("anonymous".to_string());
                }
            }
        }
    }

    Err(AuthError::AccessDenied.into())
}

fn parse_amz_date(raw: &str) -> Option<DateTime<Utc>> {
    if let Ok(dt) = NaiveDateTime::parse_from_str(raw, "%Y%m%dT%H%M%SZ") {
        return Some(DateTime::<Utc>::from_naive_utc_and_offset(dt, Utc));
    }
    if let Ok(d) = NaiveDate::parse_from_str(raw, "%Y%m%d") {
        if let Some(dt) = d.and_hms_opt(0, 0, 0) {
            return Some(DateTime::<Utc>::from_naive_utc_and_offset(dt, Utc));
        }
    }
    None
}

fn check_presigned_expiry(
    amz_date: &str,
    expires_str: Option<&str>,
    db_expires_at: Option<&str>,
    now: DateTime<Utc>,
) -> Result<DateTime<Utc>, AppError> {
    if let Some(db_exp) = db_expires_at {
        if !db_exp.trim().is_empty() {
            if let Ok(dt) = DateTime::parse_from_rfc3339(db_exp) {
                if now > dt.with_timezone(&Utc) {
                    return Err(AuthError::RequestExpired.into());
                }
            }
        }
    }

    let issued_at = parse_amz_date(amz_date)
        .ok_or_else(|| AuthError::MalformedHeader("Invalid X-Amz-Date".to_string()))?;

    let expires_secs = expires_str
        .and_then(|s| s.parse::<i64>().ok())
        .ok_or_else(|| AuthError::MalformedHeader("Missing or invalid X-Amz-Expires".to_string()))?;

    if !(1..=604_800).contains(&expires_secs) {
        return Err(AuthError::MalformedHeader("X-Amz-Expires out of range".to_string()).into());
    }

    let expires_at = issued_at + Duration::seconds(expires_secs);
    if now > expires_at {
        return Err(AuthError::RequestExpired.into());
    }
    Ok(expires_at)
}

fn ip_matches_allowed(client_ip: Option<&str>, allowed_spec: &str) -> bool {
    let trimmed_spec = allowed_spec.trim();
    if trimmed_spec.is_empty() {
        return true;
    }
    let Some(actual) = client_ip.map(str::trim).filter(|ip| !ip.is_empty()) else {
        return false;
    };
    trimmed_spec
        .split(',')
        .map(str::trim)
        .any(|candidate| !candidate.is_empty() && candidate == actual)
}

async fn verify_presigned(
    conn: &libsql::Connection,
    config: &Config,
    req: &S3RequestAuth<'_>,
    query_map: &HashMap<String, Vec<String>>,
    provided_sig: &str,
) -> Result<String, AppError> {
    if db::presign::is_signature_revoked(conn, provided_sig).await? {
        return Err(AuthError::AccessDenied.into());
    }
    if db::presign::is_signature_used(conn, provided_sig).await? {
        return Err(AuthError::AccessDenied.into());
    }

    let stored_meta = db::presign::get_presigned_url_by_signature(conn, provided_sig)
        .await
        .unwrap_or(None);

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

    let amz_date = query_map
        .get("X-Amz-Date")
        .and_then(|v| v.first())
        .map(String::as_str)
        .unwrap_or(date);

    let expires_param = query_map
        .get("X-Amz-Expires")
        .and_then(|v| v.first())
        .map(String::as_str);
    let expires_at = check_presigned_expiry(
        amz_date,
        expires_param,
        stored_meta.as_ref().map(|m| m.expires_at.as_str()),
        Utc::now(),
    )?;

    if let Some(ref meta) = stored_meta {
        if let Some(ref allowed_ip) = meta.allowed_ip {
            if !ip_matches_allowed(req.client_ip, allowed_ip) {
                return Err(AuthError::AccessDenied.into());
            }
        }
    }

    let ak_record = db::users::get_access_key(conn, access_key_id)
        .await?
        .ok_or(AuthError::InvalidCredentials)?;

    let signed_headers_raw = query_map
        .get("X-Amz-SignedHeaders")
        .and_then(|v| v.first())
        .cloned()
        .unwrap_or_else(|| "host".to_string());
    let signed_headers: Vec<String> = signed_headers_raw.split(';').map(String::from).collect();

    let headers_map = header_map_to_hash(req.headers);
    let req_host = req
        .headers
        .get("host")
        .and_then(|h| h.to_str().ok())
        .unwrap_or("localhost");

    let mut candidates = candidate_hosts(req_host, &config.server_host, &config.cdn_hosts);
    if let Some(fwd_host) = req.headers.get("x-forwarded-host").and_then(|h| h.to_str().ok()) {
        for ch in candidate_hosts(fwd_host, &config.server_host, &config.cdn_hosts) {
            if !candidates.contains(&ch) {
                candidates.push(ch);
            }
        }
    }
    let mut signature_matched = false;

    for host in &candidates {
        let canonical_request = build_canonical_request(
            req.method.as_str(),
            req.path,
            query_map,
            &headers_map,
            &signed_headers,
            "UNSIGNED-PAYLOAD",
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

    let authed_user =
        authorize_user(conn, &ak_record.username, req.action, req.bucket, req.key).await?;

    if stored_meta.as_ref().is_some_and(|m| m.one_time_use) {
        let _ =
            db::presign::record_used_signature(conn, provided_sig, &expires_at.to_rfc3339()).await;
    }

    Ok(authed_user)
}

async fn verify_header_auth(
    conn: &libsql::Connection,
    config: &Config,
    req: &S3RequestAuth<'_>,
    query_map: &HashMap<String, Vec<String>>,
    auth_header: &str,
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

    let amz_date = req
        .headers
        .get("x-amz-date")
        .and_then(|h| h.to_str().ok())
        .unwrap_or(date);

    let signed_headers: Vec<String> = signed_headers_str.split(';').map(String::from).collect();
    let payload_hash = req
        .headers
        .get("x-amz-content-sha256")
        .and_then(|h| h.to_str().ok())
        .unwrap_or("UNSIGNED-PAYLOAD");

    let headers_map = header_map_to_hash(req.headers);
    let req_host = req
        .headers
        .get("host")
        .and_then(|h| h.to_str().ok())
        .unwrap_or("localhost");

    let mut candidates = candidate_hosts(req_host, &config.server_host, &config.cdn_hosts);
    if let Some(fwd_host) = req.headers.get("x-forwarded-host").and_then(|h| h.to_str().ok()) {
        for ch in candidate_hosts(fwd_host, &config.server_host, &config.cdn_hosts) {
            if !candidates.contains(&ch) {
                candidates.push(ch);
            }
        }
    }
    let mut signature_matched = false;

    for host in &candidates {
        let canonical_request = build_canonical_request(
            req.method.as_str(),
            req.path,
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

    authorize_user(conn, &ak_record.username, req.action, req.bucket, req.key).await
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

#[cfg(test)]
mod tests {
    use super::{check_presigned_expiry, ip_matches_allowed};
    use chrono::{TimeZone, Utc};

    #[test]
    fn presigned_expiry_rejects_expired_and_accepts_active() {
        let now = Utc.with_ymd_and_hms(2026, 11, 26, 12, 0, 0).unwrap();
        assert!(check_presigned_expiry("20261126T115000Z", Some("300"), None, now).is_err());
        assert!(check_presigned_expiry("20261126T115800Z", Some("300"), None, now).is_ok());
    }

    #[test]
    fn allowed_ip_matches_comma_separated_entries() {
        assert!(ip_matches_allowed(Some("10.0.0.5"), "10.0.0.1, 10.0.0.5"));
        assert!(!ip_matches_allowed(Some("10.0.0.9"), "10.0.0.1, 10.0.0.5"));
        assert!(!ip_matches_allowed(None, "10.0.0.1"));
    }
}
