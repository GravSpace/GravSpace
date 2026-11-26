use super::engine::FileStorage;
use crate::db;
use crate::db::federation::CrossServerShareRow;
use crate::error::AppError;
use std::collections::HashSet;

fn compute_target_key(share: &CrossServerShareRow, clean_key: &str) -> String {
    let pfx = share.source_prefix.trim_start_matches('/');
    let rel = if pfx.is_empty() {
        clean_key
    } else {
        clean_key
            .strip_prefix(pfx)
            .unwrap_or(clean_key)
            .trim_start_matches('/')
    };
    if share.target_prefix.is_empty() {
        rel.to_string()
    } else {
        format!("{}/{}", share.target_prefix.trim_matches('/'), rel)
    }
}

fn key_matches_share(share: &CrossServerShareRow, clean_key: &str) -> bool {
    let pfx = share.source_prefix.trim_start_matches('/');
    pfx.is_empty() || clean_key.starts_with(pfx)
}

impl FileStorage {
    /// Unified post-upload hook for webhook notifications, bucket replication, and cross-server federation sync.
    pub async fn on_object_stored(
        &self,
        bucket: &str,
        key: &str,
        version_id: &str,
        physical_size: i64,
        etag: Option<&str>,
        content_hash: Option<&str>,
    ) {
        if let Some(ref d) = self.dispatcher {
            d.dispatch(crate::workers::notifications::S3Event {
                event_name: "s3:ObjectCreated:Put".to_string(),
                bucket: bucket.to_string(),
                key: key.to_string(),
                size: physical_size,
                etag: etag
                    .map(str::to_string)
                    .unwrap_or_else(|| format!("\"{version_id}\"")),
                version_id: version_id.to_string(),
                timestamp: chrono::Utc::now().to_rfc3339(),
            })
            .await;
        }

        if let Ok(conn) = self.db.conn() {
            if let Ok(rules) = db::replications::list_replication_rules(&conn, bucket).await {
                for rule in rules {
                    if rule.enabled {
                        let pfx = rule.prefix.as_deref().unwrap_or("");
                        if pfx.is_empty() || key.starts_with(pfx) {
                            let storage_clone = self.clone();
                            let src_b = bucket.to_string();
                            let dst_b = rule.destination_bucket.clone();
                            let k = key.to_string();
                            tokio::spawn(async move {
                                let _ = storage_clone
                                    .copy_object_direct(&src_b, &k, &dst_b, &k)
                                    .await;
                            });
                        }
                    }
                }
            }
        }

        if !key.ends_with('/') {
            let _ = self
                .notify_federation_change(bucket, key, "PUT", version_id, content_hash, physical_size)
                .await;
        }
    }

    pub async fn notify_federation_change(
        &self,
        bucket: &str,
        key: &str,
        action: &str,
        version_id: &str,
        content_hash: Option<&str>,
        size_bytes: i64,
    ) -> Result<(), AppError> {
        if key.ends_with('/') {
            return Ok(());
        }

        let conn = match self.federation_conn() {
            Ok(c) => c,
            Err(_) => return Ok(()),
        };

        let shares = db::federation::list_shares_for_source_bucket(&conn, bucket).await?;
        let clean_key = key.trim_start_matches('/');

        for share in shares {
            if !key_matches_share(&share, clean_key) {
                continue;
            }
            if db::federation_recovery::has_pending_sync_item(&conn, share.id, clean_key, action)
                .await
                .unwrap_or(false)
            {
                crate::admin::federation_handlers::broadcast_federation_event(
                    "queue_enqueued",
                    serde_json::json!({ "share_id": share.id, "source_key": clean_key }),
                );
                continue;
            }

            let target_key = compute_target_key(&share, clean_key);
            let _ = db::federation::enqueue_sync_item(
                &conn,
                share.id,
                bucket,
                clean_key,
                &share.target_bucket,
                &target_key,
                action,
                version_id,
                content_hash,
                size_bytes,
            )
            .await;

            crate::admin::federation_handlers::broadcast_federation_event(
                "queue_enqueued",
                serde_json::json!({
                    "share_id": share.id,
                    "source_bucket": bucket,
                    "source_key": clean_key,
                    "target_bucket": share.target_bucket,
                    "target_key": target_key,
                    "action": action
                }),
            );
        }

        Ok(())
    }

    /// Manual full reconcile: enqueues all active non-folder objects matching `share_id`.
    pub async fn reconcile_share(&self, share_id: i64) -> Result<i64, AppError> {
        self.reconcile_share_inner(share_id, false).await
    }

    /// Incremental catch-up reconcile: skips objects already synced with identical hash/size,
    /// enqueues missing/modified objects, and enqueues DELETE for objects removed locally since last sync.
    pub async fn reconcile_share_incremental(&self, share_id: i64) -> Result<i64, AppError> {
        self.reconcile_share_inner(share_id, true).await
    }

    /// Runs incremental reconcile across all enabled shares (optionally filtered to a specific remote peer).
    pub async fn reconcile_all_enabled_shares(
        &self,
        peer_id: Option<i64>,
    ) -> Result<i64, AppError> {
        let fed_conn = match self.federation_conn() {
            Ok(c) => c,
            Err(_) => return Ok(0),
        };
        let shares = db::federation::list_shares(&fed_conn).await?;
        let mut total = 0;

        for share in shares {
            if !share.enabled {
                continue;
            }
            if let Some(pid) = peer_id {
                if share.remote_server_id != pid {
                    continue;
                }
            }
            if let Ok(cnt) = self.reconcile_share_incremental(share.id).await {
                total += cnt;
            }
        }
        Ok(total)
    }

