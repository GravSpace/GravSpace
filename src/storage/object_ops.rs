use super::FileStorage;
use crate::crypto::aes_gcm::encrypt_bytes;
use crate::db::{self, objects::ObjectRow};
use crate::error::{AppError, StorageError};
use sha2::{Digest, Sha256};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone)]
pub struct ObjectMeta {
    pub key: String,
    pub version_id: String,
    pub size: i64,
    pub etag: String,
    pub content_type: String,
    pub mod_time: String,
    pub encryption_type: Option<String>,
    pub compression_type: Option<String>,
}

fn is_compressible(mime: &str) -> bool {
    mime.starts_with("text/")
        || mime.contains("json")
        || mime.contains("xml")
        || mime.contains("javascript")
        || mime.contains("csv")
        || mime == "image/svg+xml"
}

impl FileStorage {
    pub fn object_path(&self, bucket: &str, key: &str, version_id: &str) -> PathBuf {
        let base = self.root.join(bucket).join(key.trim_start_matches('/'));
        let clean_vid = version_id.trim_matches('\'');
        if clean_vid.is_empty() || clean_vid == "legacy" || clean_vid == "null" {
            base
        } else {
            base.join(clean_vid)
        }
    }

    pub async fn put_object_direct(
        &self,
        bucket: &str,
        key: &str,
        data: Vec<u8>,
        encryption: Option<&str>,
    ) -> Result<String, AppError> {
        let conn = self.db.conn()?;
        let is_versioning_enabled = db::buckets::get_bucket_versioning(&conn, bucket)
            .await
            .unwrap_or(false);

        let version_id = if is_versioning_enabled {
            uuid::Uuid::new_v4().to_string()
        } else {
            String::new()
        };

        let is_folder = key.ends_with('/');
        let raw_target = self.object_path(bucket, key, &version_id);
        let target_path = if !is_versioning_enabled && raw_target.is_dir() {
            raw_target.join("latest")
        } else {
            raw_target.clone()
        };

        let is_encrypted = encryption == Some("AES256");
        let mime = if is_folder {
            "application/x-directory"
        } else {
            mime_guess::from_path(key)
                .first_raw()
                .unwrap_or("application/octet-stream")
        };

        let content_hash = hex::encode(Sha256::digest(&data));
        let mut to_write = data.clone();
        let mut compression_type = None;
        let mut original_size = None;
        let mut is_deduplicated = false;

        if is_folder {
            fs::create_dir_all(&target_path).map_err(|e| StorageError::Io(e.to_string()))?;
        } else {
            if let Some(parent) = target_path.parent() {
                fs::create_dir_all(parent).map_err(|e| StorageError::Io(e.to_string()))?;
            }

            if !is_encrypted && data.len() > 512 && is_compressible(mime) {
                use flate2::write::GzEncoder;
                use flate2::Compression;
                use std::io::Write;
                let mut encoder = GzEncoder::new(Vec::new(), Compression::default());
                if encoder.write_all(&data).is_ok() {
                    if let Ok(compressed) = encoder.finish() {
                        if compressed.len() < data.len() {
                            to_write = compressed;
                            compression_type = Some("gzip".to_string());
                            original_size = Some(data.len() as i64);
                        }
                    }
                }
            }

            if is_encrypted {
                to_write = encrypt_bytes(&self.config.sse_master_key, &to_write)
                    .map_err(|e| StorageError::Io(e.to_string()))?;
            }

            if !is_encrypted {
                let cas_dir = self.root.join(".cas").join(&content_hash[..2]);
                let cas_path = cas_dir.join(&content_hash);
                let _ = fs::create_dir_all(&cas_dir);
                is_deduplicated = cas_path.exists();
                if !is_deduplicated {
                    let _ = fs::write(&cas_path, &to_write);
                }
                let _ = fs::remove_file(&target_path);
                if fs::hard_link(&cas_path, &target_path).is_err() {
                    fs::write(&target_path, &to_write).map_err(|e| StorageError::Io(e.to_string()))?;
                }
            } else {
                fs::write(&target_path, &to_write).map_err(|e| StorageError::Io(e.to_string()))?;
            }
        }

        let etag = format!("\"{}\"", hex::encode(Sha256::digest(&data)));
        let physical_size = if is_folder { 0 } else { to_write.len() as i64 };

        // Check bucket default retention for object lock
        let bucket_info = db::buckets::get_bucket(&conn, bucket).await.unwrap_or(None);
        let mut retain_until_date = None;
        let mut lock_mode = None;
        if let Some(ref b) = bucket_info {
            if b.object_lock_enabled {
                if let Some(ref mode) = b.default_retention_mode {
                    if !mode.is_empty() {
                        if let Some(days) = b.default_retention_days {
                            if days > 0 {
                                lock_mode = Some(mode.clone());
                                let retain_date = chrono::Utc::now() + chrono::Duration::days(days);
                                retain_until_date = Some(retain_date.to_rfc3339());
                            }
                        }
                    }
                }
            }
        }

        let row = ObjectRow {
            id: 0,
            bucket: bucket.to_string(),
            key: key.to_string(),
            version_id: version_id.clone(),
            size: physical_size,
            etag: Some(etag),
            content_type: Some(mime.to_string()),
            modified_at: chrono::Utc::now().to_rfc3339(),
            is_latest: true,
            encryption_type: if is_encrypted {
                Some("AES256".to_string())
            } else {
                None
            },
            retain_until_date,
            legal_hold: false,
            lock_mode,
            deleted_at: None,
            legal_hold_reason: None,
            content_hash: Some(content_hash.clone()),
            compression_type,
            original_size: original_size.or(Some(data.len() as i64)),
            is_deduplicated,
        };

        db::objects::upsert_object(&conn, &row).await?;
        self.invalidate_object_list_cache(bucket, key).await;

        Ok(version_id)
    }

