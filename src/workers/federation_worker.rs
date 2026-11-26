use crate::admin::federation_handlers::{broadcast_federation_event, get_federation_tx};
use crate::db;
use crate::storage::FileStorage;
use crate::workers::federation_pull::run_two_way_pull_sync;
use crate::workers::federation_transfer::{transfer_sync_item, TransferOutcome};
use std::collections::HashMap;
use std::time::{Duration, Instant};
use tracing::{debug, info, warn};

const HEARTBEAT_INTERVAL: Duration = Duration::from_secs(30);
const SAFETY_RECONCILE_INTERVAL: Duration = Duration::from_secs(300);

/// Runs startup catch-up: resets stuck `syncing` rows, expedites backoff timers,
/// clears legacy directory markers, and reconciles all enabled shares.
async fn run_startup_recovery(storage: &FileStorage) {
    if let Ok(conn) = storage.federation_conn() {
        let _ = conn
            .execute(
                "UPDATE sync_queue SET status = 'completed', last_error = NULL
                 WHERE (source_key LIKE '%/' OR target_key LIKE '%/') AND status != 'completed'",
                (),
            )
            .await;
        let _ = conn
            .execute(
                "UPDATE sync_queue SET status = 'pending', updated_at = datetime('now')
                 WHERE status = 'syncing'",
                (),
            )
            .await;
        let _ = db::federation_recovery::expedite_pending_for_peer(&conn, None).await;
    }

    match storage.reconcile_all_enabled_shares(None).await {
        Ok(enqueued) if enqueued > 0 => {
            info!("Startup federation catch-up queued {enqueued} drifted objects");
        }
        Err(e) => warn!("Startup federation catch-up failed: {e}"),
        _ => {}
    }
}

/// Probes remote peer `/health` endpoints and triggers immediate catch-up when a peer
/// transitions back to `healthy` after being offline/unreachable/degraded (RTO recovery).
async fn run_heartbeat_phase(
    storage: &FileStorage,
    conn: &turso::Connection,
    probe_client: &reqwest::Client,
    transfer_client: &reqwest::Client,
    peer_state_cache: &mut HashMap<i64, (String, Instant)>,
) {
    let Ok(peers) = db::federation::list_remote_servers(conn).await else {
        return;
    };

    for peer in peers {
        let health_url = format!("{}/health", peer.endpoint.trim_end_matches('/'));
        let start = Instant::now();
        let (status_str, latency) = match probe_client.get(&health_url).send().await {
            Ok(resp) if resp.status().is_success() => {
                ("healthy".to_string(), start.elapsed().as_millis() as i64)
            }
            Ok(resp) => {
                let s = if resp.status().is_server_error() {
                    "degraded"
                } else {
                    "healthy"
                };
                (s.to_string(), start.elapsed().as_millis() as i64)
            }
            Err(_) => ("unreachable".to_string(), 0),
        };

        broadcast_federation_event(
            "peer_heartbeat",
            serde_json::json!({
                "id": peer.id,
                "status": status_str,
                "latency_ms": latency
            }),
        );

        let prev_status = peer_state_cache
            .get(&peer.id)
            .map(|(s, _)| s.clone())
            .unwrap_or_else(|| peer.status.clone());
        let recovered = status_str == "healthy" && prev_status != "healthy";

        let should_persist = match peer_state_cache.get(&peer.id) {
            Some((last_status, last_persisted)) => {
                last_status != &status_str || last_persisted.elapsed() >= Duration::from_secs(60)
            }
            None => true,
        };

        if should_persist {
            let _ = db::federation::update_server_status(conn, peer.id, &status_str, latency).await;
            peer_state_cache.insert(peer.id, (status_str, Instant::now()));
        }

        if recovered {
            let expedited = db::federation_recovery::expedite_pending_for_peer(conn, Some(peer.id))
                .await
                .unwrap_or(0);
            let reconciled = storage
                .reconcile_all_enabled_shares(Some(peer.id))
                .await
                .unwrap_or(0);
            let pulled = run_two_way_pull_sync(storage, conn, transfer_client, Some(peer.id)).await;
            if expedited > 0 || reconciled > 0 || pulled > 0 {
                info!(
                    "Peer '{}' recovered from '{prev_status}' -> expedited {expedited} queued + reconciled {reconciled} + pulled {pulled} remote items",
                    peer.name
                );
            }
        }
    }
}