    async fn reconcile_share_inner(&self, share_id: i64, incremental: bool) -> Result<i64, AppError> {
        let fed_conn = self.federation_conn()?;
        let meta_conn = self.conn()?;
        let shares = db::federation::list_shares(&fed_conn).await?;
        let share = match shares.into_iter().find(|s| s.id == share_id) {
            Some(s) => s,
            None => {
                return Err(AppError::Storage(crate::error::StorageError::BucketNotFound(
                    format!("Share #{share_id} not found"),
                )))
            }
        };

        let local_objects =
            db::objects::list_objects(&meta_conn, &share.source_bucket, &share.source_prefix)
                .await?;
        let latest_states =
            db::federation_recovery::get_share_latest_states(&fed_conn, share.id).await?;
        let mut active_keys = HashSet::new();
        let mut count = 0;

        for obj in local_objects {
            if obj.key.ends_with('/') || obj.content_type.as_deref() == Some("application/x-directory") {
                continue;
            }
            let clean_key = obj.key.trim_start_matches('/').to_string();
            active_keys.insert(clean_key.clone());

            if let Some(state) = latest_states.get(&clean_key) {
                if state.status == "pending" || state.status == "syncing" {
                    continue;
                }
                if incremental
                    && state.status == "completed"
                    && state.action == "PUT"
                    && state.size_bytes == obj.size
                    && (obj.content_hash.is_none() || state.content_hash == obj.content_hash)
                {
                    continue;
                }
            }

            let target_key = compute_target_key(&share, &clean_key);
            let _ = db::federation::enqueue_sync_item(
                &fed_conn,
                share.id,
                &share.source_bucket,
                &clean_key,
                &share.target_bucket,
                &target_key,
                "PUT",
                &obj.version_id,
                obj.content_hash.as_deref(),
                obj.size,
            )
            .await;
            count += 1;
        }

        // Catch deletions that occurred while offline / during upgrade / filesystem sync
        if incremental {
            for (prev_key, state) in &latest_states {
                if active_keys.contains(prev_key) {
                    continue;
                }
                if !key_matches_share(&share, prev_key) {
                    continue;
                }
                if state.status == "completed" && state.action == "PUT" {
                    let target_key = compute_target_key(&share, prev_key);
                    let _ = db::federation::enqueue_sync_item(
                        &fed_conn,
                        share.id,
                        &share.source_bucket,
                        prev_key,
                        &share.target_bucket,
                        &target_key,
                        "DELETE",
                        "",
                        None,
                        0,
                    )
                    .await;
                    count += 1;
                }
            }
        }

        if count > 0 {
            let _ = db::federation::update_share_status(&fed_conn, share_id, "syncing").await;
            crate::admin::federation_handlers::broadcast_federation_event(
                "reconciled",
                serde_json::json!({ "share_id": share_id, "enqueued": count }),
            );
        }
        Ok(count)
    }
}

#[cfg(test)]
mod tests {
    use crate::cache::memory::MemoryCache;
    use crate::config::Config;
    use crate::db::{self, Database};
    use crate::storage::FileStorage;
    use futures_util::stream;
    use std::sync::Arc;

    #[tokio::test]
    async fn stream_put_and_incremental_reconcile_should_sync_changes_without_duplicates() {
        let tmp = std::env::temp_dir().join(format!("grav_fed_ops_{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&tmp).unwrap();

        let turso = Database::open_turso(tmp.join("turso.db").to_str().unwrap()).await.unwrap();
        let vault = Database::open_vault(tmp.join("vault.db").to_str().unwrap()).await.unwrap();
        let fed = Database::open_federation(tmp.join("fed.db").to_str().unwrap()).await.unwrap();

        let mut cfg = Config::load();
        cfg.redis_url = None;
        let storage = FileStorage::new(
            tmp.join("data"),
            turso.clone(),
            vault,
            fed.clone(),
            Arc::new(MemoryCache::default()),
            Arc::new(cfg),
            None,
        );

        let t_conn = turso.conn().unwrap();
        db::buckets::create_bucket(&t_conn, "edge", "admin").await.unwrap();

        let f_conn = fed.conn().unwrap();
        let peer_id = db::federation::create_remote_server(&f_conn, "p1", "http://127.0.0.1:9999", None, "ak", "sk").await.unwrap();
        let share_id = db::federation::create_share(&f_conn, "s1", "edge", "medias/", peer_id, "s3", "backup/", "one_way").await.unwrap();

        // 1. Upload via put_object_stream (S3 API path) must enqueue PUT immediately
        let body = stream::iter(vec![Ok::<bytes::Bytes, std::io::Error>(bytes::Bytes::from_static(b"hello-s3"))]);
        storage.put_object_stream("edge", "medias/a.txt", body, None).await.unwrap();

        let q1 = db::federation::list_sync_queue(&f_conn, None, 20).await.unwrap();
        assert_eq!(q1.len(), 1);
        assert_eq!(q1[0].action, "PUT");
        assert_eq!(q1[0].target_key, "backup/a.txt");
        assert!(q1[0].content_hash.is_some());

        // Mark completed, then incremental reconcile should skip identical object (0 enqueued)
        db::federation::mark_item_completed(&f_conn, q1[0].id).await.unwrap();
        assert_eq!(storage.reconcile_share_incremental(share_id).await.unwrap(), 0);

        // Hard-delete directly in DB (simulating offline deletion) -> incremental reconcile catches DELETE
        db::objects::hard_delete_object(&t_conn, "edge", "medias/a.txt", "").await.unwrap();
        assert_eq!(storage.reconcile_share_incremental(share_id).await.unwrap(), 1);
        let q2 = db::federation::list_sync_queue(&f_conn, None, 20).await.unwrap();
        assert_eq!(q2[0].action, "DELETE");

        let _ = std::fs::remove_dir_all(&tmp);
    }
}
