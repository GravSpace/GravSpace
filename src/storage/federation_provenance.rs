use super::engine::FileStorage;
use crate::admin::network_handlers;
use crate::db::federation::CrossServerShareRow;
use crate::db::federation_inbound::{
    remove_inbound_share_by_key, upsert_inbound_share, InboundShareUpsert,
};
use axum::http::HeaderMap;
use tracing::warn;

pub const HDR_REPLICATED: &str = "x-gravspace-replicated";
pub const HDR_SOURCE_NODE: &str = "x-gravspace-source-node";
pub const HDR_SOURCE_BUCKET: &str = "x-gravspace-source-bucket";
pub const HDR_SOURCE_PREFIX: &str = "x-gravspace-source-prefix";
pub const HDR_TARGET_PREFIX: &str = "x-gravspace-target-prefix";
pub const HDR_SYNC_MODE: &str = "x-gravspace-sync-mode";
pub const HDR_SHARE_NAME: &str = "x-gravspace-share-name";
pub const HDR_FEDERATION_STATE: &str = "x-gravspace-federation-state";

fn sanitize_header_val(raw: &str, max_len: usize) -> String {
    raw.trim()
        .chars()
        .filter(|c| c.is_ascii() && !c.is_ascii_control())
        .take(max_len)
        .collect()
}

/// Resolves a readable ASCII source node identifier for federation headers.
pub fn local_source_node_name() -> String {
    if let Ok(name) = std::env::var("GRAVSPACE_NODE_NAME") {
        let clean = sanitize_header_val(&name, 96);
        if !clean.is_empty() {
            return clean;
        }
    }
    let host = sanitize_header_val(&network_handlers::get_hostname(), 96);
    if !host.is_empty() && host != "localhost" {
        return host;
    }
    network_handlers::detect_local_ip()
        .map(|ip| sanitize_header_val(&ip, 64))
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "gravspace-node".to_string())
}

/// Builds provenance headers attached to replicated PUT/DELETE/HEAD requests toward Target peers.
pub fn build_provenance_headers(
    share: &CrossServerShareRow,
    state: &str,
) -> Vec<(&'static str, String)> {
    vec![
        (HDR_REPLICATED, "1".to_string()),
        (HDR_SOURCE_NODE, local_source_node_name()),
        (HDR_SOURCE_BUCKET, sanitize_header_val(&share.source_bucket, 128)),
        (HDR_SOURCE_PREFIX, sanitize_header_val(&share.source_prefix, 256)),
        (HDR_TARGET_PREFIX, sanitize_header_val(&share.target_prefix, 256)),
        (HDR_SYNC_MODE, sanitize_header_val(&share.sync_mode, 24)),
        (HDR_SHARE_NAME, sanitize_header_val(&share.name, 128)),
        (HDR_FEDERATION_STATE, sanitize_header_val(state, 24)),
    ]
}

fn header_str(headers: &HeaderMap, name: &str) -> Option<String> {
    headers
        .get(name)
        .and_then(|v| v.to_str().ok())
        .map(|s| sanitize_header_val(s, 256))
}

impl FileStorage {
    /// Records or removes inbound federation provenance from an authenticated peer request.
    pub async fn record_inbound_from_headers(
        &self,
        headers: &HeaderMap,
        target_bucket: &str,
        fallback_actor: &str,
    ) {
        let is_replicated = header_str(headers, HDR_REPLICATED).as_deref() == Some("1");
        let explicit_source_bucket = header_str(headers, HDR_SOURCE_BUCKET);
        if !is_replicated && explicit_source_bucket.is_none() {
            return;
        }

        let Ok(conn) = self.federation_conn() else {
            return;
        };

        let source_node = header_str(headers, HDR_SOURCE_NODE)
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| sanitize_header_val(fallback_actor, 96));
        let source_bucket = explicit_source_bucket
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| target_bucket.to_string());
        let source_prefix = header_str(headers, HDR_SOURCE_PREFIX).unwrap_or_default();
        let target_prefix = header_str(headers, HDR_TARGET_PREFIX).unwrap_or_default();
        let sync_mode = match header_str(headers, HDR_SYNC_MODE).as_deref() {
            Some("two_way") => "two_way",
            _ => "one_way",
        };
        let share_name = header_str(headers, HDR_SHARE_NAME).unwrap_or_default();
        let state = header_str(headers, HDR_FEDERATION_STATE).unwrap_or_default();

        if state == "removed" || state == "disabled" {
            if let Err(e) = remove_inbound_share_by_key(
                &conn,
                &source_node,
                &source_bucket,
                &source_prefix,
                target_bucket,
                &target_prefix,
            )
            .await
            {
                warn!("Failed removing inbound share binding: {e}");
            }
            return;
        }

        let res = upsert_inbound_share(
            &conn,
            &InboundShareUpsert {
                source_node: &source_node,
                source_bucket: &source_bucket,
                source_prefix: &source_prefix,
                target_bucket,
                target_prefix: &target_prefix,
                sync_mode,
                share_name: &share_name,
            },
        )
        .await;
        if let Err(e) = res {
            warn!("Failed recording inbound federation binding: {e}");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::audit::AuditLogger;
    use crate::MemoryCache;
    use crate::config::Config;
    use crate::db::federation_inbound::list_inbound_shares;
    use crate::db::Database;
    use axum::http::HeaderValue;
    use std::sync::Arc;

    #[tokio::test]
    async fn record_inbound_from_headers_tracks_and_removes_bindings() {
        let dir = std::env::temp_dir().join(format!("grav_fed_prov_{}", uuid::Uuid::new_v4()));
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
            cfg,
            Some(audit),
        );

        let mut headers = HeaderMap::new();
        headers.insert(HDR_REPLICATED, HeaderValue::from_static("1"));
        headers.insert(HDR_SOURCE_NODE, HeaderValue::from_static("Server 83"));
        headers.insert(HDR_SOURCE_BUCKET, HeaderValue::from_static("app-data"));
        headers.insert(HDR_SOURCE_PREFIX, HeaderValue::from_static("multi-db/"));
        headers.insert(HDR_TARGET_PREFIX, HeaderValue::from_static("multi-db/"));
        headers.insert(HDR_SYNC_MODE, HeaderValue::from_static("one_way"));
        headers.insert(HDR_SHARE_NAME, HeaderValue::from_static("MultiDB"));

        storage
            .record_inbound_from_headers(&headers, "app-data", "s3-sync")
            .await;

        let conn = storage.federation_conn().expect("fed_conn");
        let list = list_inbound_shares(&conn, Some("app-data")).await.expect("list");
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].source_node, "Server 83");
        assert_eq!(list[0].target_prefix, "multi-db/");

        headers.insert(HDR_FEDERATION_STATE, HeaderValue::from_static("removed"));
        storage
            .record_inbound_from_headers(&headers, "app-data", "s3-sync")
            .await;
        assert!(list_inbound_shares(&conn, None).await.expect("list after remove").is_empty());
    }
}
