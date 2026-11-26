use crate::admin::federation_handlers::broadcast_federation_event;
use crate::admin::federation_probe::validate_peer_url;
use crate::db;
use crate::error::AppError;
use crate::storage::FileStorage;
use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde::Deserialize;
use serde_json::json;
use std::time::Duration;

pub async fn list_peers(State(storage): State<FileStorage>) -> Result<Response, AppError> {
    let conn = storage.federation_conn()?;
    let peers: Vec<db::federation_peers::RemoteServerPublic> = db::federation::list_remote_servers(&conn)
        .await?
        .into_iter()
        .map(Into::into)
        .collect();
    Ok((StatusCode::OK, Json(peers)).into_response())
}

/// Returns the stored `secret_key` for an existing peer on explicit Show/Copy demand.
pub async fn get_peer_secret(
    State(storage): State<FileStorage>,
    Path(id): Path<i64>,
) -> Result<Response, AppError> {
    let conn = storage.federation_conn()?;
    let peer = db::federation::get_remote_server(&conn, id).await?.ok_or_else(|| {
        AppError::Storage(crate::error::StorageError::BucketNotFound(format!(
            "Peer #{id} not found"
        )))
    })?;
    Ok((StatusCode::OK, Json(json!({ "secret_key": peer.secret_key }))).into_response())
}

#[derive(Deserialize)]
pub struct CreatePeerPayload {
    pub name: String,
    pub endpoint: String,
    pub s3_endpoint: Option<String>,
    pub access_key: String,
    pub secret_key: String,
}

pub async fn create_peer(
    State(storage): State<FileStorage>,
    Json(payload): Json<CreatePeerPayload>,
) -> Result<Response, AppError> {
    let name = payload.name.trim();
    if name.is_empty() {
        return Err(AppError::BadRequest("Peer name is required".to_string()));
    }
    let endpoint = validate_peer_url(&payload.endpoint, "Endpoint URL")?;
    let s3_endpoint = match payload.s3_endpoint.as_deref().map(str::trim) {
        Some(s) if !s.is_empty() => Some(validate_peer_url(s, "S3 Endpoint URL")?),
        _ => None,
    };

    let conn = storage.federation_conn()?;
    let id = db::federation::create_remote_server(
        &conn,
        name,
        &endpoint,
        s3_endpoint.as_deref(),
        payload.access_key.trim(),
        payload.secret_key.trim(),
    )
    .await?;

    broadcast_federation_event("peers_changed", json!({ "action": "created", "id": id }));
    Ok((
        StatusCode::CREATED,
        Json(json!({ "id": id, "success": true })),
    )
        .into_response())
}

#[derive(Deserialize)]
pub struct UpdatePeerPayload {
    pub name: String,
    pub endpoint: String,
    pub s3_endpoint: Option<String>,
    pub access_key: String,
    pub secret_key: Option<String>,
}

/// Updates an existing remote peer's identifier, endpoints, and credentials,
/// then expedites pending/failed outbox items so queued transfers retry with the new target.
pub async fn update_peer(
    State(storage): State<FileStorage>,
    Path(id): Path<i64>,
    Json(payload): Json<UpdatePeerPayload>,
) -> Result<Response, AppError> {
    let name = payload.name.trim();
    if name.is_empty() {
        return Err(AppError::BadRequest("Peer name is required".to_string()));
    }

    let endpoint = validate_peer_url(&payload.endpoint, "Endpoint URL")?;
    let s3_endpoint = match payload.s3_endpoint.as_deref().map(str::trim) {
        Some(s) if !s.is_empty() => Some(validate_peer_url(s, "S3 Endpoint URL")?),
        _ => None,
    };

    let access_key = payload.access_key.trim();
    let access_key = if access_key.is_empty() { "admin" } else { access_key };
    let secret_key = payload
        .secret_key
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty());

    let conn = storage.federation_conn()?;
    let updated = db::federation_peers::update_remote_server(
        &conn,
        id,
        &db::federation_peers::RemoteServerUpdate {
            name,
            endpoint: &endpoint,
            s3_endpoint: s3_endpoint.as_deref(),
            access_key,
            secret_key,
        },
    )
    .await?;

    if !updated {
        return Err(AppError::Storage(
            crate::error::StorageError::BucketNotFound(format!("Peer #{id} not found")),
        ));
    }

    let _ = db::federation_recovery::expedite_pending_for_peer(&conn, Some(id)).await;
    broadcast_federation_event("peers_changed", json!({ "action": "updated", "id": id }));
    broadcast_federation_event("queue_changed", json!({ "action": "retry", "peer_id": id }));

    Ok((StatusCode::OK, Json(json!({ "id": id, "success": true }))).into_response())
}

