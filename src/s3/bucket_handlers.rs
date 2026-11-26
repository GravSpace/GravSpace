use super::xml::{
    s3_error, s3_xml_response, BucketItem, BucketsContainer, CommonPrefixItem, DeleteErrorXml,
    DeleteObjectsRequest, DeleteResultXml, DeletedObjectXml, ListAllMyBucketsResult,
    ListBucketResult, ObjectItem, Owner,
};
use crate::auth::middleware::verify_s3_http;
use crate::db;
use crate::storage::FileStorage;
use axum::{
    extract::{Path, Request, State},
    http::StatusCode,
    response::{IntoResponse, Response},
};
use std::collections::HashSet;

pub async fn list_buckets(
    State(storage): State<FileStorage>,
    request: Request,
) -> Response {
    if let Err(e) = verify_s3_http(
        &storage.db,
        &storage.config,
        &request,
        "s3:ListAllMyBuckets",
        "",
        "",
    )
    .await
    {
        return s3_error(
            StatusCode::FORBIDDEN,
            "AccessDenied",
            &e.to_string(),
            "",
        );
    }

    match storage.list_buckets().await {
        Ok(buckets) => {
            let items: Vec<BucketItem> = buckets
                .into_iter()
                .map(|name| BucketItem {
                    name,
                    creation_date: chrono::Utc::now().to_rfc3339(),
                })
                .collect();

            let res = ListAllMyBucketsResult {
                owner: Owner {
                    id: "admin".to_string(),
                    display_name: "admin".to_string(),
                },
                buckets: BucketsContainer { bucket: items },
            };
            s3_xml_response(StatusCode::OK, &res)
        }
        Err(e) => e.into_response(),
    }
}

use axum::body::to_bytes;
use axum::http::header;

pub async fn head_bucket(
    State(storage): State<FileStorage>,
    Path(bucket): Path<String>,
    request: Request,
) -> Response {
    let actor = match verify_s3_http(
        &storage.db,
        &storage.config,
        &request,
        "s3:ListBucket",
        &bucket,
        "",
    )
    .await
    {
        Ok(u) => u,
        Err(e) => {
            return s3_error(
                StatusCode::FORBIDDEN,
                "AccessDenied",
                &e.to_string(),
                &bucket,
            );
        }
    };

    if storage.bucket_exists(&bucket).await {
        storage
            .record_inbound_from_headers(request.headers(), &bucket, &actor)
            .await;
        (
            StatusCode::OK,
            [
                ("x-amz-bucket-region", "us-east-1"),
                ("content-type", "application/xml"),
            ],
            "",
        )
            .into_response()
    } else {
        (
            StatusCode::NOT_FOUND,
            [
                ("x-amz-bucket-region", "us-east-1"),
                ("content-type", "application/xml"),
            ],
            "",
        )
            .into_response()
    }
}

pub async fn put_bucket(
    State(storage): State<FileStorage>,
    Path(bucket): Path<String>,
    request: Request,
) -> Response {
    let query_str = request.uri().query().unwrap_or("");

    let action = if query_str.contains("versioning") {
        "s3:PutBucketVersioning"
    } else if query_str.contains("cors") {
        "s3:PutBucketCORS"
    } else {
        "s3:CreateBucket"
    };

    if let Err(e) =
        verify_s3_http(&storage.db, &storage.config, &request, action, &bucket, "").await
    {
        return s3_error(
            StatusCode::FORBIDDEN,
            "AccessDenied",
            &e.to_string(),
            &bucket,
        );
    }

    let conn = match storage.db.conn() {
        Ok(c) => c,
        Err(e) => return e.into_response(),
    };

    if query_str.contains("versioning") {
        let body_bytes = match to_bytes(request.into_body(), 65536).await {
            Ok(b) => b,
            Err(_) => return StatusCode::BAD_REQUEST.into_response(),
        };
        let body_str = String::from_utf8_lossy(&body_bytes);
        let enabled = body_str.contains("<Status>Enabled</Status>");
        let _ = db::buckets::set_bucket_versioning(&conn, &bucket, enabled).await;
        return StatusCode::OK.into_response();
    }

    if query_str.contains("cors") {
        let body_bytes = match to_bytes(request.into_body(), 65536).await {
            Ok(b) => b,
            Err(_) => return StatusCode::BAD_REQUEST.into_response(),
        };
        let body_str = String::from_utf8_lossy(&body_bytes);
        let _ = storage.set_bucket_cors(&bucket, &body_str).await;
        return StatusCode::OK.into_response();
    }

    match storage.create_bucket(&bucket).await {
        Ok(_) => (
            StatusCode::OK,
            [
                (header::LOCATION, format!("/{bucket}")),
                ("x-amz-bucket-region".parse().unwrap(), "us-east-1".parse().unwrap()),
            ],
            "",
        )
            .into_response(),
        Err(e) => e.into_response(),
    }
}

