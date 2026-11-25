use super::FileStorage;
use crate::db;
use crate::error::{AppError, StorageError};
use sha2::{Digest, Sha256};
use std::fs;
use std::path::PathBuf;
use tokio::io::{AsyncReadExt, AsyncWriteExt};

impl FileStorage {
    fn uploads_dir(&self, bucket: &str, upload_id: &str) -> PathBuf {
        self.root.join(bucket).join(".uploads").join(upload_id)
    }

    pub async fn initiate_multipart_upload(
        &self,
        bucket: &str,
        key: &str,
    ) -> Result<String, AppError> {
        let upload_id = uuid::Uuid::new_v4().to_string();
        let upload_dir = self.uploads_dir(bucket, &upload_id);
        fs::create_dir_all(&upload_dir).map_err(|e| StorageError::Io(e.to_string()))?;

        let conn = self.db.conn()?;
        db::multipart::create_multipart_upload(&conn, &upload_id, bucket, key).await?;
        Ok(upload_id)
    }

    pub async fn upload_part(
        &self,
        bucket: &str,
        _key: &str,
        upload_id: &str,
        part_number: i64,
        data: Vec<u8>,
    ) -> Result<String, AppError> {
        let upload_dir = self.uploads_dir(bucket, upload_id);
        fs::create_dir_all(&upload_dir).map_err(|e| StorageError::Io(e.to_string()))?;

        let part_file = upload_dir.join(format!("{part_number}"));
        fs::write(&part_file, &data).map_err(|e| StorageError::Io(e.to_string()))?;

        let etag = format!("\"{}\"", hex::encode(Sha256::digest(&data)));
        let conn = self.db.conn()?;
        db::multipart::save_part(&conn, upload_id, part_number, &etag, data.len() as i64).await?;

        Ok(etag)
    }

    pub async fn upload_part_stream<S, E>(
        &self,
        bucket: &str,
        _key: &str,
        upload_id: &str,
        part_number: i64,
        stream: S,
    ) -> Result<String, AppError>
    where
        S: futures_util::Stream<Item = Result<bytes::Bytes, E>> + Unpin,
        E: std::fmt::Display,
    {
        let upload_dir = self.uploads_dir(bucket, upload_id);
        tokio::fs::create_dir_all(&upload_dir)
            .await
            .map_err(|e| StorageError::Io(e.to_string()))?;

        let part_file = upload_dir.join(format!("{part_number}"));
        let write_res = super::streaming::write_stream_to_file(stream, &part_file).await?;

        let etag = format!("\"{}\"", write_res.content_hash);
        let conn = self.db.conn()?;
        db::multipart::save_part(&conn, upload_id, part_number, &etag, write_res.total_bytes).await?;

        Ok(etag)
    }

    pub async fn complete_multipart_upload(
        &self,
        bucket: &str,
        key: &str,
        upload_id: &str,
        mut parts: Vec<(i64, String)>,
    ) -> Result<String, AppError> {
        parts.sort_by_key(|p| p.0);
        let upload_dir = self.uploads_dir(bucket, upload_id);

        let is_versioning_enabled = if let Ok(conn) = self.db.conn() {
            db::buckets::get_bucket_versioning(&conn, bucket).await.unwrap_or(false)
        } else {
            false
        };

        let version_id = if is_versioning_enabled {
            uuid::Uuid::new_v4().to_string()
        } else {
            String::new()
        };

        let target_path = self.object_path(bucket, key, &version_id);
        if let Some(parent) = target_path.parent() {
            tokio::fs::create_dir_all(parent).await.map_err(|e| StorageError::Io(e.to_string()))?;
        }

        let mut target_file = tokio::fs::File::create(&target_path)
            .await
            .map_err(|e| StorageError::Io(e.to_string()))?;

        let mut total_size: i64 = 0;
        let mut hasher = Sha256::new();
        let mut buf = vec![0u8; 64 * 1024];

        for (part_num, _) in &parts {
            let part_path = upload_dir.join(format!("{part_num}"));
            if let Ok(mut part_file) = tokio::fs::File::open(&part_path).await {
                while let Ok(n) = part_file.read(&mut buf).await {
                    if n == 0 { break; }
                    hasher.update(&buf[..n]);
                    target_file.write_all(&buf[..n]).await.map_err(|e| StorageError::Io(e.to_string()))?;
                    total_size += n as i64;
                }
            }
        }
        let _ = target_file.flush().await;
        drop(target_file);

        let content_hash = hex::encode(hasher.finalize());
        let etag = format!("\"{}-{content_hash}\"", parts.len());
        let mime = mime_guess::from_path(key)
            .first_raw()
            .unwrap_or("application/octet-stream");

        let row = db::objects::ObjectRow {
            id: 0,
            bucket: bucket.to_string(),
            key: key.to_string(),
            version_id: version_id.clone(),
            size: total_size,
            etag: Some(etag),
            content_type: Some(mime.to_string()),
            modified_at: chrono::Utc::now().to_rfc3339(),
            is_latest: true,
            encryption_type: None,
            retain_until_date: None,
            legal_hold: false,
            lock_mode: None,
            deleted_at: None,
            legal_hold_reason: None,
            content_hash: Some(content_hash),
            compression_type: None,
            original_size: None,
            is_deduplicated: false,
        };

        let conn = self.db.conn()?;
        db::objects::upsert_object(&conn, &row).await?;
        let _ = db::multipart::delete_multipart_upload(&conn, upload_id).await;
        let _ = fs::remove_dir_all(&upload_dir);

        self.invalidate_object_list_cache(bucket, key).await;

        Ok(version_id)
    }

    pub async fn abort_multipart_upload(
        &self,
        bucket: &str,
        _key: &str,
        upload_id: &str,
    ) -> Result<(), AppError> {
        let upload_dir = self.uploads_dir(bucket, upload_id);
        if upload_dir.exists() {
            let _ = fs::remove_dir_all(&upload_dir);
        }
        let conn = self.db.conn()?;
        db::multipart::delete_multipart_upload(&conn, upload_id).await?;
        Ok(())
    }
}
