use super::FileStorage;
use crate::db;
use crate::error::{AppError, StorageError};
use sha2::{Digest, Sha256};
use std::fs;
use std::path::PathBuf;

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

    pub async fn complete_multipart_upload(
        &self,
        bucket: &str,
        key: &str,
        upload_id: &str,
        mut parts: Vec<(i64, String)>,
    ) -> Result<String, AppError> {
        parts.sort_by_key(|p| p.0);
        let upload_dir = self.uploads_dir(bucket, upload_id);

        let mut full_data = Vec::new();
        for (part_num, _) in &parts {
            let part_path = upload_dir.join(format!("{part_num}"));
            let part_data = fs::read(&part_path).map_err(|e| {
                StorageError::Io(format!("Part {part_num} missing: {e}"))
            })?;
            full_data.extend_from_slice(&part_data);
        }

        let version_id = self.put_object(bucket, key, full_data, None).await?;

        let _ = fs::remove_dir_all(&upload_dir);
        let conn = self.db.conn()?;
        let _ = db::multipart::delete_multipart_upload(&conn, upload_id).await;

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