pub async fn delete_bucket(
    State(storage): State<FileStorage>,
    Path(bucket): Path<String>,
    request: Request,
) -> Response {
    if let Err(e) = verify_s3_http(
        &storage.db,
        &storage.config,
        &request,
        "s3:DeleteBucket",
        &bucket,
        "",
    )
    .await
    {
        return s3_error(
            StatusCode::FORBIDDEN,
            "AccessDenied",
            &e.to_string(),
            &bucket,
        );
    }

    let query_str = request.uri().query().unwrap_or("");
    if query_str.contains("cors") {
        let _ = storage.delete_bucket_cors(&bucket).await;
        return StatusCode::NO_CONTENT.into_response();
    }

    match storage.delete_bucket(&bucket).await {
        Ok(_) => StatusCode::NO_CONTENT.into_response(),
        Err(e) => e.into_response(),
    }
}

pub async fn get_bucket(
    State(storage): State<FileStorage>,
    Path(bucket): Path<String>,
    request: Request,
) -> Response {
    let query_str = request.uri().query().unwrap_or("");

    let action = if query_str.contains("versioning") {
        "s3:GetBucketVersioning"
    } else if query_str.contains("cors") {
        "s3:GetBucketCORS"
    } else if query_str.contains("location") {
        "s3:GetBucketLocation"
    } else {
        "s3:ListBucket"
    };

    if let Err(e) =
        verify_s3_http(&storage.db, &storage.config, &request, action, &bucket, "").await
    {
        return s3_error(
            StatusCode::FORBIDDEN,
            "AccessDenied",
            &e.to_string(),
            &bucket,
        );
    }

    if !storage.bucket_exists(&bucket).await {
        return s3_error(
            StatusCode::NOT_FOUND,
            "NoSuchBucket",
            "The specified bucket does not exist",
            &bucket,
        );
    }

    let conn = match storage.db.conn() {
        Ok(c) => c,
        Err(e) => return e.into_response(),
    };

    if query_str.contains("location") {
        let xml = r#"<?xml version="1.0" encoding="UTF-8"?>
<LocationConstraint xmlns="http://s3.amazonaws.com/doc/2006-03-01/">us-east-1</LocationConstraint>"#;
        return (StatusCode::OK, [("content-type", "application/xml")], xml).into_response();
    }

    if query_str.contains("versioning") {
        let is_v = db::buckets::get_bucket_versioning(&conn, &bucket).await.unwrap_or(false);
        let status = if is_v { "Enabled" } else { "Suspended" };
        let xml = format!(
            r#"<?xml version="1.0" encoding="UTF-8"?>
<VersioningConfiguration xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
    <Status>{status}</Status>
</VersioningConfiguration>"#
        );
        return (StatusCode::OK, [("content-type", "application/xml")], xml).into_response();
    }

    if query_str.contains("cors") {
        if let Ok(Some(cors_str)) = storage.get_bucket_cors(&bucket).await {
            if !cors_str.is_empty() {
                if cors_str.trim().starts_with('<') {
                    return (StatusCode::OK, [("content-type", "application/xml")], cors_str).into_response();
                }
                if let Ok(rules) = serde_json::from_str::<Vec<serde_json::Value>>(&cors_str) {
                    let mut xml = String::from("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<CORSConfiguration xmlns=\"http://s3.amazonaws.com/doc/2006-03-01/\">\n");
                    for r in rules {
                        xml.push_str("  <CORSRule>\n");
                        if let Some(origins) = r.get("allowed_origins").and_then(|v| v.as_array()) {
                            for o in origins {
                                if let Some(os) = o.as_str() {
                                    xml.push_str(&format!("    <AllowedOrigin>{os}</AllowedOrigin>\n"));
                                }
                            }
                        }
                        if let Some(methods) = r.get("allowed_methods").and_then(|v| v.as_array()) {
                            for m in methods {
                                if let Some(ms) = m.as_str() {
                                    xml.push_str(&format!("    <AllowedMethod>{ms}</AllowedMethod>\n"));
                                }
                            }
                        }
                        if let Some(headers) = r.get("allowed_headers").and_then(|v| v.as_array()) {
                            for h in headers {
                                if let Some(hs) = h.as_str() {
                                    xml.push_str(&format!("    <AllowedHeader>{hs}</AllowedHeader>\n"));
                                }
                            }
                        }
                        if let Some(exposes) = r.get("expose_headers").and_then(|v| v.as_array()) {
                            for eh in exposes {
                                if let Some(ehs) = eh.as_str() {
                                    xml.push_str(&format!("    <ExposeHeader>{ehs}</ExposeHeader>\n"));
                                }
                            }
                        }
                        if let Some(max_age) = r.get("max_age_seconds").and_then(|v| v.as_i64()) {
                            xml.push_str(&format!("    <MaxAgeSeconds>{max_age}</MaxAgeSeconds>\n"));
                        }
                        xml.push_str("  </CORSRule>\n");
                    }
                    xml.push_str("</CORSConfiguration>");
                    return (StatusCode::OK, [("content-type", "application/xml")], xml).into_response();
                }
            }
        }
        return s3_error(
            StatusCode::NOT_FOUND,
            "NoSuchCORSConfiguration",
            "The CORS configuration does not exist",
            &bucket,
        );
    }

    let prefix = get_query_param(query_str, "prefix").unwrap_or_default();
    let delimiter = get_query_param(query_str, "delimiter").unwrap_or_default();

    let objects = match db::objects::list_objects(&conn, &bucket, &prefix).await {
        Ok(objs) => objs,
        Err(e) => return e.into_response(),
    };

    let mut contents = Vec::new();
    let mut common_prefixes = Vec::new();
    let mut seen_prefixes = HashSet::new();

    for obj in objects {
        if !delimiter.is_empty() {
            let rel = obj.key.strip_prefix(&prefix).unwrap_or(&obj.key);
            if let Some((dir, _)) = rel.split_once(&delimiter) {
                let full_prefix = format!("{prefix}{dir}{delimiter}");
                if seen_prefixes.insert(full_prefix.clone()) {
                    common_prefixes.push(CommonPrefixItem {
                        prefix: full_prefix,
                    });
                }
                continue;
            }
        }

        let mod_time = obj.modified_at.replace(' ', "T");
        let formatted_mod = if mod_time.ends_with('Z') {
            mod_time
        } else {
            format!("{mod_time}Z")
        };

        contents.push(ObjectItem {
            key: obj.key,
            last_modified: formatted_mod,
            etag: obj.etag.unwrap_or_default(),
            size: obj.size,
            storage_class: "STANDARD".to_string(),
        });
    }

    let res = ListBucketResult {
        name: bucket,
        prefix,
        marker: String::new(),
        max_keys: 1000,
        is_truncated: false,
        contents,
        common_prefixes,
    };

    s3_xml_response(StatusCode::OK, &res)
}

