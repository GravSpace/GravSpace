use crate::auth::jwt::verify_jwt;
use crate::config::Config;
use crate::db;
use crate::error::AppError;
use crate::storage::FileStorage;
use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        Query, State,
    },
    http::{header, HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use serde::Deserialize;
use serde_json::json;
use std::collections::HashMap;
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant};
use tokio::sync::broadcast;

static FEDERATION_TX: OnceLock<broadcast::Sender<String>> = OnceLock::new();
static WS_TICKETS: OnceLock<Mutex<HashMap<String, Instant>>> = OnceLock::new();
const WS_TICKET_TTL: Duration = Duration::from_secs(30);

fn ticket_store() -> &'static Mutex<HashMap<String, Instant>> {
    WS_TICKETS.get_or_init(|| Mutex::new(HashMap::new()))
}

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

/// Issues a single-use short-lived (30s) ticket for authenticating WebSocket `/federation/stream`
/// without exposing long-lived admin JWTs in URL query strings.
pub async fn create_stream_ticket() -> Result<Response, AppError> {
    let ticket = uuid::Uuid::new_v4().to_string();
    let now = Instant::now();
    if let Ok(mut guard) = ticket_store().lock() {
        guard.retain(|_, issued| now.duration_since(*issued) <= WS_TICKET_TTL);
        guard.insert(ticket.clone(), now);
    }
    Ok((
        StatusCode::OK,
        Json(json!({ "ticket": ticket, "expires_in_secs": WS_TICKET_TTL.as_secs() })),
    )
        .into_response())
}

pub(crate) fn consume_ws_ticket(ticket: &str) -> bool {
    let now = Instant::now();
    if let Ok(mut guard) = ticket_store().lock() {
        guard.retain(|_, issued| now.duration_since(*issued) <= WS_TICKET_TTL);
        if let Some(issued) = guard.remove(ticket) {
            return now.duration_since(issued) <= WS_TICKET_TTL;
        }
    }
    false
}

pub async fn stream_federation_events(
    ws: WebSocketUpgrade,
    headers: HeaderMap,
    Query(params): Query<HashMap<String, String>>,
    State(state): State<FederationStreamState>,
) -> Result<Response, AppError> {
    if let Some(ticket) = params.get("ticket") {
        if consume_ws_ticket(ticket) {
            return Ok(ws.on_upgrade(handle_federation_ws).into_response());
        }
        return Err(crate::error::AuthError::TokenInvalid.into());
    }

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
pub use crate::admin::federation_peer_handlers::{
    create_peer, delete_peer, get_peer_secret, list_peers, ping_peer, update_peer,
};

// ================= SHARE HANDLERS =================
pub use crate::admin::federation_share_handlers::{
    create_share, delete_share, list_shares, reconcile_share, toggle_share, update_share,
};

// ================= QUEUE HANDLERS =================

#[derive(Deserialize, Default)]
pub struct QueueFilterQuery {
    pub status: Option<String>,
    pub q: Option<String>,
    pub page: Option<i64>,
    pub limit: Option<i64>,
    pub paginated: Option<bool>,
}

pub async fn list_queue(
    State(storage): State<FileStorage>,
    Query(query): Query<QueueFilterQuery>,
) -> Result<Response, AppError> {
    let conn = storage.federation_conn()?;
    if query.page.is_some() || query.paginated == Some(true) {
        let page = query.page.unwrap_or(1);
        let limit = query.limit.unwrap_or(25);
        let res = db::federation_recovery::list_sync_queue_paginated(
            &conn,
            query.status.as_deref(),
            query.q.as_deref(),
            page,
            limit,
        )
        .await?;
        Ok((StatusCode::OK, Json(res)).into_response())
    } else {
        let limit = query.limit.unwrap_or(50);
        let items = db::federation::list_sync_queue(&conn, query.status.as_deref(), limit).await?;
        Ok((StatusCode::OK, Json(items)).into_response())
    }
}

pub async fn retry_failed_queue(State(storage): State<FileStorage>) -> Result<Response, AppError> {
    let conn = storage.federation_conn()?;
    db::federation::retry_all_failed(&conn).await?;
    broadcast_federation_event("queue_changed", json!({ "action": "retry" }));
    Ok((StatusCode::OK, Json(json!({ "success": true }))).into_response())
}

pub async fn clear_completed_queue(
    State(storage): State<FileStorage>,
) -> Result<Response, AppError> {
    let conn = storage.federation_conn()?;
    db::federation::clear_completed_queue(&conn).await?;
    broadcast_federation_event("queue_changed", json!({ "action": "cleared" }));
    Ok((StatusCode::OK, Json(json!({ "success": true }))).into_response())
}

// ================= TEST ENDPOINT HANDLER =================
pub use crate::admin::federation_probe::test_remote_endpoint;
