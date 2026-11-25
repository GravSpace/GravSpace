use super::engine::FileStorage;
use crate::db;
use crate::error::AppError;

impl FileStorage {
    pub async fn notify_federation_change(
        &self,
        bucket: &str,
        key: &str,
        action: &str,
        version_id: &str,
        content_hash: Option<&str>,
        size_bytes: i64,
    ) -> Result<(), AppError> {
        // Do not enqueue directory markers (virtual folders) into replication queue
        if key.ends_with('/') {
            return Ok(());
        }

        let conn = match self.federation_conn() {
            Ok(c) => c,
            Err(_) => return Ok(()),
        };

        let shares = db::federation::list_shares_for_source_bucket(&conn, bucket).await?;
        for share in shares {
            let pfx = share.source_prefix.trim_start_matches('/');
            let clean_key = key.trim_start_matches('/');

            let matches = if pfx.is_empty() {
                true
            } else {
                clean_key.starts_with(pfx)
            };

            if matches {
                let target_key = if pfx.is_empty() {
                    if share.target_prefix.is_empty() {
                        clean_key.to_string()
                    } else {
                        format!("{}/{}", share.target_prefix.trim_matches('/'), clean_key)
                    }
                } else {
                    let relative = clean_key.strip_prefix(pfx).unwrap_or(clean_key).trim_start_matches('/');
                    if share.target_prefix.is_empty() {
                        relative.to_string()
                    } else {
                        format!("{}/{}", share.target_prefix.trim_matches('/'), relative)
                    }
                };

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

                crate::admin::federation_handlers::broadcast_federation_event("queue_enqueued", serde_json::json!({
                    "share_id": share.id,
                    "source_bucket": bucket,
                    "source_key": clean_key,
                    "target_bucket": share.target_bucket,
                    "target_key": target_key,
                    "action": action
                }));
            }
        }

        Ok(())
    }

    pub async fn reconcile_share(&self, share_id: i64) -> Result<i64, AppError> {
        let fed_conn = self.federation_conn()?;
        let meta_conn = self.conn()?;
        let shares = db::federation::list_shares(&fed_conn).await?;
        let share = match shares.into_iter().find(|s| s.id == share_id) {
            Some(s) => s,
            None => return Err(AppError::Storage(crate::error::StorageError::BucketNotFound(format!("Share #{share_id} not found")))),
        };

        let local_objects = db::objects::list_objects(&meta_conn, &share.source_bucket, &share.source_prefix).await?;
        let mut count = 0;

        for obj in local_objects {
            // Skip folder markers as directories are implicitly created upon syncing objects
            if obj.key.ends_with('/') || obj.content_type.as_deref() == Some("application/x-directory") {
                continue;
            }

            let clean_key = obj.key.trim_start_matches('/');
            let pfx = share.source_prefix.trim_start_matches('/');

            let target_key = if pfx.is_empty() {
                if share.target_prefix.is_empty() {
                    clean_key.to_string()
                } else {
                    format!("{}/{}", share.target_prefix.trim_matches('/'), clean_key)
                }
            } else {
                let relative = clean_key.strip_prefix(pfx).unwrap_or(clean_key).trim_start_matches('/');
                if share.target_prefix.is_empty() {
                    relative.to_string()
                } else {
                    format!("{}/{}", share.target_prefix.trim_matches('/'), relative)
                }
            };

            let _ = db::federation::enqueue_sync_item(
                &fed_conn,
                share.id,
                &share.source_bucket,
                clean_key,
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

        let _ = db::federation::update_share_status(&fed_conn, share_id, "syncing").await;
        Ok(count)
    }
}