pub async fn delete_peer(
    State(storage): State<FileStorage>,
    Path(id): Path<i64>,
) -> Result<Response, AppError> {
    let conn = storage.federation_conn()?;
    db::federation::delete_remote_server(&conn, id).await?;
    broadcast_federation_event("peers_changed", json!({ "action": "deleted", "id": id }));
    Ok((StatusCode::OK, Json(json!({ "success": true }))).into_response())
}

pub async fn ping_peer(
    State(storage): State<FileStorage>,
    Path(id): Path<i64>,
) -> Result<Response, AppError> {
    let conn = storage.federation_conn()?;
    let peer = db::federation::get_remote_server(&conn, id).await?.ok_or_else(|| {
        AppError::Storage(crate::error::StorageError::BucketNotFound(format!(
            "Peer #{id} not found"
        )))
    })?;

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(5))
        .build()
        .unwrap_or_else(|_| reqwest::Client::new());

    let health_url = format!("{}/health", peer.endpoint.trim_end_matches('/'));
    let start = std::time::Instant::now();
    let admin_res = client.get(&health_url).send().await;
    let admin_latency = start.elapsed().as_millis() as i64;
    let admin_ok = admin_res
        .as_ref()
        .is_ok_and(|resp| resp.status().is_success() || resp.status() == 404);

    let mut s3_latency: Option<i64> = None;
    let mut s3_ok: Option<bool> = None;
    if let Some(s3_ep) = &peer.s3_endpoint {
        let clean_s3 = s3_ep.trim().trim_end_matches('/');
        if !clean_s3.is_empty() {
            let s3_start = std::time::Instant::now();
            let mut req = client.get(clean_s3);
            if !peer.access_key.is_empty() && !peer.secret_key.is_empty() {
                req = crate::admin::s3_explorer_handlers::sign_s3_explorer_request(
                    req,
                    &crate::admin::s3_explorer_handlers::S3ExplorerSignParams {
                        method: "GET",
                        endpoint: clean_s3,
                        canonical_uri: "/",
                        canonical_query: "",
                        payload: &[],
                        access_key: &peer.access_key,
                        secret_key: &peer.secret_key,
                        region: "us-east-1",
                        extra_headers: &[],
                    },
                );
            }
            let s3_send = req.send().await;
            s3_latency = Some(s3_start.elapsed().as_millis() as i64);
            s3_ok = Some(s3_send.is_ok_and(|resp| resp.status().is_success() || resp.status() == 403));
        }
    }

    let status = if admin_ok && s3_ok.unwrap_or(true) {
        "healthy"
    } else if admin_ok || s3_ok.unwrap_or(false) {
        "degraded"
    } else {
        "unreachable"
    };
    let final_latency = if admin_ok { admin_latency } else { s3_latency.unwrap_or(0) };
    let _ = db::federation::update_server_status(&conn, peer.id, status, final_latency).await;
    broadcast_federation_event(
        "peer_status",
        json!({
            "id": peer.id,
            "status": status,
            "latency_ms": final_latency,
            "admin_latency_ms": admin_latency,
            "s3_latency_ms": s3_latency,
        }),
    );

    Ok((
        StatusCode::OK,
        Json(json!({
            "status": status,
            "latency_ms": final_latency,
            "admin_latency_ms": admin_latency,
            "s3_latency_ms": s3_latency,
            "admin_ok": admin_ok,
            "s3_ok": s3_ok,
        })),
    )
        .into_response())
}

#[cfg(test)]
mod router_tests {
    use crate::audit::AuditLogger;
    use crate::auth::jwt::create_jwt;
    use crate::cache::memory::MemoryCache;
    use crate::config::Config;
    use crate::db::{self, Database};
    use crate::storage::FileStorage;
    use axum::body::Body;
    use axum::http::{header, Request, StatusCode};
    use std::sync::Arc;
    use tower::ServiceExt;

