use crate::auth::middleware::AuthContext;
use crate::db;
use crate::error::AppError;
use crate::storage::FileStorage;
use crate::vault::{crypto, pam};
use axum::{
    extract::{Extension, Path, State},
    http::{header, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use serde_json::{json, Map, Value};
use sha2::{Digest, Sha256};

pub const MAX_VAULT_SECRET_BYTES: usize = 2 * 1024 * 1024;

pub fn validate_secret_name(raw: &str) -> Result<String, AppError> {
    let trimmed = raw.trim();
    if trimmed.is_empty()
        || trimmed.len() > 160
        || trimmed.contains('/')
        || trimmed.contains('\\')
        || trimmed.contains("..")
        || trimmed.chars().any(|c| c.is_control())
    {
        return Err(AppError::BadRequest(
            "Invalid secret name: must be 1-160 safe characters without path separators"
                .to_string(),
        ));
    }
    Ok(trimmed.to_string())
}

pub fn validate_secret_payload_size(value: &str) -> Result<(), AppError> {
    if value.is_empty() {
        return Err(AppError::BadRequest("Secret value cannot be empty".to_string()));
    }
    if value.len() > MAX_VAULT_SECRET_BYTES {
        return Err(AppError::BadRequest(
            "Secret payload exceeds maximum 2 MiB Vault limit".to_string(),
        ));
    }
    Ok(())
}

pub fn detect_file_extension(name: &str) -> String {
    let lower = name.trim().to_ascii_lowercase();
    if lower == ".env" || lower.starts_with(".env.") {
        return "env".to_string();
    }
    if matches!(lower.as_str(), "id_rsa" | "id_ed25519" | "id_ecdsa" | "id_dsa") {
        return "key".to_string();
    }
    lower
        .rsplit_once('.')
        .map(|(_, ext)| ext.to_string())
        .filter(|ext| !ext.is_empty() && ext.len() <= 16)
        .unwrap_or_else(|| "txt".to_string())
}

pub fn classify_file_category(ext: &str) -> &'static str {
    match ext {
        "json" => "json",
        "md" | "markdown" => "markdown",
        "pem" | "key" | "pub" | "p8" | "crt" | "cer" | "asc" | "gpg" => "key_pem",
        "env" | "yaml" | "yml" | "toml" | "ini" | "conf" | "cfg" => "config",
        "jks" | "p12" | "pfx" | "keystore" | "bin" => "binary",
        _ => "text",
    }
}

pub fn content_type_for_file(ext: &str, is_binary: bool) -> &'static str {
    if is_binary {
        return "application/octet-stream";
    }
    match ext {
        "json" => "application/json; charset=utf-8",
        "md" | "markdown" => "text/markdown; charset=utf-8",
        "pem" | "key" | "crt" | "p8" => "application/x-pem-file; charset=utf-8",
        "yaml" | "yml" => "application/yaml; charset=utf-8",
        "xml" => "application/xml; charset=utf-8",
        "csv" => "text/csv; charset=utf-8",
        _ => "text/plain; charset=utf-8",
    }
}

pub fn decode_base64_str(input: &str) -> Result<Vec<u8>, AppError> {
    let clean_raw = input
        .trim()
        .strip_prefix("data:")
        .and_then(|rest| rest.split_once(',').map(|(_, b)| b))
        .unwrap_or(input.trim());

    let mut out = Vec::with_capacity((clean_raw.len() * 3) / 4);
    let mut buf: u32 = 0;
    let mut bits: u8 = 0;

    for byte in clean_raw.bytes() {
        if byte.is_ascii_whitespace() {
            continue;
        }
        if byte == b'=' {
            break;
        }
        let val = match byte {
            b'A'..=b'Z' => byte - b'A',
            b'a'..=b'z' => byte - b'a' + 26,
            b'0'..=b'9' => byte - b'0' + 52,
            b'+' => 62,
            b'/' => 63,
            _ => {
                return Err(AppError::BadRequest(
                    "Invalid base64 binary secret payload".to_string(),
                ));
            }
        };
        buf = (buf << 6) | u32::from(val);
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            out.push(((buf >> bits) & 0xff) as u8);
        }
    }
    Ok(out)
}

pub fn decode_file_payload(value: &str, encoding: &str) -> Result<Vec<u8>, AppError> {
    if encoding == "base64" {
        decode_base64_str(value)
    } else {
        Ok(value.as_bytes().to_vec())
    }
}

