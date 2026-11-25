use super::FileStorage;
use crate::cache;
use crate::db::{self, buckets::BucketRow};
use crate::error::{AppError, StorageError};
use libsql::params;
use std::fs;

impl FileStorage {
    pub async fn create_bucket(&self, name: &str) -> Result<(), AppError> {
        if name.starts_with('.') || name.len() < 3 || name.len() > 63 {
            return Err(AppError::BadRequest("Invalid bucket name".to_string()));
        }

        let bucket_dir = self.root.join(name);
        fs::create_dir_all(&bucket_dir).map_err(|e| StorageError::Io(e.to_string()))?;

        let conn = self.db.conn()?;
        db::buckets::create_bucket(&conn, name, "admin").await?;
        self.cache.delete(cache::bucket_list_key()).await;
        Ok(())
    }

    pub async fn bucket_exists(&self, name: &str) -> bool {
        self.root.join(name).is_dir()
    }

    pub async fn list_buckets(&self) -> Result<Vec<String>, AppError> {
        if let Some(cached) = self.cache.get(cache::bucket_list_key()).await {
            if let Ok(list) = serde_json::from_str::<Vec<String>>(&cached) {
                return Ok(list);
            }
        }

        let conn = self.db.conn()?;
        let db_buckets = db::buckets::list_buckets(&conn).await?;
        let filtered: Vec<String> = db_buckets
            .into_iter()
            .filter(|b| !b.starts_with('.'))
            .collect();

        let _ = self
            .cache
            .set(
                cache::bucket_list_key(),
                &serde_json::to_string(&filtered).unwrap_or_default(),
                300,
            )
            .await;

        Ok(filtered)
    }

    pub async fn delete_bucket(&self, name: &str) -> Result<(), AppError> {
        let bucket_dir = self.root.join(name);
        if bucket_dir.exists() {
            fs::remove_dir_all(&bucket_dir).map_err(|e| StorageError::Io(e.to_string()))?;
        }

        let conn = self.db.conn()?;
        db::buckets::delete_bucket(&conn, name).await?;
        self.invalidate_bucket_cache(name).await;
        Ok(())
    }

    pub async fn get_bucket_info(&self, name: &str) -> Result<Option<BucketRow>, AppError> {
        let key = cache::bucket_info_key(name);
        if let Some(cached) = self.cache.get(&key).await {
            if let Ok(info) = serde_json::from_str::<BucketRow>(&cached) {
                return Ok(Some(info));
            }
        }

        let conn = self.db.conn()?;
        let mut info = db::buckets::get_bucket(&conn, name).await?;
        if info.is_none() && self.bucket_exists(name).await {
            // Self-heal: bucket exists on disk but was not registered in DB
            let _ = db::buckets::create_bucket(&conn, name, "admin").await;
            info = db::buckets::get_bucket(&conn, name).await.unwrap_or(None);
        }

        if let Some(ref b) = info {
            let _ = self
                .cache
                .set(&key, &serde_json::to_string(b).unwrap_or_default(), 600)
                .await;
        }
        Ok(info)
    }

    pub async fn get_bucket_stats(&self, name: &str) -> Result<(i64, i64), AppError> {
        let conn = self.db.conn()?;
        let table = db::shards::object_table_for_bucket(name);
        let sql = format!(
            "SELECT COUNT(*), COALESCE(SUM(size), 0) FROM {table} WHERE bucket = ?1 AND is_latest = TRUE AND deleted_at IS NULL"
        );
        let mut rows = conn
            .query(&sql, params![name])
            .await
            .map_err(|e| crate::error::DbError::Query(e.to_string()))?;

        if let Ok(Some(row)) = rows.next().await {
            let count: i64 = row.get(0).unwrap_or(0);
            let size: i64 = row.get(1).unwrap_or(0);
            Ok((count, size))
        } else {
            Ok((0, 0))
        }
    }

    pub async fn set_bucket_versioning(&self, name: &str, enabled: bool) -> Result<(), AppError> {
        let conn = self.db.conn()?;
        db::buckets::set_bucket_versioning(&conn, name, enabled).await?;
        self.cache.delete(&cache::bucket_info_key(name)).await;
        Ok(())
    }

    pub async fn set_bucket_object_lock(&self, name: &str, enabled: bool) -> Result<(), AppError> {
        let conn = self.db.conn()?;
        db::buckets::set_bucket_object_lock(&conn, name, enabled).await?;
        self.cache.delete(&cache::bucket_info_key(name)).await;
        self.cache.delete(&cache::bucket_lock_key(name)).await;
        Ok(())
    }

    pub async fn set_bucket_quota(&self, name: &str, quota_bytes: i64) -> Result<(), AppError> {
        let conn = self.db.conn()?;
        db::buckets::set_bucket_quota(&conn, name, quota_bytes).await?;
        self.cache.delete(&cache::bucket_info_key(name)).await;
        Ok(())
    }

    pub async fn set_bucket_default_retention(
        &self,
        name: &str,
        mode: &str,
        days: i64,
    ) -> Result<(), AppError> {
        let conn = self.db.conn()?;
        db::buckets::set_bucket_default_retention(&conn, name, mode, days).await?;
        self.cache.delete(&cache::bucket_info_key(name)).await;
        Ok(())
    }
}
