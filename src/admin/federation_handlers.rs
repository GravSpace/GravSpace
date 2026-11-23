use crate::auth::jwt::verify_jwt;
use crate::config::Config;
use crate::db;
use crate::error::AppError;
use crate::storage::FileStorage;
use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        Path, Query, State,
    },
    http::{header, HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use serde::Deserialize;
use serde_json::json;
use std::collections::HashMap;
use std::sync::{Arc, OnceLock};
use std::time::Duration;
use tokio::sync::broadcast;

static FEDERATION_TX: OnceLock<broadcast::Sender<String>> = OnceLock::new();

pub fn get_federation_tx() -> &'static broadcast::Sender<String> {
    FEDERATION_TX.get_or_init(|| {
        let (tx, _) = broadcast::channel(256);
        tx
    })
}

pub fn broadcast_federation_event(event_type: &str, data: serde_json::Value) {
    let tx = get_federation_tx();
    let payload = json!({
        "event": event_type,
        "data": data,
        "timestamp": chrono::Utc::now().to_rfc3339()
    });
    let _ = tx.send(payload.to_string());
}

#[derive(Clone)]
pub struct FederationStreamState {
    pub config: Arc<Config>,
}

pub async fn stream_federation_events(
    ws: WebSocketUpgrade,
    headers: HeaderMap,
    Query(params): Query<HashMap<String, String>>,
    State(state): State<FederationStreamState>,
) -> Result<Response, AppError> {
    let token = if let Some(t) = params.get("token") {
        t.clone()
    } else if let Some(auth) = headers
        .get(header::AUTHORIZATION)
        .and_then(|h| h.to_str().ok())
    {
        auth.strip_prefix("Bearer ").unwrap_or(auth).to_string()
    } else {
        String::new()
    };

    if token.is_empty() {
        return Err(crate::error::AuthError::TokenInvalid.into());
    }

    let username = verify_jwt(&token, &state.config.jwt_secret)?;
    if username != "admin" {
        return Err(AppError::Forbidden(
            "Administrator access required".to_string(),
        ));
    }

    Ok(ws.on_upgrade(handle_federation_ws).into_response())
}

async fn handle_federation_ws(mut socket: WebSocket) {
    let mut rx = get_federation_tx().subscribe();
    let mut ping_interval = tokio::time::interval(Duration::from_secs(20));

    loop {
        tokio::select! {
            _ = ping_interval.tick() => {
                if socket.send(Message::Ping(vec![].into())).await.is_err() {
                    break;
                }
            }
            Ok(msg_str) = rx.recv() => {
                if socket.send(Message::Text(msg_str.into())).await.is_err() {
                    break;
                }
            }
            msg = socket.recv() => {
                match msg {
                    Some(Ok(Message::Close(_))) | None => break,
                    Some(Ok(Message::Ping(payload))) => {
                        let _ = socket.send(Message::Pong(payload)).await;
                    }
                    _ => {}
                }
            }
        }
    }
}

// ================= PEER HANDLERS =================

pub async fn list_peers(State(storage): State<FileStorage>) -> Result<Response, AppError> {
    let conn = storage.db.conn()?;
    let peers = db::federation::list_remote_servers(&conn).await?;
    Ok((StatusCode::OK, Json(peers)).into_response())
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
    let conn = storage.db.conn()?;
    let id = db::federation::create_remote_server(
        &conn,
        &payload.name,
        &payload.endpoint,
        payload.s3_endpoint.as_deref(),
        &payload.access_key,
        &payload.secret_key,
    )
    .await?;

    broadcast_federation_event("peers_changed", json!({ "action": "created", "id": id }));
    Ok((StatusCode::CREATED, Json(json!({ "id": id, "success": true }))).into_response())
}

pub async fn delete_peer(
    State(storage): State<FileStorage>,
    Path(id): Path<i64>,
) -> Result<Response, AppError> {
    let conn = storage.db.conn()?;
    db::federation::delete_remote_server(&conn, id).await?;
    broadcast_federation_event("peers_changed", json!({ "action": "deleted", "id": id }));
    Ok((StatusCode::OK, Json(json!({ "success": true }))).into_response())
}

