use super::multipart_handlers;
use super::xml::{escape_xml, s3_error};
use crate::auth::middleware::verify_s3_http;
use crate::db;
use crate::storage::{
    object_stream_ops::{open_object_byte_stream, open_object_range_stream, parse_byte_range},
    FileStorage,
};
use axum::{
    body::Body,
    extract::{Path, Request, State},
    http::{header, StatusCode},
    response::{IntoResponse, Response},
};

pub async fn head_object(
    State(storage): State<FileStorage>,
    Path((bucket, key)): Path<(String, String)>,
    request: Request,
) -> Response {
    if let Err(e) = verify_s3_http(
        &storage.db,
        &storage.config,
        &request,
        "s3:GetObject",
        &bucket,
        &key,
    )
    .await
    {
        return s3_error(
            StatusCode::FORBIDDEN,
            "AccessDenied",
            &e.to_string(),
            &key,
        );
    }

    match storage.stat_object(&bucket, &key, None).await {
        Ok(meta) => {
            let mut res = StatusCode::OK.into_response();
            let res_headers = res.headers_mut();
            res_headers.insert(header::CONTENT_LENGTH, meta.size.into());
            if let Ok(v) = meta.etag.parse() {
                res_headers.insert(header::ETAG, v);
            }
            let http_date = crate::auth::signature::format_http_date(&meta.mod_time);
            if let Ok(v) = http_date.parse() {
                res_headers.insert(header::LAST_MODIFIED, v);
            }
            if let Ok(v) = meta.content_type.parse() {
                res_headers.insert(header::CONTENT_TYPE, v);
            }
            if !meta.version_id.is_empty() {
                if let Ok(v) = meta.version_id.parse() {
                    res_headers.insert("x-amz-version-id", v);
                }
            }
            if let Some(enc) = meta.encryption_type {
                if let Ok(v) = enc.parse() {
                    res_headers.insert("x-amz-server-side-encryption", v);
                }
            }
            res
        }
        Err(e) => e.into_response(),
    }
}