    #[tokio::test]
    async fn peer_and_share_update_routes_should_not_return_405() {
        let tmp = std::env::temp_dir().join(format!("grav_rt_{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&tmp).unwrap();

        let turso = Database::open_turso(tmp.join("turso.db").to_str().unwrap()).await.unwrap();
        let vault = Database::open_vault(tmp.join("vault.db").to_str().unwrap()).await.unwrap();
        let fed = Database::open_federation(tmp.join("fed.db").to_str().unwrap()).await.unwrap();
        let mut cfg = Config::load();
        cfg.redis_url = None;
        let cfg = Arc::new(cfg);

        let audit = Arc::new(AuditLogger::new(tmp.join("audit.log"), turso.clone()));
        let storage = FileStorage::new(
            tmp.join("data"),
            turso,
            vault,
            fed.clone(),
            Arc::new(MemoryCache::default()),
            cfg.clone(),
            Some(audit.clone()),
        );

        let f_conn = fed.conn().unwrap();
        let peer_id = db::federation::create_remote_server(
            &f_conn, "p1", "http://10.0.0.1:8080", None, "ak", "sk",
        ).await.unwrap();
        let share_id = db::federation::create_share(
            &f_conn, "s1", "b1", "", peer_id, "b2", "", "one_way",
        ).await.unwrap();

        let jwt = create_jwt("admin", &cfg.jwt_secret).unwrap();
        let app = crate::admin::routes::admin_router(storage, cfg, audit);

        let peer_body = serde_json::json!({
            "name": "p1-upd",
            "endpoint": "http://10.0.0.2:8080",
            "s3_endpoint": null,
            "access_key": "ak"
        }).to_string();

        for (method, uri) in [
            ("PUT", format!("/api/admin/federation/peers/{peer_id}")),
            ("PATCH", format!("/admin/federation/peers/{peer_id}")),
        ] {
            let req = Request::builder()
                .method(method)
                .uri(&uri)
                .header(header::AUTHORIZATION, format!("Bearer {jwt}"))
                .header(header::CONTENT_TYPE, "application/json")
                .body(Body::from(peer_body.clone()))
                .unwrap();
            let resp = app.clone().oneshot(req).await.unwrap();
            assert_eq!(resp.status(), StatusCode::OK, "{method} {uri} failed");
        }

        let sec_req = Request::builder()
            .method("GET")
            .uri(format!("/api/admin/federation/peers/{peer_id}/secret"))
            .header(header::AUTHORIZATION, format!("Bearer {jwt}"))
            .body(Body::empty())
            .unwrap();
        let sec_resp = app.clone().oneshot(sec_req).await.unwrap();
        assert_eq!(sec_resp.status(), StatusCode::OK);

        let tog_req = Request::builder()
            .method("PATCH")
            .uri(format!("/api/admin/federation/shares/{share_id}/toggle"))
            .header(header::AUTHORIZATION, format!("Bearer {jwt}"))
            .header(header::CONTENT_TYPE, "application/json")
            .body(Body::from(r#"{"enabled":false}"#))
            .unwrap();
        let tog_resp = app.clone().oneshot(tog_req).await.unwrap();
        assert_eq!(tog_resp.status(), StatusCode::OK);

        // Security check: database-stats must require admin authentication
        let unauth_stats = Request::builder()
            .method("GET")
            .uri("/api/admin/system/database-stats")
            .body(Body::empty())
            .unwrap();
        let unauth_resp = app.clone().oneshot(unauth_stats).await.unwrap();
        assert_eq!(unauth_resp.status(), StatusCode::UNAUTHORIZED);

        // HttpOnly cookie session auth check
        let cookie_stats = Request::builder()
            .method("GET")
            .uri("/api/admin/auth/session")
            .header(header::COOKIE, format!("gravspace_session={jwt}"))
            .body(Body::empty())
            .unwrap();
        let cookie_resp = app.oneshot(cookie_stats).await.unwrap();
        assert_eq!(cookie_resp.status(), StatusCode::OK);
    }
}
