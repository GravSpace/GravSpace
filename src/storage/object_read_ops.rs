use super::engine::FileStorage;
use super::object_ops::ObjectMeta;
use crate::crypto::aes_gcm::decrypt_bytes;
use crate::db;
use crate::error::{AppError, StorageError};
use std::fs;
use std::path::PathBuf;

impl FileStorage {
    pub async fn get_object(
        &self,
        bucket: &str,
        key: &str,
        version_id: Option<&str>,
        range_header: Option<&str>,
    ) -> Result<(Vec<u8>, ObjectMeta, Option<String>), AppError> {
        let meta = self.stat_object(bucket, key, version_id).await?;
        let v_id_raw = if version_id.unwrap_or("").is_empty() {
            &meta.version_id
        } else {
            version_id.unwrap_or("")
        };
        let v_id = v_id_raw.trim_matches('\'');

        let resolve_ptr = |p: &std::path::Path| -> PathBuf {
            let latest = p.join("latest");
            if latest.is_file() {
                if let Ok(ptr) = fs::read_to_string(&latest) {
                    let target = p.join(ptr.trim());
                    if target.is_file() {
                        return target;
                    }
                }
            }
            if let Ok(entries) = fs::read_dir(p) {
                let mut newest = None;
                let mut newest_time = std::time::SystemTime::UNIX_EPOCH;
                for e in entries.flatten() {
                    let ep = e.path();
                    if ep.is_file()
                        && !ep.ends_with("latest")
                        && !ep.extension().map_or(false, |x| x == "tags")
                    {
                        if let Ok(Ok(mtime)) = ep.metadata().map(|m| m.modified()) {
                            if mtime >= newest_time {
                                newest_time = mtime;
                                newest = Some(ep);
                            }
                        }
                    }
                }
                if let Some(n) = newest {
                    return n;
                }
            }
            latest
        };

        let path = self.object_path(bucket, key, v_id);
        let file_path = if path.is_file() {
            path
        } else if path.is_dir() {
            resolve_ptr(&path)
        } else {
            let legacy = self.object_path(bucket, key, "legacy");
            if legacy.is_file() {
                legacy
            } else if legacy.is_dir() {
                resolve_ptr(&legacy)
            } else {
                legacy
            }
        };

        let raw_data = fs::read(&file_path)
            .map_err(|_| StorageError::ObjectNotFound(format!("{bucket}/{key}")))?;

        let decrypted = if meta.encryption_type.as_deref() == Some("AES256") {
            decrypt_bytes(&self.config.sse_master_key, &raw_data)
                .map_err(|e| StorageError::Io(e.to_string()))?
        } else {
            raw_data
        };

        let full_data = if meta.compression_type.as_deref() == Some("gzip") {
            use flate2::read::GzDecoder;
            use std::io::Read;
            let mut decoder = GzDecoder::new(&decrypted[..]);
            let mut decompressed = Vec::new();
            if decoder.read_to_end(&mut decompressed).is_ok() {
                decompressed
            } else {
                decrypted
            }
        } else {
            decrypted
        };

        // Handle Range header: bytes=start-end
        if let Some(range) = range_header {
            if let Some(stripped) = range.strip_prefix("bytes=") {
                let total = full_data.len() as i64;
                if let Some((start_s, end_s)) = stripped.split_once('-') {
                    let start: i64 = start_s.parse().unwrap_or(0);
                    let mut end: i64 = if end_s.is_empty() {
                        total - 1
                    } else {
                        end_s.parse().unwrap_or(total - 1)
                    };
                    if end >= total {
                        end = total - 1;
                    }

                    if start <= end && start < total {
                        let slice = full_data[start as usize..=end as usize].to_vec();
                        let content_range = format!("bytes {start}-{end}/{total}");
                        let mut final_meta = meta;
                        final_meta.size = slice.len() as i64;
                        return Ok((slice, final_meta, Some(content_range)));
                    }
                }
            }
        }

        let mut final_meta = meta;
        final_meta.size = full_data.len() as i64;
        Ok((full_data, final_meta, None))
    }

    pub async fn stat_object(
        &self,
        bucket: &str,
        key: &str,
        version_id: Option<&str>,
    ) -> Result<ObjectMeta, AppError> {
        let conn = self.db.conn()?;
        let row = db::objects::get_object(&conn, bucket, key, version_id.unwrap_or("")).await?;

        if let Some(r) = row {
            let mime = r.content_type.unwrap_or_else(|| {
                mime_guess::from_path(key)
                    .first_raw()
                    .unwrap_or("application/octet-stream")
                    .to_string()
            });

            Ok(ObjectMeta {
                key: r.key,
                version_id: r.version_id,
                size: r.original_size.unwrap_or(r.size),
                etag: r.etag.unwrap_or_default(),
                content_type: mime,
                mod_time: r.modified_at,
                encryption_type: r.encryption_type,
                compression_type: r.compression_type,
            })
        } else {
            // Fallback to filesystem stat
            let legacy_path = self.object_path(bucket, key, "legacy");
            let target_file = if legacy_path.is_file() {
                Some(legacy_path)
            } else if legacy_path.is_dir() {
                let latest = legacy_path.join("latest");
                if latest.is_file() {
                    Some(latest)
                } else {
                    None
                }
            } else {
                None
            };

            if let Some(actual_path) = target_file {
                if let Ok(meta) = fs::metadata(&actual_path) {
                    let mime = mime_guess::from_path(key)
                        .first_raw()
                        .unwrap_or("application/octet-stream")
                        .to_string();
                    return Ok(ObjectMeta {
                        key: key.to_string(),
                        version_id: "legacy".to_string(),
                        size: meta.len() as i64,
                        etag: format!("\"{}\"", meta.len()),
                        content_type: mime,
                        mod_time: chrono::Utc::now().to_rfc3339(),
                        encryption_type: None,
                        compression_type: None,
                    });
                }
            }
            Err(StorageError::ObjectNotFound(format!("{bucket}/{key}")).into())
        }
    }
}
