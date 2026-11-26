use std::collections::{HashMap, HashSet};
use crate::auth::signature::{calculate_signature, uri_encode};
use crate::db;
use crate::error::AppError;
use crate::storage::FileStorage;
use axum::{
    extract::{Path, Query, State},
    http::{header, HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use serde::Deserialize;
use serde_json::json;

#[derive(Deserialize)]
pub struct ListObjectsQuery {
    pub prefix: Option<String>,
    pub delimiter: Option<String>,
    pub search: Option<String>,
    pub versions: Option<bool>,
}

pub async fn list_objects(
    State(storage): State<FileStorage>,
    Path(bucket): Path<String>,
    Query(query): Query<ListObjectsQuery>,
) -> Result<Response, AppError> {
    let conn = storage.db.conn()?;
    let prefix = query.prefix.unwrap_or_default();
    let delimiter = query.delimiter.unwrap_or_default();
    let raw_objects = db::objects::list_objects(&conn, &bucket, &prefix).await?;

    let mut objects = Vec::new();
    let mut common_prefixes = Vec::new();
    let mut seen_prefixes = HashSet::new();

    for o in raw_objects {
        if let Some(ref q) = query.search {
            if !q.is_empty() && !o.key.to_lowercase().contains(&q.to_lowercase()) {
                continue;
            }
        }

        // Folder grouping with delimiter
        if !delimiter.is_empty() {
            let rel = o.key.strip_prefix(&prefix).unwrap_or(&o.key);
            if let Some((dir, _)) = rel.split_once(&delimiter) {
                let full_prefix = format!("{prefix}{dir}{delimiter}");
                if seen_prefixes.insert(full_prefix.clone()) {
                    common_prefixes.push(full_prefix);
                }
                continue;
            }
        }

        objects.push(json!({
            "Key": o.key,
            "key": o.key,
            "Size": o.size,
            "size": o.size,
            "ETag": o.etag,
            "etag": o.etag,
            "ContentType": o.content_type,
            "content_type": o.content_type,
            "ModTime": o.modified_at,
            "LastModified": o.modified_at,
            "modified_at": o.modified_at,
            "VersionID": o.version_id,
            "version_id": o.version_id,
            "IsLatest": o.is_latest,
            "is_latest": o.is_latest,
            "LockMode": o.lock_mode,
            "lock_mode": o.lock_mode,
            "LockUntil": o.retain_until_date,
            "lock_until": o.retain_until_date,
            "LegalHold": o.legal_hold,
            "legal_hold": o.legal_hold,
        }));
    }

    let mut versions = Vec::new();
    if query.versions == Some(true) {
        let raw_versions = db::objects::list_object_versions(&conn, &bucket, &prefix).await?;
        for v in raw_versions {
            if let Some(ref q) = query.search {
                if !q.is_empty() && !v.key.to_lowercase().contains(&q.to_lowercase()) {
                    continue;
                }
            }
            versions.push(json!({
                "Key": v.key,
                "key": v.key,
                "Size": v.size,
                "size": v.size,
                "ETag": v.etag,
                "etag": v.etag,
                "ContentType": v.content_type,
                "content_type": v.content_type,
                "ModTime": v.modified_at,
                "LastModified": v.modified_at,
                "modified_at": v.modified_at,
                "VersionID": v.version_id,
                "version_id": v.version_id,
                "IsLatest": v.is_latest,
                "is_latest": v.is_latest,
                "LockMode": v.lock_mode,
                "lock_mode": v.lock_mode,
                "LockUntil": v.retain_until_date,
                "lock_until": v.retain_until_date,
                "LegalHold": v.legal_hold,
                "legal_hold": v.legal_hold,
            }));
        }
    }

    Ok((
        StatusCode::OK,
        Json(json!({
            "objects": objects,
            "versions": versions,
            "common_prefixes": common_prefixes,
        })),
    )
        .into_response())
}

#[derive(Deserialize, Default)]
pub struct ObjectVersionQuery {
    pub version_id: Option<String>,
    #[serde(rename = "versionId")]
    pub version_id_camel: Option<String>,
}

pub async fn get_object(
    State(storage): State<FileStorage>,
    Path((bucket, key)): Path<(String, String)>,
    Query(query): Query<ObjectVersionQuery>,
) -> Result<Response, AppError> {
    let vid = query.version_id.as_deref().or(query.version_id_camel.as_deref());
    let (data, meta, _) = storage.get_object(&bucket, &key, vid, None).await?;
    let content_type = if meta.content_type.is_empty() || meta.content_type == "application/octet-stream" {
        mime_guess::from_path(&key)
            .first_or_octet_stream()
            .to_string()
    } else {
        meta.content_type
    };

    let mut res = (StatusCode::OK, data).into_response();
    if let Ok(val) = content_type.parse() {
        res.headers_mut().insert(header::CONTENT_TYPE, val);
    }
    if !meta.etag.is_empty() {
        if let Ok(val) = format!("\"{}\"", meta.etag).parse() {
            res.headers_mut().insert(header::ETAG, val);
        }
    }
    if let Ok(val) = "public, max-age=3600".parse() {
        res.headers_mut().insert(header::CACHE_CONTROL, val);
    }
    Ok(res)
}

pub async fn download_object(
    State(storage): State<FileStorage>,
    Path((bucket, key)): Path<(String, String)>,
    Query(query): Query<ObjectVersionQuery>,
) -> Result<Response, AppError> {
    let vid = query.version_id.as_deref().or(query.version_id_camel.as_deref());
    let (data, meta, _) = storage.get_object(&bucket, &key, vid, None).await?;
    let filename = key.split('/').last().unwrap_or(&key);
    let content_type = if meta.content_type.is_empty() || meta.content_type == "application/octet-stream" {
        mime_guess::from_path(&key)
            .first_or_octet_stream()
            .to_string()
    } else {
        meta.content_type
    };

    let mut res = (StatusCode::OK, data).into_response();
    if let Ok(val) = content_type.parse() {
        res.headers_mut().insert(header::CONTENT_TYPE, val);
    }
    if let Ok(val) = format!("attachment; filename=\"{filename}\"").parse() {
        res.headers_mut().insert(header::CONTENT_DISPOSITION, val);
    }
    if !meta.etag.is_empty() {
        if let Ok(val) = format!("\"{}\"", meta.etag).parse() {
            res.headers_mut().insert(header::ETAG, val);
        }
    }
    Ok(res)
}

fn is_replicated_request(headers: &HeaderMap) -> bool {
    headers
        .get("x-gravspace-replicated")
        .and_then(|v| v.to_str().ok())
        == Some("1")
}

pub async fn put_object(
    State(storage): State<FileStorage>,
    Path((bucket, key)): Path<(String, String)>,
    headers: HeaderMap,
    body: axum::body::Bytes,
) -> Result<Response, AppError> {
    let clean_key = key.trim_start_matches('/');
    if clean_key.ends_with("/lock") || clean_key.ends_with("/legal-hold") {
        return Err(AppError::BadRequest(
            "Invalid object key: suffix reserved for object controls".to_string(),
        ));
    }
    let version_id = storage
        .put_object_with_options(&bucket, &key, body.to_vec(), None, is_replicated_request(&headers))
        .await?;
    if let Some(ref audit) = storage.audit {
        audit.log(Some("admin"), "s3:PutObject", &format!("{bucket}/{key}"), "success", None, None, None).await;
    }
    Ok((StatusCode::OK, Json(json!({ "version_id": version_id }))).into_response())
}

pub async fn delete_object(
    State(storage): State<FileStorage>,
    Path((bucket, key)): Path<(String, String)>,
    headers: HeaderMap,
    Query(query): Query<ObjectVersionQuery>,
) -> Result<Response, AppError> {
    let vid = query.version_id.or(query.version_id_camel);
    storage
        .delete_object_with_options(&bucket, &key, vid.as_deref(), false, is_replicated_request(&headers))
        .await?;
    if let Some(ref audit) = storage.audit {
        audit.log(Some("admin"), "s3:DeleteObject", &format!("{bucket}/{key}"), "success", None, None, None).await;
    }
    Ok((StatusCode::OK, Json(json!({ "success": true }))).into_response())
}

#[derive(Deserialize)]
pub struct BulkDeletePayload {
    pub keys: Vec<String>,
}

pub async fn bulk_delete_objects(
    State(storage): State<FileStorage>,
    Path(bucket): Path<String>,
    Json(payload): Json<BulkDeletePayload>,
) -> Result<Response, AppError> {
    let mut deleted_count = 0;
    for k in &payload.keys {
        if storage.delete_object(&bucket, k, None, false).await.is_ok() {
            deleted_count += 1;
        }
    }
    if let Some(ref audit) = storage.audit {
        audit
            .log(
                Some("admin"),
                "s3:BulkDeleteObjects",
                &format!("{bucket}: {} keys", payload.keys.len()),
                "success",
                None,
                None,
                None,
            )
            .await;
    }
    Ok((
        StatusCode::OK,
        Json(json!({ "success": true, "deleted_count": deleted_count })),
    )
        .into_response())
}

#[derive(Deserialize)]
pub struct CopyPayload {
    pub source_bucket: String,
    pub source_key: String,
    pub destination_key: String,
}

pub async fn copy_objects(
    State(storage): State<FileStorage>,
    Path(bucket): Path<String>,
    Json(payload): Json<CopyPayload>,
) -> Result<Response, AppError> {
    let version_id = storage
        .copy_object(
            &payload.source_bucket,
            &payload.source_key,
            &bucket,
            &payload.destination_key,
        )
        .await?;
    Ok((StatusCode::OK, Json(json!({ "version_id": version_id }))).into_response())
}

#[derive(Deserialize)]
pub struct SharePayload {
    pub key: String,
    pub expires_in: Option<i64>,
}

pub async fn share_object(
    State(storage): State<FileStorage>,
    Path(bucket): Path<String>,
    Json(payload): Json<SharePayload>,
) -> Result<Response, AppError> {
    let expires_in = payload.expires_in.unwrap_or(3600);
    let now = chrono::Utc::now();
    let date_stamp = now.format("%Y%m%d").to_string();
    let amz_date = now.format("%Y%m%dT%H%M%SZ").to_string();

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
    let path = format!("/{bucket}/{}", payload.key.trim_start_matches('/'));

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
        "GET\n{path}\n{canonical_query_str}\n{canonical_headers}\nhost\nUNSIGNED-PAYLOAD"
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
        &bucket,
        &payload.key,
        &presigned_url,
        &signature,
        "GET",
        &expires_at,
        None,
        false,
    )
    .await;

    Ok((StatusCode::OK, Json(json!({ "url": presigned_url }))).into_response())
}

#[derive(Deserialize)]
pub struct VersionQuery {
    #[serde(rename = "versionId")]
    pub version_id: Option<String>,
}

pub async fn get_object_tagging(
    State(storage): State<FileStorage>,
    Path((bucket, key)): Path<(String, String)>,
    Query(query): Query<VersionQuery>,
) -> Result<Response, AppError> {
    let conn = storage.db.conn()?;
    let key = key.trim_start_matches('/');
    let version_id = query.version_id.as_deref().unwrap_or("");
    let obj = db::objects::get_object(&conn, &bucket, key, version_id).await?;
    if let Some(obj) = obj {
        let tags = db::objects::get_object_tagging(&conn, &bucket, obj.id).await?;
        Ok((StatusCode::OK, Json(tags)).into_response())
    } else {
        Ok((StatusCode::OK, Json(HashMap::<String, String>::new())).into_response())
    }
}

pub async fn put_object_tagging(
    State(storage): State<FileStorage>,
    Path((bucket, key)): Path<(String, String)>,
    Query(query): Query<VersionQuery>,
    Json(tags): Json<HashMap<String, String>>,
) -> Result<Response, AppError> {
    let conn = storage.db.conn()?;
    let key = key.trim_start_matches('/');
    let version_id = query.version_id.as_deref().unwrap_or("");
    let obj = db::objects::get_object(&conn, &bucket, key, version_id).await?;
    if let Some(obj) = obj {
        db::objects::put_object_tagging(&conn, &bucket, obj.id, &tags).await?;
        Ok((StatusCode::OK, Json(json!({ "success": true }))).into_response())
    } else {
        Err(AppError::NotFound("Object not found".to_string()))
    }
}

pub use super::object_lock_handlers::{set_object_legal_hold, set_object_retention};
