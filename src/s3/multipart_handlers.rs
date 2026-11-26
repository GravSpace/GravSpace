use super::xml::{
    s3_error, s3_xml_response, CompleteMultipartUploadPayload, CompleteMultipartUploadResult,
    InitiateMultipartUploadResult,
};
use crate::auth::middleware::verify_s3_http;
use crate::storage::FileStorage;
use axum::{
    extract::{Path, Request, State},
    http::StatusCode,
    response::{IntoResponse, Response},
};

pub async fn initiate_multipart(
    State(storage): State<FileStorage>,
    Path((bucket, key)): Path<(String, String)>,
    request: Request,
) -> Response {
    if let Err(e) =
        verify_s3_http(&storage.db, &storage.config, &request, "s3:PutObject", &bucket, &key)
            .await
    {
        return e.into_response();
    }

    match storage.initiate_multipart_upload(&bucket, &key).await {
        Ok(upload_id) => {
            let res = InitiateMultipartUploadResult {
                bucket,
                key,
                upload_id,
            };
            s3_xml_response(StatusCode::OK, &res)
        }
        Err(e) => e.into_response(),
    }
}

pub async fn upload_part(
    State(storage): State<FileStorage>,
    Path((bucket, key)): Path<(String, String)>,
    upload_id: String,
    part_number: i64,
    request: Request,
) -> Response {
    if let Err(e) =
        verify_s3_http(&storage.db, &storage.config, &request, "s3:PutObject", &bucket, &key)
            .await
    {
        return e.into_response();
    }

    let body_stream = request.into_body().into_data_stream();

    match storage
        .upload_part_stream(&bucket, &key, &upload_id, part_number, body_stream)
        .await
    {
        Ok(etag) => {
            let mut res = StatusCode::OK.into_response();
            res.headers_mut().insert("ETag", etag.parse().unwrap());
            res
        }
        Err(e) => e.into_response(),
    }
}

pub async fn complete_multipart(
    State(storage): State<FileStorage>,
    Path((bucket, key)): Path<(String, String)>,
    upload_id: String,
    request: Request,
) -> Response {
    if let Err(e) =
        verify_s3_http(&storage.db, &storage.config, &request, "s3:PutObject", &bucket, &key)
            .await
    {
        return e.into_response();
    }

    let body_bytes = match axum::body::to_bytes(request.into_body(), 5 * 1024 * 1024).await {
        Ok(b) => b,
        Err(e) => return s3_error(StatusCode::BAD_REQUEST, "MalformedXML", &e.to_string(), &key),
    };

    let payload: CompleteMultipartUploadPayload = match quick_xml::de::from_reader(body_bytes.as_ref()) {
        Ok(p) => p,
        Err(e) => return s3_error(StatusCode::BAD_REQUEST, "MalformedXML", &e.to_string(), &key),
    };

    let parts = payload
        .parts
        .into_iter()
        .map(|p| (p.part_number, p.etag))
        .collect();

    match storage
        .complete_multipart_upload(&bucket, &key, &upload_id, parts)
        .await
    {
        Ok(version_id) => {
            let location = format!("/{bucket}/{key}");
            let res = CompleteMultipartUploadResult {
                location,
                bucket,
                key,
                etag: format!("\"{version_id}\""),
            };
            s3_xml_response(StatusCode::OK, &res)
        }
        Err(e) => e.into_response(),
    }
}

pub async fn abort_multipart(
    State(storage): State<FileStorage>,
    Path((bucket, key)): Path<(String, String)>,
    upload_id: String,
    request: Request,
) -> Response {
    if let Err(e) = verify_s3_http(
        &storage.db,
        &storage.config,
        &request,
        "s3:AbortMultipartUpload",
        &bucket,
        &key,
    )
    .await
    {
        return e.into_response();
    }

    match storage.abort_multipart_upload(&bucket, &key, &upload_id).await {
        Ok(_) => StatusCode::NO_CONTENT.into_response(),
        Err(e) => e.into_response(),
    }
}