pub async fn ping_peer(
    State(storage): State<FileStorage>,
    Path(id): Path<i64>,
) -> Result<Response, AppError> {
    let conn = storage.db.conn()?;
    let peer = match db::federation::get_remote_server(&conn, id).await? {
        Some(p) => p,
        None => return Err(AppError::Storage(crate::error::StorageError::BucketNotFound(format!("Peer #{id} not found")))),
    };

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(5))
        .build()
        .unwrap_or_else(|_| reqwest::Client::new());

    let health_url = format!("{}/health", peer.endpoint.trim_end_matches('/'));
    let start = std::time::Instant::now();
    let admin_res = client.get(&health_url).send().await;
    let admin_latency = start.elapsed().as_millis() as i64;
    let admin_ok = match &admin_res {
        Ok(resp) => resp.status().is_success() || resp.status() == 404,
        Err(_) => false,
    };

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
                    "GET",
                    clean_s3,
                    "/",
                    "",
                    &[],
                    &peer.access_key,
                    &peer.secret_key,
                    "us-east-1",
                    &[],
                );
            }
            let s3_send = req.send().await;
            let el = s3_start.elapsed().as_millis() as i64;
            s3_latency = Some(el);
            s3_ok = Some(match s3_send {
                Ok(resp) => resp.status().is_success() || resp.status() == 403,
                Err(_) => false,
            });
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
    broadcast_federation_event("peer_status", json!({
        "id": peer.id,
        "status": status,
        "latency_ms": final_latency,
        "admin_latency_ms": admin_latency,
        "s3_latency_ms": s3_latency,
    }));

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

// ================= SHARE HANDLERS =================

pub async fn list_shares(State(storage): State<FileStorage>) -> Result<Response, AppError> {
    let conn = storage.db.conn()?;
    let shares = db::federation::list_shares(&conn).await?;
    Ok((StatusCode::OK, Json(shares)).into_response())
}

#[derive(Deserialize)]
pub struct CreateSharePayload {
    pub name: String,
    pub source_bucket: String,
    #[serde(default)]
    pub source_prefix: String,
    pub remote_server_id: i64,
    pub target_bucket: String,
    #[serde(default)]
    pub target_prefix: String,
    #[serde(default = "default_sync_mode")]
    pub sync_mode: String,
}

fn default_sync_mode() -> String {
    "one_way".to_string()
}

pub async fn create_share(
    State(storage): State<FileStorage>,
    Json(payload): Json<CreateSharePayload>,
) -> Result<Response, AppError> {
    let conn = storage.db.conn()?;
    let id = db::federation::create_share(
        &conn,
        &payload.name,
        &payload.source_bucket,
        &payload.source_prefix,
        payload.remote_server_id,
        &payload.target_bucket,
        &payload.target_prefix,
        &payload.sync_mode,
    )
    .await?;

    broadcast_federation_event("shares_changed", json!({ "action": "created", "id": id }));
    Ok((StatusCode::CREATED, Json(json!({ "id": id, "success": true }))).into_response())
}

pub async fn delete_share(
    State(storage): State<FileStorage>,
    Path(id): Path<i64>,
) -> Result<Response, AppError> {
    let conn = storage.db.conn()?;
    db::federation::delete_share(&conn, id).await?;
    broadcast_federation_event("shares_changed", json!({ "action": "deleted", "id": id }));
    Ok((StatusCode::OK, Json(json!({ "success": true }))).into_response())
}

pub async fn reconcile_share(
    State(storage): State<FileStorage>,
    Path(id): Path<i64>,
) -> Result<Response, AppError> {
    let enqueued = storage.reconcile_share(id).await?;
    broadcast_federation_event("shares_changed", json!({ "action": "reconciled", "id": id, "enqueued_count": enqueued }));
    Ok((
        StatusCode::OK,
        Json(json!({ "success": true, "enqueued_count": enqueued })),
    )
        .into_response())
}

// ================= QUEUE HANDLERS =================

#[derive(Deserialize, Default)]
pub struct QueueFilterQuery {
    pub status: Option<String>,
    pub limit: Option<i64>,
}

pub async fn list_queue(
    State(storage): State<FileStorage>,
    Query(query): Query<QueueFilterQuery>,
) -> Result<Response, AppError> {
    let conn = storage.db.conn()?;
    let limit = query.limit.unwrap_or(50);
    let items = db::federation::list_sync_queue(&conn, query.status.as_deref(), limit).await?;
    Ok((StatusCode::OK, Json(items)).into_response())
}

pub async fn retry_failed_queue(State(storage): State<FileStorage>) -> Result<Response, AppError> {
    let conn = storage.db.conn()?;
    db::federation::retry_all_failed(&conn).await?;
    broadcast_federation_event("queue_changed", json!({ "action": "retry" }));
    Ok((StatusCode::OK, Json(json!({ "success": true }))).into_response())
}

pub async fn clear_completed_queue(
    State(storage): State<FileStorage>,
) -> Result<Response, AppError> {
    let conn = storage.db.conn()?;
    db::federation::clear_completed_queue(&conn).await?;
    broadcast_federation_event("queue_changed", json!({ "action": "cleared" }));
    Ok((StatusCode::OK, Json(json!({ "success": true }))).into_response())
}

// ================= TEST ENDPOINT HANDLER =================

#[derive(Deserialize)]
pub struct TestEndpointPayload {
    pub endpoint: String,
    pub s3_endpoint: Option<String>,
    pub access_key_id: Option<String>,
    pub secret_access_key: Option<String>,
}