    pub async fn put_object_stream<S, E>(
        &self,
        bucket: &str,
        key: &str,
        stream: S,
        encryption: Option<&str>,
    ) -> Result<String, AppError>
    where
        S: futures_util::Stream<Item = Result<bytes::Bytes, E>> + Unpin,
        E: std::fmt::Display,
    {
        let conn = self.db.conn()?;
        let is_versioning_enabled = db::buckets::get_bucket_versioning(&conn, bucket)
            .await
            .unwrap_or(false);

        let version_id = if is_versioning_enabled {
            uuid::Uuid::new_v4().to_string()
        } else {
            String::new()
        };

        let is_folder = key.ends_with('/');
        let raw_target = self.object_path(bucket, key, &version_id);
        let target_path = if !is_versioning_enabled && raw_target.is_dir() {
            raw_target.join("latest")
        } else {
            raw_target.clone()
        };

        let mime = if is_folder {
            "application/x-directory"
        } else {
            mime_guess::from_path(key)
                .first_raw()
                .unwrap_or("application/octet-stream")
        };

        if is_folder {
            fs::create_dir_all(&target_path).map_err(|e| StorageError::Io(e.to_string()))?;
            let etag = "\"d41d8cd98f00b204e9800998ecf8427e\"".to_string();
            let row = ObjectRow {
                id: 0, bucket: bucket.to_string(), key: key.to_string(), version_id: version_id.clone(),
                size: 0, etag: Some(etag), content_type: Some(mime.to_string()),
                modified_at: chrono::Utc::now().to_rfc3339(), is_latest: true, encryption_type: None,
                retain_until_date: None, legal_hold: false, lock_mode: None, deleted_at: None,
                legal_hold_reason: None,
                content_hash: Some("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855".to_string()),
                compression_type: None, original_size: None, is_deduplicated: false,
            };
            db::objects::upsert_object(&conn, &row).await?;
            self.invalidate_object_list_cache(bucket, key).await;
            return Ok(version_id);
        }

        let write_res = super::streaming::write_stream_to_file(stream, &target_path).await?;
        let etag = format!("\"{}\"", write_res.content_hash);

        let row = ObjectRow {
            id: 0, bucket: bucket.to_string(), key: key.to_string(), version_id: version_id.clone(),
            size: write_res.total_bytes, etag: Some(etag), content_type: Some(mime.to_string()),
            modified_at: chrono::Utc::now().to_rfc3339(), is_latest: true,
            encryption_type: encryption.map(|s| s.to_string()), retain_until_date: None, legal_hold: false,
            lock_mode: None, deleted_at: None, legal_hold_reason: None,
            content_hash: Some(write_res.content_hash), compression_type: None, original_size: None,
            is_deduplicated: false,
        };

        db::objects::upsert_object(&conn, &row).await?;
        self.invalidate_object_list_cache(bucket, key).await;

        if !is_versioning_enabled && raw_target.is_dir() {
            let _ = fs::write(raw_target.join("latest"), "latest");
        }

        if let Some(ref d) = self.dispatcher {
            d.dispatch(crate::workers::notifications::S3Event {
                event_name: "s3:ObjectCreated:Put".to_string(),
                bucket: bucket.to_string(),
                key: key.to_string(),
                size: write_res.total_bytes,
                etag: row.etag.clone().unwrap_or_default(),
                version_id: version_id.clone(),
                timestamp: chrono::Utc::now().to_rfc3339(),
            })
            .await;
        }

        Ok(version_id)
    }

