use super::engine::FileStorage;
use super::object_ops::ObjectMeta;
use crate::db::{self, objects::ObjectRow};
use crate::error::{AppError, StorageError};
use bytes::Bytes;
use futures_util::Stream;
use std::fs;
use std::path::{Path, PathBuf};
use tokio::io::{AsyncReadExt, AsyncSeekExt};

const STREAM_CHUNK_BYTES: usize = 65_536;

fn resolve_ptr_file(dir: &Path) -> PathBuf {
    let latest = dir.join("latest");
    if latest.is_file() {
        if let Ok(ptr) = fs::read_to_string(&latest) {
            let target = dir.join(ptr.trim());
            if target.is_file() {
                return target;
            }
        }
    }
    if let Ok(entries) = fs::read_dir(dir) {
        let mut newest = None;
        let mut newest_time = std::time::SystemTime::UNIX_EPOCH;
        for entry in entries.flatten() {
            let ep = entry.path();
            if ep.is_file()
                && !ep.ends_with("latest")
                && !ep.extension().is_some_and(|ext| ext == "tags")
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
}

impl FileStorage {
    /// Streams an object directly to disk and optionally skips federation outbox enqueueing
    /// (used when receiving inbound replicated writes to prevent two-way echo loops).
    pub async fn put_object_stream_with_options<S, E>(
        &self,
        bucket: &str,
        key: &str,
        stream: S,
        encryption: Option<&str>,
        skip_federation: bool,
    ) -> Result<String, AppError>
    where
        S: Stream<Item = Result<Bytes, E>> + Unpin,
        E: std::fmt::Display,
    {
        super::object_ops::validate_storage_path(bucket, key)?;
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
            let row = ObjectRow {
                id: 0,
                bucket: bucket.to_string(),
                key: key.to_string(),
                version_id: version_id.clone(),
                size: 0,
                etag: Some("\"d41d8cd98f00b204e9800998ecf8427e\"".to_string()),
                content_type: Some(mime.to_string()),
                modified_at: chrono::Utc::now().to_rfc3339(),
                is_latest: true,
                encryption_type: None,
                retain_until_date: None,
                legal_hold: false,
                lock_mode: None,
                deleted_at: None,
                legal_hold_reason: None,
                content_hash: Some(
                    "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855".to_string(),
                ),
                compression_type: None,
                original_size: None,
                is_deduplicated: false,
            };
            db::objects::upsert_object(&conn, &row).await?;
            self.invalidate_object_list_cache(bucket, key).await;
            return Ok(version_id);
        }

        let write_res = super::streaming::write_stream_to_file(stream, &target_path).await?;
        let etag = format!("\"{}\"", write_res.content_hash);

        let row = ObjectRow {
            id: 0,
            bucket: bucket.to_string(),
            key: key.to_string(),
            version_id: version_id.clone(),
            size: write_res.total_bytes,
            etag: Some(etag.clone()),
            content_type: Some(mime.to_string()),
            modified_at: chrono::Utc::now().to_rfc3339(),
            is_latest: true,
            encryption_type: encryption.map(|s| s.to_string()),
            retain_until_date: None,
            legal_hold: false,
            lock_mode: None,
            deleted_at: None,
            legal_hold_reason: None,
            content_hash: Some(write_res.content_hash.clone()),
            compression_type: None,
            original_size: None,
            is_deduplicated: false,
        };

        db::objects::upsert_object(&conn, &row).await?;
        self.invalidate_object_list_cache(bucket, key).await;

        if !skip_federation {
            self.on_object_stored(
                bucket,
                key,
                &version_id,
                write_res.total_bytes,
                Some(&etag),
                row.content_hash.as_deref(),
            )
            .await;
        }

        if !is_versioning_enabled && raw_target.is_dir() {
            let _ = fs::write(raw_target.join("latest"), "latest");
        }

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
        S: Stream<Item = Result<Bytes, E>> + Unpin,
        E: std::fmt::Display,
    {
        self.put_object_stream_with_options(bucket, key, stream, encryption, false)
            .await
    }

    /// Resolves raw disk file path and byte length when an object can be streamed directly
    /// without decrypting or gunzipping in RAM.
    pub async fn resolve_raw_object_path(
        &self,
        bucket: &str,
        key: &str,
        version_id: Option<&str>,
    ) -> Result<Option<(PathBuf, i64, ObjectMeta)>, AppError> {
        super::object_ops::validate_storage_path(bucket, key)?;
        let meta = self.stat_object(bucket, key, version_id).await?;
        if key.ends_with('/')
            || meta.content_type == "application/x-directory"
            || meta.encryption_type.is_some()
            || meta.compression_type.is_some()
        {
            return Ok(None);
        }

        let v_id_raw = if version_id.unwrap_or("").is_empty() {
            &meta.version_id
        } else {
            version_id.unwrap_or("")
        };
        let v_id = v_id_raw.trim_matches('\'');

        let path = self.object_path(bucket, key, v_id);
        let file_path = if path.is_file() {
            path
        } else if path.is_dir() {
            resolve_ptr_file(&path)
        } else {
            let legacy = self.object_path(bucket, key, "legacy");
            if legacy.is_file() {
                legacy
            } else if legacy.is_dir() {
                resolve_ptr_file(&legacy)
            } else {
                legacy
            }
        };

        let fs_meta = tokio::fs::metadata(&file_path)
            .await
            .map_err(|_| StorageError::ObjectNotFound(format!("{bucket}/{key}")))?;
        Ok(Some((file_path, fs_meta.len() as i64, meta)))
    }
}

/// Parses an HTTP `Range: bytes=...` header against `total_len` and returns `(start, end_inclusive)`.
pub fn parse_byte_range(range_header: &str, total_len: i64) -> Result<(u64, u64), AppError> {
    if total_len <= 0 {
        return Err(StorageError::InvalidRange.into());
    }
    let spec = range_header
        .trim()
        .strip_prefix("bytes=")
        .ok_or(StorageError::InvalidRange)?;
    if spec.contains(',') {
        return Err(StorageError::InvalidRange.into());
    }
    let (start_s, end_s) = spec.split_once('-').ok_or(StorageError::InvalidRange)?;
    let total_u64 = total_len as u64;

    if start_s.is_empty() {
        let suffix_len: u64 = end_s.trim().parse().map_err(|_| StorageError::InvalidRange)?;
        if suffix_len == 0 {
            return Err(StorageError::InvalidRange.into());
        }
        let start = total_u64.saturating_sub(suffix_len);
        return Ok((start, total_u64 - 1));
    }

    let start: u64 = start_s.trim().parse().map_err(|_| StorageError::InvalidRange)?;
    if start >= total_u64 {
        return Err(StorageError::InvalidRange.into());
    }

    let end = if end_s.trim().is_empty() {
        total_u64 - 1
    } else {
        let requested_end: u64 = end_s.trim().parse().map_err(|_| StorageError::InvalidRange)?;
        requested_end.min(total_u64 - 1)
    };

    if start > end {
        return Err(StorageError::InvalidRange.into());
    }
    Ok((start, end))
}

/// Streams a local file in 64 KiB chunks with constant memory usage.
pub fn open_object_byte_stream(
    path: PathBuf,
) -> impl Stream<Item = Result<Bytes, std::io::Error>> + Send + 'static {
    async_stream::try_stream! {
        let mut file = tokio::fs::File::open(path).await?;
        let mut buf = vec![0u8; STREAM_CHUNK_BYTES];
        loop {
            let n = file.read(&mut buf).await?;
            if n == 0 {
                break;
            }
            yield Bytes::copy_from_slice(&buf[..n]);
        }
    }
}

/// Streams a specific byte slice `[start, start + length)` from disk in 64 KiB chunks.
pub fn open_object_range_stream(
    path: PathBuf,
    start: u64,
    length: u64,
) -> impl Stream<Item = Result<Bytes, std::io::Error>> + Send + 'static {
    async_stream::try_stream! {
        let mut file = tokio::fs::File::open(path).await?;
        file.seek(std::io::SeekFrom::Start(start)).await?;
        let mut remaining = length;
        let mut buf = vec![0u8; STREAM_CHUNK_BYTES];
        while remaining > 0 {
            let to_read = (remaining as usize).min(buf.len());
            let n = file.read(&mut buf[..to_read]).await?;
            if n == 0 {
                break;
            }
            remaining -= n as u64;
            yield Bytes::copy_from_slice(&buf[..n]);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::parse_byte_range;

    #[test]
    fn parses_standard_open_and_suffix_byte_ranges() {
        assert_eq!(parse_byte_range("bytes=0-9", 100).unwrap(), (0, 9));
        assert_eq!(parse_byte_range("bytes=90-", 100).unwrap(), (90, 99));
        assert_eq!(parse_byte_range("bytes=-10", 100).unwrap(), (90, 99));
        assert_eq!(parse_byte_range("bytes=50-500", 100).unwrap(), (50, 99));
        assert!(parse_byte_range("bytes=100-110", 100).is_err());
        assert!(parse_byte_range("bytes=20-10", 100).is_err());
    }
}
