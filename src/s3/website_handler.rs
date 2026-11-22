use crate::storage::FileStorage;
use axum::{
    extract::{Path, State},
    http::{header, StatusCode},
    response::{IntoResponse, Response},
};
use serde::Deserialize;

#[derive(Debug, Deserialize)]
struct WebsiteConfig {
    #[serde(alias = "IndexDocument", alias = "index_document")]
    index_document: Option<IndexDoc>,
    #[serde(alias = "ErrorDocument", alias = "error_document")]
    error_document: Option<ErrorDoc>,
}

#[derive(Debug, Deserialize)]
struct IndexDoc {
    #[serde(alias = "Suffix", alias = "suffix")]
    suffix: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ErrorDoc {
    #[serde(alias = "Key", alias = "key")]
    key: Option<String>,
}

pub async fn serve_website_root(
    State(storage): State<FileStorage>,
    Path(bucket): Path<String>,
) -> Response {
    serve_website(State(storage), Path((bucket, String::new()))).await
}

pub async fn serve_website(
    State(storage): State<FileStorage>,
    Path((bucket, key)): Path<(String, String)>,
) -> Response {
    let website_cfg = match storage.get_bucket_website(&bucket).await {
        Ok(Some(s)) if !s.is_empty() => serde_json::from_str::<WebsiteConfig>(&s).ok(),
        _ => None,
    };

    let cfg = match website_cfg {
        Some(c) => c,
        None => {
            return (
                StatusCode::NOT_FOUND,
                format!("Website hosting is not enabled for bucket '{bucket}'"),
            )
                .into_response();
        }
    };

    let index_suffix = cfg
        .index_document
        .as_ref()
        .and_then(|d| d.suffix.clone())
        .unwrap_or_else(|| "index.html".to_string());

    let error_key = cfg
        .error_document
        .as_ref()
        .and_then(|d| d.key.clone())
        .unwrap_or_else(|| "error.html".to_string());

    let target_key = if key.is_empty() || key.ends_with('/') {
        format!("{key}{index_suffix}")
    } else {
        key
    };

    match storage.get_object(&bucket, &target_key, None, None).await {
        Ok((data, meta, _)) => {
            let mut res = (StatusCode::OK, data).into_response();
            res.headers_mut()
                .insert(header::CONTENT_TYPE, meta.content_type.parse().unwrap());
            res
        }
        Err(_) => {
            // Try serving custom error document
            if let Ok((err_data, meta, _)) = storage.get_object(&bucket, &error_key, None, None).await {
                let mut res = (StatusCode::NOT_FOUND, err_data).into_response();
                res.headers_mut()
                    .insert(header::CONTENT_TYPE, meta.content_type.parse().unwrap());
                res
            } else {
                (StatusCode::NOT_FOUND, "404 Not Found").into_response()
            }
        }
    }
}
