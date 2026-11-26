use crate::admin::federation_handlers::broadcast_federation_event;
use crate::db;
use crate::error::AppError;
use crate::storage::FileStorage;
use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde::Deserialize;
use serde_json::json;

#[derive(Deserialize)]
pub struct InboundFilterQuery {
    pub bucket: Option<String>,
}

/// Lists inbound federation bindings recorded by this node as a replication target.
pub async fn list_inbound_shares(
    State(storage): State<FileStorage>,
    Query(query): Query<InboundFilterQuery>,
) -> Result<Response, AppError> {
    let conn = storage.federation_conn()?;
    let list = db::federation_inbound::list_inbound_shares(
        &conn,
        query.bucket.as_deref().map(str::trim).filter(|s| !s.is_empty()),
    )
    .await?;
    Ok((StatusCode::OK, Json(list)).into_response())
}

/// Dismisses a stale inbound federation binding on this target node.
pub async fn delete_inbound_share(
    State(storage): State<FileStorage>,
    Path(id): Path<i64>,
) -> Result<Response, AppError> {
    let conn = storage.federation_conn()?;
    db::federation_inbound::delete_inbound_share(&conn, id).await?;
    broadcast_federation_event("shares_changed", json!({ "action": "inbound_dismissed", "id": id }));
    Ok((StatusCode::OK, Json(json!({ "success": true }))).into_response())
}

#[cfg(test)]
mod router_tests {
    use super::*;
    use crate::audit::AuditLogger;
    use crate::MemoryCache;
    use crate::config::Config;
    use crate::db::Database;
    use axum::body::Body;
    use axum::http::Request;
    use std::sync::Arc;
    use tower::ServiceExt;

    #[tokio::test]
    async fn inbound_federation_routes_respond_when_authenticated() {
        let dir = std::env::temp_dir().join(format!("grav_inb_rt_{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).expect("tempdir");
        let turso = Database::open_turso(dir.join("meta.db").to_str().expect("p")).await.expect("turso");
        let vault = Database::open_vault(dir.join("vault.db").to_str().expect("p")).await.expect("vault");
        let fed = Database::open_federation(dir.join("fed.db").to_str().expect("p")).await.expect("fed");
        let mut cfg = Config::load();
        cfg.redis_url = None;
        let cfg = Arc::new(cfg);
        let audit = Arc::new(AuditLogger::new(dir.join("audit.log"), turso.clone()));
        let storage = FileStorage::new(
            dir.join("data"),
            turso,
            vault,
            fed,
            Arc::new(MemoryCache::default()),
            cfg.clone(),
            Some(audit.clone()),
        );
        let token = crate::auth::jwt::create_jwt("admin", &cfg.jwt_secret).expect("jwt");
        let app = crate::admin::routes::admin_router(storage, cfg, audit);

        let get_req = Request::builder()
            .method("GET")
            .uri("/api/admin/federation/inbound")
            .header("authorization", format!("Bearer {token}"))
            .body(Body::empty())
            .expect("req");
        let get_res = app.clone().oneshot(get_req).await.expect("get res");
        assert_eq!(get_res.status(), StatusCode::OK);

        let del_req = Request::builder()
            .method("DELETE")
            .uri("/api/admin/federation/inbound/999")
            .header("authorization", format!("Bearer {token}"))
            .body(Body::empty())
            .expect("del req");
        let del_res = app.oneshot(del_req).await.expect("del res");
        assert_eq!(del_res.status(), StatusCode::OK);
    }
}
