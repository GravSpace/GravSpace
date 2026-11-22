use axum::{response::IntoResponse, routing::get, Router};

pub fn health_router() -> Router {
    Router::new()
        .route("/live", get(liveness))
        .route("/ready", get(readiness))
        .route("/startup", get(startup))
}

async fn liveness() -> impl IntoResponse {
    "OK"
}

async fn readiness() -> impl IntoResponse {
    "OK"
}

async fn startup() -> impl IntoResponse {
    "OK"
}
