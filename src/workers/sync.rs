use crate::db::{self, objects::ObjectRow};
use crate::storage::FileStorage;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::Duration;
use tracing::{error, info};

pub async fn start_sync_worker(storage: FileStorage, interval_secs: u64) {
    info!("Filesystem sync worker started with interval: {interval_secs}s");
    let mut interval = tokio::time::interval(Duration::from_secs(interval_secs));

    loop {
        interval.tick().await;
        if let Err(e) = sync_all(&storage).await {
            error!("Filesystem sync error: {e}");
        } else {
            let _ = storage.reconcile_all_enabled_shares(None).await;
        }
    }
}

pub async fn sync_all(storage: &FileStorage) -> Result<(), String> {
    if !storage.root.is_dir() {
        return Ok(());
    }

    let entries = fs::read_dir(&storage.root).map_err(|e| e.to_string())?;
    for entry in entries.flatten() {
        if entry.path().is_dir() {
            let name = entry.file_name().to_string_lossy().to_string();
            if !name.starts_with('.') {
                let _ = sync_bucket(storage, &name).await;
            }
        }
    }
    Ok(())
}

pub async fn sync_bucket(storage: &FileStorage, bucket: &str) -> Result<(), String> {
    let bucket_dir = storage.root.join(bucket);
    if !bucket_dir.is_dir() {
        return Ok(());
    }

    // Ensure bucket exists in DB
    if let Ok(conn) = storage.db.conn() {
        let _ = db::buckets::create_bucket(&conn, bucket, "admin").await;
    }

    walk_and_index(storage, bucket, &bucket_dir, "").await
}

fn is_version_dir(dir: &Path) -> Option<(PathBuf, String, u64)> {
    let latest_path = dir.join("latest");
    if latest_path.is_file() {
        if let Ok(ptr) = fs::read_to_string(&latest_path) {
            let trimmed = ptr.trim();
            let v_path = dir.join(trimmed);
            if v_path.is_file() {
                if let Ok(m) = fs::metadata(&v_path) {
                    return Some((v_path, trimmed.to_string(), m.len()));
                }
            }
        }
        if let Ok(m) = fs::metadata(&latest_path) {
            return Some((latest_path, "legacy".to_string(), m.len()));
        }
    }

    if let Ok(entries) = fs::read_dir(dir) {
        let mut newest_file = None;
        let mut newest_time = std::time::SystemTime::UNIX_EPOCH;
        let mut newest_size = 0;
        let mut newest_v_id = String::new();
        let mut has_version_files = false;

        for e in entries.flatten() {
            let p = e.path();
            if p.is_file() {
                let name = p.file_name().and_then(|n| n.to_str()).unwrap_or("");
                if name.ends_with(".tags") {
                    continue;
                }
                let is_uuid = name.len() == 36 && name.chars().filter(|&c| c == '-').count() == 4;
                let is_timestamp = name.len() >= 10 && name.chars().all(|c| c.is_ascii_digit());

                if is_uuid || is_timestamp {
                    has_version_files = true;
                    if let Ok(m) = p.metadata() {
                        if let Ok(mod_time) = m.modified() {
                            if mod_time >= newest_time {
                                newest_time = mod_time;
                                newest_size = m.len();
                                newest_v_id = name.to_string();
                                newest_file = Some(p);
                            }
                        }
                    }
                }
            }
        }

        if has_version_files {
            if let Some(target) = newest_file {
                return Some((target, newest_v_id, newest_size));
            }
        }
    }

    None
}

async fn walk_and_index(
    storage: &FileStorage,
    bucket: &str,
    dir: &Path,
    prefix: &str,
) -> Result<(), String> {
    let entries = match fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return Ok(()),
    };

    for entry in entries.flatten() {
        let path = entry.path();
        let file_name = entry.file_name().to_string_lossy().to_string();

        if file_name.starts_with('.') {
            continue;
        }

        if path.is_dir() {
            if let Some((_v_path, v_id, size)) = is_version_dir(&path) {
                let key = if prefix.is_empty() {
                    file_name.clone()
                } else {
                    format!("{prefix}{file_name}")
                };
                let row = ObjectRow {
                    id: 0,
                    bucket: bucket.to_string(),
                    key: key.clone(),
                    version_id: v_id,
                    size: size as i64,
                    etag: Some(format!("\"{size}\"")),
                    content_type: Some(
                        mime_guess::from_path(&key)
                            .first_raw()
                            .unwrap_or("application/octet-stream")
                            .to_string(),
                    ),
                    modified_at: chrono::Utc::now().to_rfc3339(),
                    is_latest: true,
                    encryption_type: None,
                    retain_until_date: None,
                    legal_hold: false,
                    lock_mode: None,
                    deleted_at: None,
                    legal_hold_reason: None,
                    content_hash: None,
                    compression_type: None,
                    original_size: None,
                    is_deduplicated: false,
                };
                if let Ok(conn) = storage.db.conn() {
                    let _ = db::objects::upsert_object(&conn, &row).await;
                }
                continue;
            }

            let next_prefix = if prefix.is_empty() {
                format!("{file_name}/")
            } else {
                format!("{prefix}{file_name}/")
            };
            let _ = Box::pin(walk_and_index(storage, bucket, &path, &next_prefix)).await;
        } else if path.is_file() {
            let key = if prefix.is_empty() {
                file_name.clone()
            } else {
                format!("{prefix}{file_name}")
            };

            let meta = match fs::metadata(&path) {
                Ok(m) => m,
                Err(_) => continue,
            };

            let row = ObjectRow {
                id: 0,
                bucket: bucket.to_string(),
                key: key.clone(),
                version_id: "legacy".to_string(),
                size: meta.len() as i64,
                etag: Some(format!("\"{}\"", meta.len())),
                content_type: Some(
                    mime_guess::from_path(&key)
                        .first_raw()
                        .unwrap_or("application/octet-stream")
                        .to_string(),
                ),
                modified_at: chrono::Utc::now().to_rfc3339(),
                is_latest: true,
                encryption_type: None,
                retain_until_date: None,
                legal_hold: false,
                lock_mode: None,
                deleted_at: None,
                legal_hold_reason: None,
                content_hash: None,
                compression_type: None,
                original_size: None,
                is_deduplicated: false,
            };

            if let Ok(conn) = storage.db.conn() {
                let _ = db::objects::upsert_object(&conn, &row).await;
            }
        }
    }
    Ok(())
}