/// Drains up to 10 ready outbox items using the long-timeout transfer client.
async fn drain_queue_phase(
    storage: &FileStorage,
    conn: &turso::Connection,
    transfer_client: &reqwest::Client,
    peer_state_cache: &mut HashMap<i64, (String, Instant)>,
) {
    let Ok(pending_items) = db::federation::get_pending_sync_items(conn, 10).await else {
        return;
    };
    if pending_items.is_empty() {
        return;
    }

    let shares = db::federation::list_shares(conn).await.unwrap_or_default();
    let peers = db::federation::list_remote_servers(conn)
        .await
        .unwrap_or_default();

    for item in pending_items {
        let Some(share) = shares.iter().find(|s| s.id == item.share_id && s.enabled) else {
            let _ = db::federation::mark_item_completed(conn, item.id).await;
            continue;
        };

        let Some(peer) = peers.iter().find(|p| p.id == share.remote_server_id) else {
            let _ = db::federation_recovery::mark_item_retry_or_failed(
                conn,
                item.id,
                "Remote server peer not found",
                60,
                item.attempts + 1,
                item.max_attempts,
                false,
            )
            .await;
            continue;
        };

        if item.source_key.ends_with('/') || item.target_key.ends_with('/') {
            let _ = db::federation::mark_item_completed(conn, item.id).await;
            let _ = db::federation::update_share_status(conn, share.id, "in_sync").await;
            broadcast_federation_event(
                "queue_updated",
                serde_json::json!({ "id": item.id, "share_id": share.id, "status": "completed" }),
            );
            debug!("Skipped directory marker sync for {}", item.source_key);
            continue;
        }

        let _ = conn
            .execute(
                "UPDATE sync_queue SET status = 'syncing', updated_at = CURRENT_TIMESTAMP WHERE id = ?1",
                libsql::params![item.id],
            )
            .await;
        broadcast_federation_event(
            "queue_updated",
            serde_json::json!({ "id": item.id, "share_id": share.id, "status": "syncing" }),
        );

        match transfer_sync_item(storage, transfer_client, &item, peer).await {
            TransferOutcome::Success => {
                let _ = db::federation::mark_item_completed(conn, item.id).await;
                let _ = db::federation::update_share_status(conn, share.id, "in_sync").await;
                broadcast_federation_event(
                    "queue_updated",
                    serde_json::json!({ "id": item.id, "share_id": share.id, "status": "completed" }),
                );
                debug!(
                    "Sync completed for {} -> {}",
                    item.source_key, item.target_key
                );
            }
            outcome => {
                let (err_msg, is_permanent, is_unreachable) = match outcome {
                    TransferOutcome::PermanentError(m) => (m, true, false),
                    TransferOutcome::TransientError(m) => (m, false, false),
                    TransferOutcome::Unreachable(m) => (m, false, true),
                    TransferOutcome::Success => unreachable!(),
                };
                let attempts = item.attempts + 1;
                let exp_delay = (2_i64.pow(attempts.min(7) as u32) * 2).min(300);
                warn!(
                    "Sync failed for item #{}: {err_msg}, next_delay={exp_delay}s",
                    item.id
                );
                let final_status = db::federation_recovery::mark_item_retry_or_failed(
                    conn,
                    item.id,
                    &err_msg,
                    exp_delay,
                    attempts,
                    item.max_attempts,
                    is_permanent,
                )
                .await
                .unwrap_or("pending");
                let _ = db::federation::update_share_status(conn, share.id, "pending_retry").await;
                if is_unreachable {
                    let _ =
                        db::federation::update_server_status(conn, peer.id, "unreachable", 0).await;
                    peer_state_cache.insert(peer.id, ("unreachable".to_string(), Instant::now()));
                }
                broadcast_federation_event(
                    "queue_updated",
                    serde_json::json!({
                        "id": item.id,
                        "share_id": share.id,
                        "status": final_status,
                        "last_error": err_msg
                    }),
                );
            }
        }
    }
}

/// Starts the resilient cross-server federation worker handling heartbeats,
/// startup/RTO catch-up reconciliation, event-driven wakeups, and outbox draining.
pub async fn start_federation_worker(storage: FileStorage) {
    info!("GravSpace Federation & Resilient Outbox worker started");
    run_startup_recovery(&storage).await;

    let probe_client = reqwest::Client::builder()
        .timeout(Duration::from_secs(5))
        .build()
        .unwrap_or_else(|_| reqwest::Client::new());
    let transfer_client = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(5))
        .timeout(Duration::from_secs(300))
        .build()
        .unwrap_or_else(|_| reqwest::Client::new());

    let mut interval = tokio::time::interval(Duration::from_secs(3));
    let mut last_heartbeat_tick = Instant::now() - Duration::from_secs(60);
    let mut last_reconcile_tick = Instant::now();
    let mut peer_state_cache: HashMap<i64, (String, Instant)> = HashMap::new();
    let mut event_rx = get_federation_tx().subscribe();

    loop {
        let mut trigger_two_way_pull = false;
        tokio::select! {
            _ = interval.tick() => {},
            res = event_rx.recv() => {
                match res {
                    Ok(msg) => {
                        if msg.contains("shares_changed")
                            && (msg.contains("created") || msg.contains("updated"))
                        {
                            let _ = storage.reconcile_all_enabled_shares(None).await;
                            trigger_two_way_pull = true;
                        } else if msg.contains("shares_changed") && msg.contains("reconciled") {
                            trigger_two_way_pull = true;
                        } else if !msg.contains("queue_enqueued")
                            && !msg.contains("reconciled")
                            && !msg.contains("retry")
                        {
                            continue;
                        }
                    }
                    Err(tokio::sync::broadcast::error::RecvError::Lagged(_)) => {}
                    Err(tokio::sync::broadcast::error::RecvError::Closed) => {
                        event_rx = get_federation_tx().subscribe();
                    }
                }
            }
        }

        let Ok(conn) = storage.federation_conn() else {
            continue;
        };

        if last_heartbeat_tick.elapsed() >= HEARTBEAT_INTERVAL {
            last_heartbeat_tick = Instant::now();
            run_heartbeat_phase(
                &storage,
                &conn,
                &probe_client,
                &transfer_client,
                &mut peer_state_cache,
            )
            .await;
        }

        if trigger_two_way_pull || last_reconcile_tick.elapsed() >= SAFETY_RECONCILE_INTERVAL {
            if last_reconcile_tick.elapsed() >= SAFETY_RECONCILE_INTERVAL {
                last_reconcile_tick = Instant::now();
                if let Err(e) = storage.reconcile_all_enabled_shares(None).await {
                    warn!("Periodic federation reconcile failed: {e}");
                }
            }
            let pulled = run_two_way_pull_sync(&storage, &conn, &transfer_client, None).await;
            if pulled > 0 {
                info!("Two-way pull sync fetched {pulled} remote objects");
            }
        }

        drain_queue_phase(&storage, &conn, &transfer_client, &mut peer_state_cache).await;
    }
}
