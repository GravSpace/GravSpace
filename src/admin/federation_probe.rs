use crate::db;
use crate::error::AppError;
use crate::storage::FileStorage;
use axum::{
    extract::State,
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde::Deserialize;
use serde_json::json;
use std::time::Duration;

#[derive(Deserialize)]
pub struct TestEndpointPayload {
    pub peer_id: Option<i64>,
    pub endpoint: String,
    pub s3_endpoint: Option<String>,
    pub access_key_id: Option<String>,
    pub secret_access_key: Option<String>,
}

/// Validates and normalizes an HTTP/HTTPS peer URL, blocking metadata and internal DB/cache ports.
pub(crate) fn validate_peer_url(raw: &str, label: &str) -> Result<String, AppError> {
    let cleaned = raw.trim().trim_end_matches('/');
    if cleaned.is_empty() {
        return Err(AppError::BadRequest(format!("{label} is required")));
    }

    let parsed = reqwest::Url::parse(cleaned)
        .map_err(|e| AppError::BadRequest(format!("Invalid {label}: {e}")))?;

    let scheme = parsed.scheme();
    if scheme != "http" && scheme != "https" {
        return Err(AppError::BadRequest(
            "Only HTTP and HTTPS endpoints are permitted".to_string(),
        ));
    }

    if let Some(host_str) = parsed.host_str() {
        if host_str == "169.254.169.254" {
            return Err(AppError::BadRequest(
                "Access to link-local metadata address is blocked".to_string(),
            ));
        }
        if (host_str == "localhost" || host_str == "127.0.0.1" || host_str == "::1")
            && matches!(parsed.port(), Some(8085 | 6379))
        {
            return Err(AppError::BadRequest(
                "Access to internal database/cache port is blocked".to_string(),
            ));
        }
    }

    Ok(cleaned.to_string())
}

/// Validates and probes a remote GravSpace admin `/health` and optional S3 endpoint.
pub async fn test_remote_endpoint(
    State(storage): State<FileStorage>,
    Json(payload): Json<TestEndpointPayload>,
) -> Result<Response, AppError> {
    let raw = validate_peer_url(&payload.endpoint, "Endpoint URL")?;

    let mut effective_ak = payload.access_key_id.clone().unwrap_or_default();
    let mut effective_sk = payload.secret_access_key.clone().unwrap_or_default();
    if effective_sk.trim().is_empty() {
        if let Some(pid) = payload.peer_id {
            if let Ok(conn) = storage.federation_conn() {
                if let Ok(Some(peer)) = db::federation::get_remote_server(&conn, pid).await {
                    if effective_ak.trim().is_empty() {
                        effective_ak = peer.access_key;
                    }
                    effective_sk = peer.secret_key;
                }
            }
        }
    }

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(5))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .unwrap_or_else(|_| reqwest::Client::new());

    let health_url = format!("{raw}/health");
    let start = std::time::Instant::now();
    let admin_res = client.get(&health_url).send().await;
    let admin_latency = start.elapsed().as_millis() as u64;

    let (admin_ok, admin_status, admin_msg) = match admin_res {
        Ok(resp) => {
            let s = resp.status();
            if s.is_success() || s.as_u16() == 404 {
                (true, s.as_u16(), format!("Online ({admin_latency}ms)"))
            } else {
                (
                    false,
                    s.as_u16(),
                    format!("Server responded with HTTP {}", s.as_u16()),
                )
            }
        }
        Err(e) => (false, 504, format!("Connection failed: {e}")),
    };

    let mut s3_result = None;
    if let Some(raw_s3) = payload.s3_endpoint {
        if !raw_s3.trim().is_empty() {
            let s3_clean = validate_peer_url(&raw_s3, "S3 Endpoint URL")?;
            let s3_start = std::time::Instant::now();
            let mut req = client.get(&s3_clean);
            let has_creds = !effective_ak.trim().is_empty() && !effective_sk.trim().is_empty();

            if has_creds {
                req = crate::admin::s3_explorer_handlers::sign_s3_explorer_request(
                    req,
                    "GET",
                    &s3_clean,
                    "/",
                    "",
                    &[],
                    effective_ak.trim(),
                    effective_sk.trim(),
                    "us-east-1",
                    &[],
                );
            }

            let s3_res = req.send().await;
            let s3_latency = s3_start.elapsed().as_millis() as u64;

            let (s3_ok, s3_status, s3_msg, authed) = match s3_res {
                Ok(resp) => {
                    let s = resp.status().as_u16();
                    if (200..300).contains(&s) {
                        (
                            true,
                            s,
                            format!("S3 Storage & Credentials Valid ({s3_latency}ms)"),
                            true,
                        )
                    } else if s == 403 {
                        if has_creds {
                            (
                                false,
                                s,
                                "S3 Online but Credentials Invalid (HTTP 403)".to_string(),
                                false,
                            )
                        } else {
                            (
                                true,
                                s,
                                format!("S3 Online (requires credentials, {s3_latency}ms)"),
                                false,
                            )
                        }
                    } else {
                        (
                            true,
                            s,
                            format!("S3 Responded with HTTP {s} ({s3_latency}ms)"),
                            false,
                        )
                    }
                }
                Err(e) => (false, 504, format!("S3 Port Unreachable: {e}"), false),
            };

            s3_result = Some(json!({
                "success": s3_ok,
                "latency_ms": s3_latency,
                "status_code": s3_status,
                "authenticated": authed,
                "message": s3_msg,
            }));
        }
    }

    let overall_success = admin_ok
        && s3_result
            .as_ref()
            .map(|v| v["success"].as_bool().unwrap_or(true))
            .unwrap_or(true);
    let summary = if overall_success {
        if s3_result.is_some() {
            "Admin API & S3 Storage verified successfully".to_string()
        } else {
            format!("Online ({admin_latency}ms latency) - Ready to connect")
        }
    } else if !admin_ok {
        admin_msg.clone()
    } else {
        s3_result
            .as_ref()
            .and_then(|v| v["message"].as_str())
            .unwrap_or("S3 verification failed")
            .to_string()
    };

    Ok((
        StatusCode::OK,
        Json(json!({
            "success": overall_success,
            "latency_ms": admin_latency,
            "status_code": admin_status,
            "message": summary,
            "admin": {
                "success": admin_ok,
                "latency_ms": admin_latency,
                "status_code": admin_status,
                "message": admin_msg,
            },
            "s3": s3_result,
        })),
    )
        .into_response())
}