pub fn enrich_secret_metadata(
    name: &str,
    secret_type: &str,
    value: &str,
    existing_meta: Option<Value>,
) -> Result<Option<Value>, AppError> {
    validate_secret_payload_size(value)?;
    if secret_type != "file" {
        return Ok(existing_meta);
    }

    let mut obj = match existing_meta {
        Some(Value::Object(map)) => map,
        _ => Map::new(),
    };

    let file_name = obj
        .get("file_name")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or(name)
        .to_string();

    let ext = detect_file_extension(&file_name);
    let encoding = obj
        .get("encoding")
        .and_then(|v| v.as_str())
        .filter(|e| *e == "base64" || *e == "utf8")
        .unwrap_or("utf8")
        .to_string();

    let raw_bytes = decode_file_payload(value, &encoding)?;
    if raw_bytes.len() > MAX_VAULT_SECRET_BYTES {
        return Err(AppError::BadRequest(
            "Decoded secret file exceeds maximum 2 MiB Vault limit".to_string(),
        ));
    }

    let sha256 = hex::encode(Sha256::digest(&raw_bytes));
    let category = classify_file_category(&ext);
    let line_count = if encoding == "utf8" {
        value.lines().count()
    } else {
        0
    };

    obj.insert("file_name".to_string(), json!(file_name));
    obj.insert("file_ext".to_string(), json!(ext));
    obj.insert("file_category".to_string(), json!(category));
    obj.insert("encoding".to_string(), json!(encoding));
    obj.insert("size_bytes".to_string(), json!(raw_bytes.len()));
    obj.insert("line_count".to_string(), json!(line_count));
    obj.insert("sha256".to_string(), json!(sha256));

    if ext == "json" && encoding == "utf8" {
        let valid_json = serde_json::from_str::<Value>(value).is_ok();
        obj.insert("json_valid".to_string(), json!(valid_json));
    } else {
        obj.remove("json_valid");
    }

    Ok(Some(Value::Object(obj)))
}

pub async fn download_secret(
    State(storage): State<FileStorage>,
    Extension(ctx): Extension<AuthContext>,
    Path(id): Path<String>,
) -> Result<Response, AppError> {
    let conn = storage.vault_conn()?;
    let secret = db::vault::get_secret(&conn, &id)
        .await?
        .ok_or_else(|| AppError::NotFound(format!("Secret {id} not found")))?;

    match pam::evaluate_reveal_access(&conn, &ctx.username, &secret).await? {
        pam::AccessDecision::Allowed => {
            let plaintext_bytes = crypto::decrypt_secret(&secret.encrypted_value)?;
            let plaintext = String::from_utf8(plaintext_bytes)
                .map_err(|_| AppError::Internal("Decrypted data is not valid UTF-8".to_string()))?;

            let meta: Option<Value> = secret
                .metadata_json
                .as_deref()
                .and_then(|m| serde_json::from_str(m).ok());

            let encoding = meta
                .as_ref()
                .and_then(|m| m.get("encoding").and_then(|v| v.as_str()))
                .unwrap_or_else(|| {
                    if secret.secret_type == "keystore" {
                        "base64"
                    } else {
                        "utf8"
                    }
                });

            let is_binary = encoding == "base64" || secret.secret_type == "keystore";
            let raw_bytes = if secret.secret_type == "file" || secret.secret_type == "keystore" {
                decode_file_payload(&plaintext, encoding)?
            } else {
                plaintext.into_bytes()
            };

            let file_name = meta
                .as_ref()
                .and_then(|m| m.get("file_name").and_then(|v| v.as_str()))
                .unwrap_or(&secret.name)
                .replace('"', "");
            let ext = detect_file_extension(&file_name);
            let mime = content_type_for_file(&ext, is_binary);

            if let Some(ref audit) = storage.audit {
                audit
                    .log(
                        Some(&ctx.username),
                        "vault:DownloadSecret",
                        &format!("{}/{}", secret.environment, secret.name),
                        "success",
                        None,
                        None,
                        None,
                    )
                    .await;
            }

            let mut resp = (StatusCode::OK, raw_bytes).into_response();
            if let Ok(ct) = mime.parse() {
                resp.headers_mut().insert(header::CONTENT_TYPE, ct);
            }
            if let Ok(disp) = format!("attachment; filename=\"{file_name}\"").parse() {
                resp.headers_mut().insert(header::CONTENT_DISPOSITION, disp);
            }
            Ok(resp)
        }
        pam::AccessDecision::RequiresPamApproval { .. } => {
            Ok((StatusCode::FORBIDDEN, Json(json!({ "status": "requires_pam_approval" }))).into_response())
        }
        pam::AccessDecision::Denied { reason } => Err(AppError::Forbidden(reason)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_names_and_rejects_oversized_payloads() {
        assert!(validate_secret_name("../bad.json").is_err());
        assert!(validate_secret_name("a/b.txt").is_err());
        assert_eq!(validate_secret_name("  creds.json  ").unwrap(), "creds.json");

        let huge = "a".repeat(MAX_VAULT_SECRET_BYTES + 1);
        assert!(validate_secret_payload_size(&huge).is_err());
    }

    #[test]
    fn enriches_json_and_md_metadata_with_sha256_and_validation() {
        let json_body = r#"{"type":"service_account","project_id":"demo"}"#;
        let enriched = enrich_secret_metadata("gcp-sa.json", "file", json_body, None)
            .unwrap()
            .unwrap();
        assert_eq!(enriched["file_ext"], "json");
        assert_eq!(enriched["file_category"], "json");
        assert_eq!(enriched["encoding"], "utf8");
        assert_eq!(enriched["json_valid"], true);
        assert_eq!(enriched["size_bytes"], json_body.len());
        assert!(enriched["sha256"].as_str().unwrap().len() == 64);

        let bad_json = enrich_secret_metadata("broken.json", "file", "{not json", None)
            .unwrap()
            .unwrap();
        assert_eq!(bad_json["json_valid"], false);
    }

    #[test]
    fn decodes_base64_and_data_uri_payloads() {
        let decoded = decode_base64_str("data:application/octet-stream;base64,SGVsbG8=").unwrap();
        assert_eq!(decoded, b"Hello");
    }
}