pub async fn test_remote_endpoint(
    Json(payload): Json<TestEndpointPayload>,
) -> Result<Response, AppError> {
    let raw = payload.endpoint.trim().trim_end_matches('/');
    if raw.is_empty() {
        return Err(AppError::BadRequest("Endpoint URL is required".to_string()));
    }

    let parsed = match reqwest::Url::parse(raw) {
        Ok(u) => u,
        Err(e) => {
            return Err(AppError::BadRequest(format!("Invalid endpoint URL: {e}")));
        }
    };

    let scheme = parsed.scheme();
    if scheme != "http" && scheme != "https" {
        return Err(AppError::BadRequest(
            "Only HTTP and HTTPS endpoints are permitted".to_string(),
        ));
    }

    if let Some(host_str) = parsed.host_str() {
        if host_str == "169.254.169.254" {
            return Err(AppError::BadRequest(
                "Access to link-local metadata address is blocked".to_string(),
            ));
        }
        if host_str == "localhost" || host_str == "127.0.0.1" || host_str == "::1" {
            if let Some(port) = parsed.port() {
                if port == 8085 || port == 6379 {
                    return Err(AppError::BadRequest(
                        "Access to internal database/cache port is blocked".to_string(),
                    ));
                }
            }
        }
    }

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(5))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .unwrap_or_else(|_| reqwest::Client::new());

    let health_url = format!("{raw}/health");
    let start = std::time::Instant::now();
    let admin_res = client.get(&health_url).send().await;
    let admin_latency = start.elapsed().as_millis() as u64;

    let (admin_ok, admin_status, admin_msg) = match admin_res {
        Ok(resp) => {
            let s = resp.status();
            if s.is_success() || s.as_u16() == 404 {
                (true, s.as_u16(), format!("Online ({admin_latency}ms)"))
            } else {
                (false, s.as_u16(), format!("Server responded with HTTP {}", s.as_u16()))
            }
        }
        Err(e) => (false, 504, format!("Connection failed: {e}")),
    };

    let mut s3_result = None;
    if let Some(raw_s3) = payload.s3_endpoint {
        let s3_clean = raw_s3.trim().trim_end_matches('/');
        if !s3_clean.is_empty() {
            let s3_start = std::time::Instant::now();
            let mut req = client.get(s3_clean);
            let has_creds = payload.access_key_id.as_ref().map(|k| !k.is_empty()).unwrap_or(false)
                && payload.secret_access_key.as_ref().map(|k| !k.is_empty()).unwrap_or(false);

            if has_creds {
                let ak = payload.access_key_id.as_deref().unwrap_or("");
                let sk = payload.secret_access_key.as_deref().unwrap_or("");
                req = crate::admin::s3_explorer_handlers::sign_s3_explorer_request(
                    req, "GET", s3_clean, "/", "", &[], ak, sk, "us-east-1", &[],
                );
            }

            let s3_res = req.send().await;
            let s3_latency = s3_start.elapsed().as_millis() as u64;

            let (s3_ok, s3_status, s3_msg, authed) = match s3_res {
                Ok(resp) => {
                    let s = resp.status().as_u16();
                    if s >= 200 && s < 300 {
                        (true, s, format!("S3 Storage & Credentials Valid ({s3_latency}ms)"), true)
                    } else if s == 403 {
                        if has_creds {
                            (false, s, "S3 Online but Credentials Invalid (HTTP 403)".to_string(), false)
                        } else {
                            (true, s, format!("S3 Online (requires credentials, {s3_latency}ms)"), false)
                        }
                    } else {
                        (true, s, format!("S3 Responded with HTTP {s} ({s3_latency}ms)"), false)
                    }
                }
                Err(e) => (false, 504, format!("S3 Port Unreachable: {e}"), false),
            };

            s3_result = Some(json!({
                "success": s3_ok,
                "latency_ms": s3_latency,
                "status_code": s3_status,
                "authenticated": authed,
                "message": s3_msg,
            }));
        }
    }

    let overall_success = admin_ok && s3_result.as_ref().map(|v| v["success"].as_bool().unwrap_or(true)).unwrap_or(true);
    let summary = if overall_success {
        if s3_result.is_some() {
            "Admin API & S3 Storage verified successfully".to_string()
        } else {
            format!("Online ({admin_latency}ms latency) - Ready to connect")
        }
    } else if !admin_ok {
        admin_msg.clone()
    } else {
        s3_result.as_ref().and_then(|v| v["message"].as_str()).unwrap_or("S3 verification failed").to_string()
    };

    Ok((
        StatusCode::OK,
        Json(json!({
            "success": overall_success,
            "latency_ms": admin_latency,
            "status_code": admin_status,
            "message": summary,
            "admin": {
                "success": admin_ok,
                "latency_ms": admin_latency,
                "status_code": admin_status,
                "message": admin_msg,
            },
            "s3": s3_result,
        })),
    )
        .into_response())
}
