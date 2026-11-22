use crate::auth::signature::{build_string_to_sign, calculate_signature, sha256_hex, uri_encode};
use crate::db;
use crate::storage::FileStorage;
use chrono::Utc;
use std::time::Duration;
use tracing::{debug, info, warn};

fn sign_s3_request(
    builder: reqwest::RequestBuilder,
    method: &str,
    endpoint: &str,
    bucket: &str,
    encoded_key: &str,
    payload: &[u8],
    access_key: &str,
    secret_key: &str,
) -> reqwest::RequestBuilder {
    let now = Utc::now();
    let amz_date = now.format("%Y%m%dT%H%M%SZ").to_string();
    let date_stamp = now.format("%Y%m%d").to_string();

    let stripped = endpoint
        .strip_prefix("https://")
        .or_else(|| endpoint.strip_prefix("http://"))
        .unwrap_or(endpoint);
    let host = stripped.split('/').next().unwrap_or(stripped);

    let payload_hash = sha256_hex(payload);
    let canonical_uri = format!("/{}/{}", bucket.trim_matches('/'), encoded_key.trim_matches('/'));
    let canonical_headers = format!("host:{host}\nx-amz-content-sha256:{payload_hash}\nx-amz-date:{amz_date}\n");
    let signed_headers = "host;x-amz-content-sha256;x-amz-date";
    let canonical_request = format!("{method}\n{canonical_uri}\n\n{canonical_headers}\n{signed_headers}\n{payload_hash}");

    let algorithm = "AWS4-HMAC-SHA256";
    let credential_scope = format!("{date_stamp}/us-east-1/s3/aws4_request");
    let string_to_sign = build_string_to_sign(algorithm, &amz_date, &credential_scope, &canonical_request);

    let signature = calculate_signature(secret_key, &date_stamp, "us-east-1", "s3", &string_to_sign);
    let auth_header = format!(
        "{algorithm} Credential={access_key}/{credential_scope}, SignedHeaders={signed_headers}, Signature={signature}"
    );

    builder
        .header("Host", host)
        .header("User-Agent", "GravSpace-Federation/0.2.0")
        .header("x-amz-date", amz_date)
        .header("x-amz-content-sha256", payload_hash)
        .header("Authorization", auth_header)
}