    pub async fn copy_object_direct(
        &self,
        src_bucket: &str,
        src_key: &str,
        dst_bucket: &str,
        dst_key: &str,
    ) -> Result<String, AppError> {
        let (data, meta, _) = self.get_object(src_bucket, src_key, None, None).await?;
        self.put_object_direct(dst_bucket, dst_key, data, meta.encryption_type.as_deref())
            .await
    }

    pub async fn put_object(
        &self,
        bucket: &str,
        key: &str,
        data: Vec<u8>,
        encryption: Option<&str>,
    ) -> Result<String, AppError> {
        let physical_size = data.len() as i64;
        let version_id = self.put_object_direct(bucket, key, data, encryption).await?;

        // Webhook Event Notification on Put
        if let Some(ref d) = self.dispatcher {
            d.dispatch(crate::workers::notifications::S3Event {
                event_name: "s3:ObjectCreated:Put".to_string(),
                bucket: bucket.to_string(),
                key: key.to_string(),
                size: physical_size,
                etag: format!("\"{version_id}\""),
                version_id: version_id.clone(),
                timestamp: chrono::Utc::now().to_rfc3339(),
            })
            .await;
        }

        // Asynchronous Bucket Replication on Put
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
                                let _ = storage_clone.copy_object_direct(&src_b, &k, &dst_b, &k).await;
                            });
                        }
                    }
                }
            }
        }

        // Enqueue Cross-Server Federation Sync (skip directory markers)
        if !key.ends_with('/') {
            let _ = self
                .notify_federation_change(bucket, key, "PUT", &version_id, None, physical_size)
                .await;
        }

        Ok(version_id)
    }

    pub async fn delete_object_direct(
        &self,
        bucket: &str,
        key: &str,
        version_id: Option<&str>,
        bypass_governance: bool,
    ) -> Result<(), AppError> {
        let conn = self.db.conn()?;
        let vid = version_id.unwrap_or("");

        // 1. Check Object Lock & Legal Hold
        if let Ok(Some(obj)) = db::objects::get_object(&conn, bucket, key, vid).await {
            if obj.legal_hold {
                return Err(StorageError::ObjectLocked(format!(
                    "Object '{bucket}/{key}' is under legal hold and cannot be deleted"
                ))
                .into());
            }

            if let Some(ref retain_date_str) = obj.retain_until_date {
                if let Ok(retain_date) = chrono::DateTime::parse_from_rfc3339(retain_date_str) {
                    if chrono::Utc::now() < retain_date.with_timezone(&chrono::Utc) {
                        let lock_mode = obj.lock_mode.as_deref().unwrap_or("COMPLIANCE");
                        if lock_mode == "GOVERNANCE" && bypass_governance {
                            // allowed to bypass governance retention
                        } else {
                            return Err(StorageError::ObjectLocked(format!(
                                "Object '{bucket}/{key}' is under {lock_mode} retention until {retain_date_str} and cannot be deleted"
                            ))
                            .into());
                        }
                    }
                }
            }
        }

        let info = db::buckets::get_bucket(&conn, bucket).await?;
        let soft_delete = info.map(|b| b.soft_delete_enabled).unwrap_or(false);

        let src_path = self.object_path(bucket, key, vid);
        if soft_delete {
            db::objects::soft_delete_object(&conn, bucket, key, vid).await?;
            let trash_path = self.trash_path(bucket, key, vid);
            if let Some(parent) = trash_path.parent() {
                let _ = fs::create_dir_all(parent);
            }
            if src_path.exists() {
                let _ = fs::rename(&src_path, &trash_path);
            }
        } else {
            db::objects::hard_delete_object(&conn, bucket, key, vid).await?;
            if src_path.exists() {
                let _ = fs::remove_file(&src_path);
            }
        }

        // If key is a folder (ends with '/'), recursively delete all nested items under this prefix
        if key.ends_with('/') {
            if let Ok(sub_keys) = db::objects::get_keys_by_prefix(&conn, bucket, key).await {
                for sub_key in sub_keys {
                    if sub_key != key {
                        let _ = Box::pin(self.delete_object_direct(bucket, &sub_key, None, bypass_governance)).await;
                    }
                }
            }
        }

        self.invalidate_object_list_cache(bucket, key).await;
        Ok(())
    }

    pub async fn delete_object(
        &self,
        bucket: &str,
        key: &str,
        version_id: Option<&str>,
        bypass_governance: bool,
    ) -> Result<(), AppError> {
        let vid = version_id.unwrap_or("");
        self.delete_object_direct(bucket, key, version_id, bypass_governance).await?;

        // Webhook Event Notification on Delete
        if let Some(ref d) = self.dispatcher {
            d.dispatch(crate::workers::notifications::S3Event {
                event_name: "s3:ObjectRemoved:Delete".to_string(),
                bucket: bucket.to_string(),
                key: key.to_string(),
                size: 0,
                etag: String::new(),
                version_id: vid.to_string(),
                timestamp: chrono::Utc::now().to_rfc3339(),
            })
            .await;
        }

        // Asynchronous Bucket Replication of Deletion
        if let Ok(conn) = self.db.conn() {
            if let Ok(rules) = db::replications::list_replication_rules(&conn, bucket).await {
                for rule in rules {
                    if rule.enabled {
                        let pfx = rule.prefix.as_deref().unwrap_or("");
                        if pfx.is_empty() || key.starts_with(pfx) {
                            let storage_clone = self.clone();
                            let dst_b = rule.destination_bucket.clone();
                            let k = key.to_string();
                            let v = version_id.map(|s| s.to_string());
                            tokio::spawn(async move {
                                let _ = storage_clone
                                    .delete_object_direct(&dst_b, &k, v.as_deref(), bypass_governance)
                                    .await;
                            });
                        }
                    }
                }
            }
        }

        // Enqueue Cross-Server Federation Deletion (skip directory markers)
        if !key.ends_with('/') {
            let _ = self
                .notify_federation_change(bucket, key, "DELETE", vid, None, 0)
                .await;
        }

        Ok(())
    }

    pub async fn copy_object(
        &self,
        src_bucket: &str,
        src_key: &str,
        dst_bucket: &str,
        dst_key: &str,
    ) -> Result<String, AppError> {
        let (data, meta, _) = self.get_object(src_bucket, src_key, None, None).await?;
        self.put_object(dst_bucket, dst_key, data, meta.encryption_type.as_deref())
            .await
    }
}