pub async fn get_object(
    State(storage): State<FileStorage>,
    Path((bucket, key)): Path<(String, String)>,
    request: Request,
) -> Response {
    let headers = request.headers();
    let query_str = request.uri().query().unwrap_or("");

    let action = if query_str.contains("tagging") {
        "s3:GetObjectTagging"
    } else {
        "s3:GetObject"
    };

    let username = match verify_s3_http(
        &storage.db,
        &storage.config,
        &request,
        action,
        &bucket,
        &key,
    )
    .await
    {
        Ok(u) => u,
        Err(e) => {
            return s3_error(
                StatusCode::FORBIDDEN,
                "AccessDenied",
                &e.to_string(),
                &key,
            );
        }
    };

    if query_str.contains("tagging") {
        let conn = match storage.db.conn() {
            Ok(c) => c,
            Err(e) => return e.into_response(),
        };
        let row = db::objects::get_object(&conn, &bucket, &key, "").await;
        let mut tags_xml = String::from(
            r#"<?xml version="1.0" encoding="UTF-8"?>
<Tagging xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
    <TagSet>
"#,
        );
        if let Ok(Some(obj)) = row {
            if let Ok(tags) = db::objects::get_object_tagging(&conn, &bucket, obj.id).await {
                for (k, v) in tags {
                    tags_xml.push_str(&format!(
                        "        <Tag><Key>{}</Key><Value>{}</Value></Tag>\n",
                        escape_xml(&k),
                        escape_xml(&v),
                    ));
                }
            }
        }
        tags_xml.push_str("    </TagSet>\n</Tagging>");
        return (StatusCode::OK, [("content-type", "application/xml")], tags_xml).into_response();
    }

    let range_header = headers
        .get(header::RANGE)
        .and_then(|h| h.to_str().ok())
        .map(str::to_string);
    let version_id = get_query_param(query_str, "versionId");

    if let Ok(Some((file_path, total_len, meta))) = storage
        .resolve_raw_object_path(&bucket, &key, version_id.as_deref())
        .await
    {
        let (status, content_range, content_len, body) = if let Some(ref rh) = range_header {
            match parse_byte_range(rh, total_len) {
                Ok((start, end)) => {
                    let len = end - start + 1;
                    (
                        StatusCode::PARTIAL_CONTENT,
                        Some(format!("bytes {start}-{end}/{total_len}")),
                        len,
                        Body::from_stream(open_object_range_stream(file_path, start, len)),
                    )
                }
                Err(e) => return e.into_response(),
            }
        } else {
            (
                StatusCode::OK,
                None,
                total_len.max(0) as u64,
                Body::from_stream(open_object_byte_stream(file_path)),
            )
        };

        if let Some(ref audit) = storage.audit {
            let audit_c = audit.clone();
            let u = username.clone();
            let b = bucket.clone();
            let k = key.clone();
            tokio::spawn(async move {
                audit_c
                    .log(Some(&u), "s3:GetObject", &format!("{b}/{k}"), "success", None, None, None)
                    .await;
            });
        }

        let mut res = Response::builder()
            .status(status)
            .body(body)
            .unwrap_or_else(|_| StatusCode::INTERNAL_SERVER_ERROR.into_response());
        let res_headers = res.headers_mut();
        res_headers.insert(header::ACCEPT_RANGES, header::HeaderValue::from_static("bytes"));
        res_headers.insert(header::CONTENT_LENGTH, content_len.into());
        if let Ok(v) = meta.content_type.parse() {
            res_headers.insert(header::CONTENT_TYPE, v);
        }
        if let Ok(v) = meta.etag.parse() {
            res_headers.insert(header::ETAG, v);
        }
        let http_date = crate::auth::signature::format_http_date(&meta.mod_time);
        if let Ok(v) = http_date.parse() {
            res_headers.insert(header::LAST_MODIFIED, v);
        }
        if !meta.version_id.is_empty() {
            if let Ok(v) = meta.version_id.parse() {
                res_headers.insert("x-amz-version-id", v);
            }
        }
        if let Some(cr) = content_range {
            if let Ok(v) = cr.parse() {
                res_headers.insert(header::CONTENT_RANGE, v);
            }
        }
        if let Some(disp) = get_query_param(query_str, "response-content-disposition") {
            if let Ok(v) = disp.parse() {
                res_headers.insert(header::CONTENT_DISPOSITION, v);
            }
        } else if get_query_param(query_str, "download").as_deref() == Some("true") {
            let filename = key.split('/').next_back().unwrap_or(&key);
            let disp = format!("attachment; filename=\"{filename}\"");
            if let Ok(v) = disp.parse() {
                res_headers.insert(header::CONTENT_DISPOSITION, v);
            }
        }
        return res;
    }

    match storage
        .get_object(&bucket, &key, version_id.as_deref(), range_header.as_deref())
        .await
    {
        Ok((data, meta, content_range)) => {
            if let Some(ref audit) = storage.audit {
                let audit_c = audit.clone();
                let u = username.clone();
                let b = bucket.clone();
                let k = key.clone();
                tokio::spawn(async move {
                    audit_c.log(Some(&u), "s3:GetObject", &format!("{b}/{k}"), "success", None, None, None).await;
                });
            }
            let status = if content_range.is_some() {
                StatusCode::PARTIAL_CONTENT
            } else {
                StatusCode::OK
            };

            let mut res = (status, data).into_response();
            let res_headers = res.headers_mut();

            if let Ok(v) = meta.content_type.parse() {
                res_headers.insert(header::CONTENT_TYPE, v);
            }
            if let Ok(v) = meta.etag.parse() {
                res_headers.insert(header::ETAG, v);
            }
            let http_date = crate::auth::signature::format_http_date(&meta.mod_time);
            if let Ok(v) = http_date.parse() {
                res_headers.insert(header::LAST_MODIFIED, v);
            }
            if !meta.version_id.is_empty() {
                if let Ok(v) = meta.version_id.parse() {
                    res_headers.insert("x-amz-version-id", v);
                }
            }

            if let Some(cr) = content_range {
                if let Ok(v) = cr.parse() {
                    res_headers.insert(header::CONTENT_RANGE, v);
                }
            }

            if let Some(enc) = meta.encryption_type {
                if let Ok(v) = enc.parse() {
                    res_headers.insert("x-amz-server-side-encryption", v);
                }
            }

            if let Some(disp) = get_query_param(query_str, "response-content-disposition") {
                if let Ok(v) = disp.parse() {
                    res_headers.insert(header::CONTENT_DISPOSITION, v);
                }
            } else if get_query_param(query_str, "download").as_deref() == Some("true") {
                let filename = key.split('/').next_back().unwrap_or(&key);
                let disp = format!("attachment; filename=\"{filename}\"");
                if let Ok(v) = disp.parse() {
                    res_headers.insert(header::CONTENT_DISPOSITION, v);
                }
            }

            res
        }
        Err(e) => e.into_response(),
    }
}

