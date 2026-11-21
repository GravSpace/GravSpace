use super::{bucket_handlers, multipart_handlers, object_handlers, website_handler};
use crate::storage::FileStorage;
use axum::{
    extract::{Path, Request, State},
    response::Response,
    routing::get,
    Router,
};

pub fn s3_router(storage: FileStorage) -> Router {
    Router::new()
        .route("/website/{bucket}", get(website_handler::serve_website_root))
        .route("/website/{bucket}/", get(website_handler::serve_website_root))
        .route(
            "/website/{bucket}/{*key}",
            get(website_handler::serve_website),
        )
        .route("/", get(bucket_handlers::list_buckets))
        .route(
            "/{bucket}",
            get(bucket_handlers::get_bucket)
                .head(bucket_handlers::head_bucket)
                .put(bucket_handlers::put_bucket)
                .delete(bucket_handlers::delete_bucket)
                .post(post_bucket_dispatcher),
        )
        .route(
            "/{bucket}/",
            get(bucket_handlers::get_bucket)
                .head(bucket_handlers::head_bucket)
                .put(bucket_handlers::put_bucket)
                .delete(bucket_handlers::delete_bucket)
                .post(post_bucket_dispatcher),
        )
        .route(
            "/{bucket}/{*key}",
            get(object_handlers::get_object)
                .head(object_handlers::head_object)
                .put(object_handlers::put_object)
                .delete(object_handlers::delete_object)
                .post(post_object_dispatcher),
        )
        .layer(axum::extract::DefaultBodyLimit::disable())
        .with_state(storage)
}

async fn post_bucket_dispatcher(
    State(storage): State<FileStorage>,
    Path(bucket): Path<String>,
    request: Request,
) -> Response {
    bucket_handlers::get_bucket(State(storage), Path(bucket), request).await
}

async fn post_object_dispatcher(
    State(storage): State<FileStorage>,
    Path((bucket, key)): Path<(String, String)>,
    request: Request,
) -> Response {
    let query_str = request.uri().query().unwrap_or("");
    if query_str == "uploads" || query_str.starts_with("uploads&") {
        multipart_handlers::initiate_multipart(State(storage), Path((bucket, key)), request).await
    } else if let Some(upload_id) = get_query_param(query_str, "uploadId") {
        multipart_handlers::complete_multipart(
            State(storage),
            Path((bucket, key)),
            upload_id,
            request,
        )
        .await
    } else {
        object_handlers::put_object(State(storage), Path((bucket, key)), request).await
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
