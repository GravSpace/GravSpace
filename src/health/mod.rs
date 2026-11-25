use axum::{response::IntoResponse, routing::get, Router};

pub fn health_router() -> Router {
    Router::new()
        .route("/", get(liveness))
        .route("/live", get(liveness))
        .route("/ready", get(readiness))
        .route("/startup", get(startup))
}

pub async fn liveness() -> impl IntoResponse {
    "OK"
}

pub async fn readiness() -> impl IntoResponse {
    "OK"
}

pub async fn startup() -> impl IntoResponse {
    "OK"
}