pub async fn put_object(
    State(storage): State<FileStorage>,
    Path((bucket, key)): Path<(String, String)>,
    request: Request,
) -> Response {
    let headers = request.headers().clone();
    let query_str = request.uri().query().unwrap_or("").to_string();

    if let (Some(upload_id), Some(part_number_str)) = (
        get_query_param(&query_str, "uploadId"),
        get_query_param(&query_str, "partNumber"),
    ) {
        if let Ok(part_number) = part_number_str.parse::<i64>() {
            return multipart_handlers::upload_part(
                State(storage),
                Path((bucket, key)),
                upload_id,
                part_number,
                request,
            )
            .await;
        }
    }

    let action = if query_str.contains("tagging") {
        "s3:PutObjectTagging"
    } else {
        "s3:PutObject"
    };

    let username = match verify_s3_http(
        &storage.db,
        &storage.config,
        &request,
        action,
        &bucket,
        &key,
    )
    .await
    {
        Ok(u) => u,
        Err(e) => {
            return s3_error(
                StatusCode::FORBIDDEN,
                "AccessDenied",
                &e.to_string(),
                &key,
            );
        }
    };

    if query_str.contains("tagging") {
        let body_bytes = match axum::body::to_bytes(request.into_body(), 65536).await {
            Ok(b) => b,
            Err(_) => return StatusCode::BAD_REQUEST.into_response(),
        };
        let body_str = String::from_utf8_lossy(&body_bytes);
        let mut map = std::collections::HashMap::new();
        for chunk in body_str.split("<Tag>") {
            if let (Some(k_part), Some(v_part)) = (chunk.split("<Key>").nth(1), chunk.split("<Value>").nth(1)) {
                if let (Some(k), Some(v)) = (k_part.split("</Key>").next(), v_part.split("</Value>").next()) {
                    map.insert(k.to_string(), v.to_string());
                }
            }
        }
        if let Ok(conn) = storage.db.conn() {
            if let Ok(Some(obj)) = db::objects::get_object(&conn, &bucket, &key, "").await {
                let _ = db::objects::put_object_tagging(&conn, &bucket, obj.id, &map).await;
            }
        }
        return StatusCode::OK.into_response();
    }

    if let Some(copy_source) = headers.get("x-amz-copy-source").and_then(|h| h.to_str().ok()) {
        let trimmed = copy_source.trim_start_matches('/');
        if let Some((src_b, src_k)) = trimmed.split_once('/') {
            match storage.copy_object(src_b, src_k, &bucket, &key).await {
                Ok(v_id) => {
                    let mut res = StatusCode::OK.into_response();
                    res.headers_mut()
                        .insert("x-amz-version-id", v_id.parse().unwrap());
                    return res;
                }
                Err(e) => return e.into_response(),
            }
        }
    }

    let is_replicated = headers
        .get("x-gravspace-replicated")
        .and_then(|h| h.to_str().ok())
        == Some("1");
    let encryption = headers
        .get("x-amz-server-side-encryption")
        .and_then(|h| h.to_str().ok());

    let body_stream = request.into_body().into_data_stream();

    match storage
        .put_object_stream_with_options(&bucket, &key, body_stream, encryption, is_replicated)
        .await
    {
        Ok(version_id) => {
            if let Some(ref audit) = storage.audit {
                let audit_c = audit.clone();
                let u = username.clone();
                let b = bucket.clone();
                let k = key.clone();
                tokio::spawn(async move {
                    audit_c.log(Some(&u), "s3:PutObject", &format!("{b}/{k}"), "success", None, None, None).await;
                });
            }
            let mut res = StatusCode::OK.into_response();
            let res_headers = res.headers_mut();
            res_headers.insert("x-amz-version-id", version_id.parse().unwrap());
            if let Some(enc) = encryption {
                res_headers.insert("x-amz-server-side-encryption", enc.parse().unwrap());
            }
            res
        }
        Err(e) => e.into_response(),
    }
}

pub async fn delete_object(
    State(storage): State<FileStorage>,
    Path((bucket, key)): Path<(String, String)>,
    request: Request,
) -> Response {
    let headers = request.headers();
    let query_str = request.uri().query().unwrap_or("");

    if let Some(upload_id) = get_query_param(query_str, "uploadId") {
        return multipart_handlers::abort_multipart(
            State(storage),
            Path((bucket, key)),
            upload_id,
            request,
        )
        .await;
    }

    let username = match verify_s3_http(
        &storage.db,
        &storage.config,
        &request,
        "s3:DeleteObject",
        &bucket,
        &key,
    )
    .await
    {
        Ok(u) => u,
        Err(e) => {
            return s3_error(
                StatusCode::FORBIDDEN,
                "AccessDenied",
                &e.to_string(),
                &key,
            );
        }
    };

    let is_replicated = headers
        .get("x-gravspace-replicated")
        .and_then(|h| h.to_str().ok())
        == Some("1");
    let version_id = get_query_param(query_str, "versionId");
    match storage
        .delete_object_with_options(&bucket, &key, version_id.as_deref(), false, is_replicated)
        .await
    {
        Ok(_) => {
            if let Some(ref audit) = storage.audit {
                let audit_c = audit.clone();
                let u = username.clone();
                let b = bucket.clone();
                let k = key.clone();
                tokio::spawn(async move {
                    audit_c.log(Some(&u), "s3:DeleteObject", &format!("{b}/{k}"), "success", None, None, None).await;
                });
            }
            StatusCode::NO_CONTENT.into_response()
        }
        Err(e) => e.into_response(),
    }
}

fn get_query_param(query: &str, key: &str) -> Option<String> {
    for pair in query.split('&') {
        if let Some((k, v)) = pair.split_once('=') {
            if k == key {
                return Some(v.to_string());
            }
        }
    }
    None
}