pub async fn start_federation_worker(storage: FileStorage) {
    info!("GravSpace Federation & Resilient Outbox worker started");
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(5))
        .build()
        .unwrap_or_else(|_| reqwest::Client::new());

    let mut interval = tokio::time::interval(Duration::from_secs(3));

    loop {
        interval.tick().await;

        let conn = match storage.db.conn() {
            Ok(c) => c,
            Err(_) => continue,
        };

        // 1. Heartbeat Phase: check health of remote peers
        if let Ok(peers) = db::federation::list_remote_servers(&conn).await {
            for peer in peers {
                let health_url = format!("{}/health", peer.endpoint.trim_end_matches('/'));
                let start = std::time::Instant::now();
                match client.get(&health_url).send().await {
                    Ok(resp) if resp.status().is_success() || resp.status() == 404 => {
                        let latency = start.elapsed().as_millis() as i64;
                        let _ = db::federation::update_server_status(&conn, peer.id, "healthy", latency).await;
                        crate::admin::federation_handlers::broadcast_federation_event("peer_heartbeat", serde_json::json!({
                            "id": peer.id,
                            "status": "healthy",
                            "latency_ms": latency
                        }));
                    }
                    Ok(resp) => {
                        let latency = start.elapsed().as_millis() as i64;
                        let status_str = if resp.status().is_server_error() { "degraded" } else { "healthy" };
                        let _ = db::federation::update_server_status(&conn, peer.id, status_str, latency).await;
                        crate::admin::federation_handlers::broadcast_federation_event("peer_heartbeat", serde_json::json!({
                            "id": peer.id,
                            "status": status_str,
                            "latency_ms": latency
                        }));
                    }
                    Err(_) => {
                        let _ = db::federation::update_server_status(&conn, peer.id, "unreachable", 0).await;
                        crate::admin::federation_handlers::broadcast_federation_event("peer_heartbeat", serde_json::json!({
                            "id": peer.id,
                            "status": "unreachable",
                            "latency_ms": 0
                        }));
                    }
                }
            }
        }

        // 2. Queue Drain Phase: Process pending sync outbox items
        let pending_items = match db::federation::get_pending_sync_items(&conn, 10).await {
            Ok(items) => items,
            Err(_) => continue,
        };

        if pending_items.is_empty() {
            continue;
        }

        let shares = db::federation::list_shares(&conn).await.unwrap_or_default();
        let peers = db::federation::list_remote_servers(&conn).await.unwrap_or_default();

        for item in pending_items {
            let share = match shares.iter().find(|s| s.id == item.share_id) {
                Some(s) if s.enabled => s,
                _ => {
                    let _ = db::federation::mark_item_completed(&conn, item.id).await;
                    continue;
                }
            };

            let peer = match peers.iter().find(|p| p.id == share.remote_server_id) {
                Some(p) => p,
                None => {
                    let _ = db::federation::mark_item_failed(
                        &conn,
                        item.id,
                        "Remote server peer not found",
                        60,
                    )
                    .await;
                    continue;
                }
            };

            let is_s3_peer = peer.s3_endpoint.is_some()
                || (!peer.access_key.is_empty() && !peer.secret_key.starts_with("eyJ"));

            let base_ep = if let Some(ref s3_ep) = peer.s3_endpoint {
                if !s3_ep.trim().is_empty() {
                    s3_ep.trim_end_matches('/')
                } else {
                    peer.endpoint.trim_end_matches('/')
                }
            } else {
                peer.endpoint.trim_end_matches('/')
            };

            let encoded_key: String = item
                .target_key
                .trim_start_matches('/')
                .split('/')
                .map(|seg| uri_encode(seg, true))
                .collect::<Vec<_>>()
                .join("/");

            let (target_url, use_sigv4) = if is_s3_peer {
                (
                    format!("{base_ep}/{}/{}", item.target_bucket, encoded_key),
                    true,
                )
            } else {
                (
                    format!("{base_ep}/admin/buckets/{}/objects/{}", item.target_bucket, encoded_key),
                    false,
                )
            };

            let sync_result = if item.action == "DELETE" {
                let req_builder = client.delete(&target_url);
                let req = if use_sigv4 {
                    sign_s3_request(
                        req_builder,
                        "DELETE",
                        base_ep,
                        &item.target_bucket,
                        &encoded_key,
                        b"",
                        &peer.access_key,
                        &peer.secret_key,
                    )
                } else {
                    req_builder
                        .header("Authorization", format!("Bearer {}", peer.secret_key))
                        .header("User-Agent", "GravSpace-Federation/0.2.0")
                };
                req.send().await
            } else {
                // Action == "PUT"
                match storage
                    .get_object(&item.source_bucket, &item.source_key, None, None)
                    .await
                {
                    Ok((data, meta, _)) => {
                        let req_builder = client
                            .put(&target_url)
                            .header("Content-Type", meta.content_type.clone())
                            .body(data.clone());
                        let req = if use_sigv4 {
                            sign_s3_request(
                                req_builder,
                                "PUT",
                                base_ep,
                                &item.target_bucket,
                                &encoded_key,
                                &data,
                                &peer.access_key,
                                &peer.secret_key,
                            )
                        } else {
                            req_builder
                                .header("Authorization", format!("Bearer {}", peer.secret_key))
                                .header("User-Agent", "GravSpace-Federation/0.2.0")
                        };
                        req.send().await
                    }
                    Err(e) => {
                        let _ = db::federation::mark_item_failed(
                            &conn,
                            item.id,
                            &format!("Local object read error: {e}"),
                            30,
                        )
                        .await;
                        continue;
                    }
                }
            };

            match sync_result {
                Ok(resp) if resp.status().is_success() || (item.action == "DELETE" && resp.status() == 404) => {
                    let _ = db::federation::mark_item_completed(&conn, item.id).await;
                    let _ = db::federation::update_share_status(&conn, share.id, "in_sync").await;
                    crate::admin::federation_handlers::broadcast_federation_event("queue_updated", serde_json::json!({
                        "id": item.id,
                        "share_id": share.id,
                        "status": "completed"
                    }));
                    debug!("Sync completed for {} -> {}", item.source_key, item.target_key);
                }
                Ok(resp) => {
                    let status = resp.status();
                    let err_body = resp.text().await.unwrap_or_else(|_| "Unknown HTTP error".to_string());
                    let attempts = item.attempts + 1;
                    let exp_delay = (2_i64.pow(attempts.min(7) as u32) * 2).min(300);
                    let err_msg = format!("HTTP {status}: {err_body}");
                    warn!("Sync failed for item #{}: {err_msg}, retrying in {exp_delay}s", item.id);
                    let _ = db::federation::mark_item_failed(&conn, item.id, &err_msg, exp_delay).await;
                    let _ = db::federation::update_share_status(&conn, share.id, "pending_retry").await;
                    crate::admin::federation_handlers::broadcast_federation_event("queue_updated", serde_json::json!({
                        "id": item.id,
                        "share_id": share.id,
                        "status": "failed",
                        "last_error": err_msg
                    }));
                }
                Err(e) => {
                    let attempts = item.attempts + 1;
                    let exp_delay = (2_i64.pow(attempts.min(7) as u32) * 2).min(300);
                    let err_msg = format!("Network/Connection error: {e}");
                    warn!("Sync network failure for item #{}: {err_msg}, retrying in {exp_delay}s", item.id);
                    let _ = db::federation::mark_item_failed(&conn, item.id, &err_msg, exp_delay).await;
                    let _ = db::federation::update_share_status(&conn, share.id, "pending_retry").await;
                    let _ = db::federation::update_server_status(&conn, peer.id, "unreachable", 0).await;
                    crate::admin::federation_handlers::broadcast_federation_event("queue_updated", serde_json::json!({
                        "id": item.id,
                        "share_id": share.id,
                        "status": "failed",
                        "last_error": err_msg
                    }));
                }
            }
        }
    }
}
