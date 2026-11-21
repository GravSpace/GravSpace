use super::FileStorage;
use crate::db::{self, objects::ObjectRow};
use crate::error::AppError;
use std::fs;

impl FileStorage {
    pub async fn set_bucket_soft_delete(
        &self,
        bucket: &str,
        enabled: bool,
        retention_days: i64,
    ) -> Result<(), AppError> {
        let conn = self.db.conn()?;
        db::buckets::set_bucket_soft_delete(&conn, bucket, enabled, retention_days).await?;
        self.invalidate_bucket_cache(bucket).await;
        Ok(())
    }

    pub async fn list_trash(
        &self,
        bucket: &str,
        search: &str,
    ) -> Result<Vec<ObjectRow>, AppError> {
        let conn = self.db.conn()?;
        db::objects::list_trash(&conn, bucket, search).await
    }

    pub async fn restore_object(
        &self,
        bucket: &str,
        key: &str,
        version_id: &str,
    ) -> Result<(), AppError> {
        let conn = self.db.conn()?;
        db::objects::restore_object(&conn, bucket, key, version_id).await?;
        let trash_path = self.trash_path(bucket, key, version_id);
        let live_path = self.object_path(bucket, key, version_id);
        if let Some(parent) = live_path.parent() {
            let _ = fs::create_dir_all(parent);
        }
        if trash_path.exists() {
            let _ = fs::rename(&trash_path, &live_path);
        }
        self.invalidate_object_list_cache(bucket, key).await;
        Ok(())
    }

    pub async fn delete_trash_object(
        &self,
        bucket: &str,
        key: &str,
        version_id: &str,
    ) -> Result<(), AppError> {
        let conn = self.db.conn()?;
        db::objects::hard_delete_object(&conn, bucket, key, version_id).await?;
        let trash_path = self.trash_path(bucket, key, version_id);
        if trash_path.exists() {
            let _ = fs::remove_file(&trash_path);
        }
        let live_path = self.object_path(bucket, key, version_id);
        if live_path.exists() {
            let _ = fs::remove_file(&live_path);
        }
        Ok(())
    }

    pub async fn empty_trash(&self, bucket: &str) -> Result<(), AppError> {
        let conn = self.db.conn()?;
        let trash_items = db::objects::list_trash(&conn, bucket, "").await?;
        for item in trash_items {
            let _ = self
                .delete_trash_object(&item.bucket, &item.key, &item.version_id)
                .await;
        }
        if !bucket.is_empty() {
            let bucket_trash_dir = self.root.join(".trash").join(bucket);
            if bucket_trash_dir.exists() {
                let _ = fs::remove_dir_all(&bucket_trash_dir);
            }
        } else {
            let all_trash_dir = self.root.join(".trash");
            if all_trash_dir.exists() {
                let _ = fs::remove_dir_all(&all_trash_dir);
            }
        }
        Ok(())
    }
}
