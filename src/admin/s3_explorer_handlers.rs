use axum::{
    extract::State,
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::time::{Duration, Instant};

use crate::auth::signature::{build_string_to_sign, calculate_signature, sha256_hex, uri_encode};
use crate::error::AppError;
use crate::storage::FileStorage;

#[derive(Debug, Deserialize)]
pub struct S3ExplorerRequest {
    pub endpoint: String,
    pub access_key_id: String,
    pub secret_access_key: String,
    #[serde(default = "default_region")]
    pub region: String,
    pub action: String,
    #[serde(default)]
    pub params: serde_json::Value,
}

fn default_region() -> String {
    "us-east-1".to_string()
}

#[derive(Debug, Serialize)]
pub struct S3ExplorerResponse {
    pub success: bool,
    pub command: String,
    pub status: u16,
    pub latency_ms: u64,
    pub headers: HashMap<String, String>,
    pub raw_body: String,
    pub data: Option<serde_json::Value>,
    pub error: Option<String>,
}

pub fn sign_s3_explorer_request(
    builder: reqwest::RequestBuilder,
    method: &str,
    endpoint: &str,
    canonical_uri: &str,
    canonical_query: &str,
    payload: &[u8],
    access_key: &str,
    secret_key: &str,
    region: &str,
    extra_headers: &[(&str, &str)],
) -> reqwest::RequestBuilder {
    let now = Utc::now();
    let amz_date = now.format("%Y%m%dT%H%M%SZ").to_string();
    let date_stamp = now.format("%Y%m%d").to_string();

    let stripped = endpoint
        .strip_prefix("https://")
        .or_else(|| endpoint.strip_prefix("http://"))
        .unwrap_or(endpoint);
    let host = stripped.split('/').next().unwrap_or(stripped);

    let payload_hash = sha256_hex(payload);

    let mut header_pairs: Vec<(&str, String)> = vec![
        ("host", host.to_string()),
        ("x-amz-content-sha256", payload_hash.clone()),
        ("x-amz-date", amz_date.clone()),
    ];
    for (k, v) in extra_headers {
        header_pairs.push((k, v.to_string()));
    }
    header_pairs.sort_by(|a, b| a.0.cmp(b.0));

    let mut canonical_headers = String::new();
    let mut signed_headers_vec = Vec::new();
    for (k, v) in &header_pairs {
        canonical_headers.push_str(&format!("{k}:{v}\n"));
        signed_headers_vec.push(*k);
    }
    let signed_headers = signed_headers_vec.join(";");

    let canonical_request = format!(
        "{method}\n{canonical_uri}\n{canonical_query}\n{canonical_headers}\n{signed_headers}\n{payload_hash}"
    );

    let algorithm = "AWS4-HMAC-SHA256";
    let credential_scope = format!("{date_stamp}/{region}/s3/aws4_request");
    let string_to_sign = build_string_to_sign(algorithm, &amz_date, &credential_scope, &canonical_request);
    let signature = calculate_signature(secret_key, &date_stamp, region, "s3", &string_to_sign);

    let auth_header = format!(
        "{algorithm} Credential={access_key}/{credential_scope}, SignedHeaders={signed_headers}, Signature={signature}"
    );

    let mut b = builder
        .header("Host", host)
        .header("User-Agent", "GravSpace-S3Explorer/0.4.2")
        .header("x-amz-date", amz_date)
        .header("x-amz-content-sha256", payload_hash)
        .header("Authorization", auth_header);

    for (k, v) in extra_headers {
        b = b.header(*k, *v);
    }
    b
}

pub async fn execute_s3_command(
    State(_storage): State<FileStorage>,
    Json(payload): Json<S3ExplorerRequest>,
) -> Result<Response, AppError> {
    let raw_endpoint = payload.endpoint.trim().trim_end_matches('/');
    if raw_endpoint.is_empty() {
        return Err(AppError::BadRequest("Target S3 endpoint is required".to_string()));
    }

    let parsed_url = reqwest::Url::parse(raw_endpoint)
        .map_err(|e| AppError::BadRequest(format!("Invalid S3 endpoint URL: {e}")))?;

    if parsed_url.scheme() != "http" && parsed_url.scheme() != "https" {
        return Err(AppError::BadRequest("Only HTTP and HTTPS endpoints are permitted".to_string()));
    }

    let p = &payload.params;
    let bucket = p.get("Bucket").and_then(|v| v.as_str()).unwrap_or("").trim_matches('/');
    let key = p.get("Key").and_then(|v| v.as_str()).unwrap_or("").trim_matches('/');

    let (method, canonical_uri, canonical_query, req_body, extra_headers) = match payload.action.as_str() {
        "ListBuckets" => ("GET", "/".to_string(), String::new(), Vec::new(), Vec::new()),
        "HeadBucket" => ("HEAD", format!("/{bucket}"), String::new(), Vec::new(), Vec::new()),
        "CreateBucket" => ("PUT", format!("/{bucket}"), String::new(), Vec::new(), Vec::new()),
        "DeleteBucket" => ("DELETE", format!("/{bucket}"), String::new(), Vec::new(), Vec::new()),
        "ListObjectsV2" => {
            let mut q_parts = vec!["list-type=2".to_string()];
            if let Some(prefix) = p.get("Prefix").and_then(|v| v.as_str()) {
                if !prefix.is_empty() {
                    q_parts.push(format!("prefix={}", uri_encode(prefix, true)));
                }
            }
            if let Some(delim) = p.get("Delimiter").and_then(|v| v.as_str()) {
                if !delim.is_empty() {
                    q_parts.push(format!("delimiter={}", uri_encode(delim, true)));
                }
            }
            if let Some(max_keys) = p.get("MaxKeys").and_then(|v| v.as_i64()) {
                q_parts.push(format!("max-keys={max_keys}"));
            }
            q_parts.sort();
            ("GET", format!("/{bucket}"), q_parts.join("&"), Vec::new(), Vec::new())
        }
        "HeadObject" => ("HEAD", format!("/{bucket}/{key}"), String::new(), Vec::new(), Vec::new()),
        "GetObject" => ("GET", format!("/{bucket}/{key}"), String::new(), Vec::new(), Vec::new()),
        "PutObject" => {
            let body = p.get("Body").and_then(|v| v.as_str()).map(|s| s.as_bytes().to_vec()).unwrap_or_default();
            ("PUT", format!("/{bucket}/{key}"), String::new(), body, Vec::new())
        }
        "DeleteObject" => ("DELETE", format!("/{bucket}/{key}"), String::new(), Vec::new(), Vec::new()),
        "CopyObject" => {
            let mut headers = Vec::new();
            let copy_src = p.get("CopySource").and_then(|v| v.as_str()).unwrap_or("");
            if !copy_src.is_empty() {
                headers.push(("x-amz-copy-source", copy_src));
            }
            ("PUT", format!("/{bucket}/{key}"), String::new(), Vec::new(), headers)
        }
        "GetBucketVersioning" => ("GET", format!("/{bucket}"), "versioning=".to_string(), Vec::new(), Vec::new()),
        "PutBucketVersioning" => {
            let status = p.get("Status").and_then(|v| v.as_str()).unwrap_or("Enabled");
            let xml = format!(
                r#"<?xml version="1.0" encoding="UTF-8"?><VersioningConfiguration xmlns="http://s3.amazonaws.com/doc/2006-03-01/"><Status>{status}</Status></VersioningConfiguration>"#
            );
            ("PUT", format!("/{bucket}"), "versioning=".to_string(), xml.into_bytes(), Vec::new())
        }
        "GetBucketCors" => ("GET", format!("/{bucket}"), "cors=".to_string(), Vec::new(), Vec::new()),
        "PutBucketCors" => {
            let body = if let Some(cors_cfg) = p.get("CORSConfiguration") {
                if let Some(s) = cors_cfg.as_str() {
                    s.as_bytes().to_vec()
                } else {
                    cors_cfg.to_string().into_bytes()
                }
            } else {
                r#"<?xml version="1.0" encoding="UTF-8"?><CORSConfiguration xmlns="http://s3.amazonaws.com/doc/2006-03-01/"><CORSRule><AllowedOrigin>*</AllowedOrigin><AllowedMethod>GET</AllowedMethod><AllowedMethod>PUT</AllowedMethod><AllowedHeader>*</AllowedHeader></CORSRule></CORSConfiguration>"#.as_bytes().to_vec()
            };
            ("PUT", format!("/{bucket}"), "cors=".to_string(), body, Vec::new())
        }
        "GetObjectTagging" => ("GET", format!("/{bucket}/{key}"), "tagging=".to_string(), Vec::new(), Vec::new()),
        "PutObjectTagging" => {
            let body = if let Some(tag_set) = p.get("TagSet").and_then(|v| v.as_array()) {
                let mut xml = String::from(r#"<?xml version="1.0" encoding="UTF-8"?><Tagging><TagSet>"#);
                for tag in tag_set {
                    let k = tag.get("Key").and_then(|v| v.as_str()).unwrap_or("");
                    let val = tag.get("Value").and_then(|v| v.as_str()).unwrap_or("");
                    xml.push_str(&format!("<Tag><Key>{k}</Key><Value>{val}</Value></Tag>"));
                }
                xml.push_str("</TagSet></Tagging>");
                xml.into_bytes()
            } else if let Some(raw) = p.get("Tagging").and_then(|v| v.as_str()) {
                raw.as_bytes().to_vec()
            } else {
                r#"<?xml version="1.0" encoding="UTF-8"?><Tagging><TagSet></TagSet></Tagging>"#.as_bytes().to_vec()
            };
            ("PUT", format!("/{bucket}/{key}"), "tagging=".to_string(), body, Vec::new())
        }
        other => {
            return Err(AppError::BadRequest(format!("Unsupported S3 command: {other}")));
        }
    };

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .build()
        .unwrap_or_else(|_| reqwest::Client::new());

    let target_url = if canonical_query.is_empty() {
        format!("{raw_endpoint}{canonical_uri}")
    } else {
        format!("{raw_endpoint}{canonical_uri}?{canonical_query}")
    };

    let mut req_builder = client.request(
        reqwest::Method::from_bytes(method.as_bytes()).unwrap_or(reqwest::Method::GET),
        &target_url,
    );

    req_builder = sign_s3_explorer_request(
        req_builder,
        method,
        raw_endpoint,
        &canonical_uri,
        &canonical_query,
        &req_body,
        &payload.access_key_id,
        &payload.secret_access_key,
        &payload.region,
        &extra_headers,
    );

    if !req_body.is_empty() {
        req_builder = req_builder.body(req_body);
    }

    let start = Instant::now();
    match req_builder.send().await {
        Ok(resp) => {
            let latency_ms = start.elapsed().as_millis() as u64;
            let status = resp.status().as_u16();

            let mut resp_headers = HashMap::new();
            for (k, v) in resp.headers() {
                if let Ok(v_str) = v.to_str() {
                    resp_headers.insert(k.as_str().to_string(), v_str.to_string());
                }
            }

            let bytes = resp.bytes().await.unwrap_or_default();
            let body_str = String::from_utf8_lossy(&bytes).to_string();

            let success = status >= 200 && status < 300;
            let err_msg = if !success {
                Some(format!("S3 error HTTP {status}: {body_str}"))
            } else {
                None
            };

            let json_res = S3ExplorerResponse {
                success,
                command: payload.action,
                status,
                latency_ms,
                headers: resp_headers,
                raw_body: body_str,
                data: None,
                error: err_msg,
            };

            Ok((StatusCode::OK, Json(json_res)).into_response())
        }
        Err(e) => {
            let latency_ms = start.elapsed().as_millis() as u64;
            let json_res = S3ExplorerResponse {
                success: false,
                command: payload.action,
                status: 504,
                latency_ms,
                headers: HashMap::new(),
                raw_body: String::new(),
                data: None,
                error: Some(format!("Connection to S3 endpoint '{target_url}' failed: {e}")),
            };
            Ok((StatusCode::OK, Json(json_res)).into_response())
        }
    }
}