pub async fn delete_objects(
    State(storage): State<FileStorage>,
    Path(bucket): Path<String>,
    request: Request,
) -> Response {
    let username = match verify_s3_http(
        &storage.db,
        &storage.config,
        &request,
        "s3:DeleteObject",
        &bucket,
        "",
    )
    .await
    {
        Ok(u) => u,
        Err(e) => {
            return s3_error(
                StatusCode::FORBIDDEN,
                "AccessDenied",
                &e.to_string(),
                &bucket,
            );
        }
    };

    let body_bytes = match to_bytes(request.into_body(), 2 * 1024 * 1024).await {
        Ok(b) => b,
        Err(e) => return s3_error(StatusCode::BAD_REQUEST, "MalformedXML", &e.to_string(), &bucket),
    };

    let payload: DeleteObjectsRequest = match quick_xml::de::from_reader(body_bytes.as_ref()) {
        Ok(p) => p,
        Err(e) => return s3_error(StatusCode::BAD_REQUEST, "MalformedXML", &e.to_string(), &bucket),
    };

    let mut deleted = Vec::new();
    let mut errors = Vec::new();

    for item in payload.objects {
        let vid = item.version_id.as_deref();
        match storage.delete_object(&bucket, &item.key, vid, false).await {
            Ok(_) => {
                if !payload.quiet {
                    deleted.push(DeletedObjectXml {
                        key: item.key,
                        version_id: item.version_id,
                    });
                }
            }
            Err(err) => {
                errors.push(DeleteErrorXml {
                    key: item.key,
                    code: "AccessDenied".to_string(),
                    message: err.to_string(),
                });
            }
        }
    }

    if let Some(ref audit) = storage.audit {
        audit
            .log(
                Some(&username),
                "s3:DeleteObjects",
                &format!("{bucket}: {} deleted, {} errors", deleted.len(), errors.len()),
                "success",
                None,
                None,
                None,
            )
            .await;
    }

    s3_xml_response(StatusCode::OK, &DeleteResultXml { deleted, errors })
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
