use crate::auth::signature::sha256_hex;
use crate::db;
use crate::db::federation::{CrossServerShareRow, RemoteServerRow};
use crate::storage::federation_provenance::build_provenance_headers;
use crate::storage::FileStorage;
use crate::workers::federation_transfer::{resolve_target_endpoint, sign_s3_request};
use std::time::Duration;
use tracing::debug;

fn attach_headers(
    mut builder: reqwest::RequestBuilder,
    headers: Vec<(&'static str, String)>,
) -> reqwest::RequestBuilder {
    for (k, v) in headers {
        builder = builder.header(k, v);
    }
    builder
}

/// Sends a lightweight `HEAD` or metadata signal to the target peer so existing buckets/folders
/// immediately display inbound federation badges even before a new object upload occurs.
pub async fn announce_share_to_target(
    client: &reqwest::Client,
    share: &CrossServerShareRow,
    peer: &RemoteServerRow,
    state: &str,
) {
    let (base_ep, use_sigv4) = resolve_target_endpoint(peer);
    let bucket = share.target_bucket.trim_matches('/');
    if bucket.is_empty() {
        return;
    }

    let prov_headers = build_provenance_headers(share, state);
    let req = if use_sigv4 {
        let target_url = format!("{base_ep}/{bucket}");
        let builder = attach_headers(client.head(&target_url), prov_headers);
        let empty_hash = sha256_hex(b"");
        sign_s3_request(builder, "HEAD", &base_ep, bucket, "", "", &empty_hash, peer)
    } else {
        let target_url = format!("{base_ep}/admin/buckets/{bucket}/info");
        attach_headers(client.get(&target_url), prov_headers)
            .header("Authorization", format!("Bearer {}", peer.secret_key))
            .header("User-Agent", "GravSpace-Federation/0.2.0")
    };

    if let Err(e) = req.send().await {
        debug!("Share announcement to peer '{}' skipped: {e}", peer.name);
    }
}

/// Announces all enabled shares to their target peers (used once at startup recovery).
pub async fn announce_all_enabled_shares(storage: &FileStorage) {
    let Ok(conn) = storage.federation_conn() else {
        return;
    };
    let Ok(shares) = db::federation::list_shares(&conn).await else {
        return;
    };
    let Ok(peers) = db::federation::list_remote_servers(&conn).await else {
        return;
    };
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(5))
        .build()
        .unwrap_or_else(|_| reqwest::Client::new());

    for share in shares.into_iter().filter(|s| s.enabled) {
        if let Some(peer) = peers.iter().find(|p| p.id == share.remote_server_id) {
            announce_share_to_target(&client, &share, peer, "active").await;
        }
    }
}

/// Spawns a non-blocking share announcement using a snapshot of the share & peer.
pub fn spawn_share_announcement(
    share: CrossServerShareRow,
    peer: RemoteServerRow,
    state: &'static str,
) {
    tokio::spawn(async move {
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(5))
            .build()
            .unwrap_or_else(|_| reqwest::Client::new());
        announce_share_to_target(&client, &share, &peer, state).await;
    });
}

/// Looks up share and peer by share ID and announces active/disabled state asynchronously.
pub fn spawn_share_announcement_by_id(
    storage: FileStorage,
    share_id: i64,
    state: &'static str,
) {
    tokio::spawn(async move {
        let Ok(conn) = storage.federation_conn() else {
            return;
        };
        let Ok(shares) = db::federation::list_shares(&conn).await else {
            return;
        };
        let Some(share) = shares.into_iter().find(|s| s.id == share_id) else {
            return;
        };
        let Ok(Some(peer)) = db::federation::get_remote_server(&conn, share.remote_server_id).await else {
            return;
        };
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(5))
            .build()
            .unwrap_or_else(|_| reqwest::Client::new());
        announce_share_to_target(&client, &share, &peer, state).await;
    });
}
