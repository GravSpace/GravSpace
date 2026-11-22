use super::FileStorage;
use crate::cache;
use crate::error::{AppError, DbError};
use libsql::params;

impl FileStorage {
    pub async fn set_bucket_cors(&self, bucket: &str, cors_json: &str) -> Result<(), AppError> {
        let conn = self.db.conn()?;
        conn.execute(
            r#"INSERT INTO bucket_configs (bucket, cors_config) VALUES (?1, ?2)
               ON CONFLICT(bucket) DO UPDATE SET cors_config = excluded.cors_config"#,
            params![bucket, cors_json],
        )
        .await
        .map_err(|e| DbError::Query(e.to_string()))?;

        self.cache.delete(&cache::bucket_cors_key(bucket)).await;
        Ok(())
    }

    pub async fn get_bucket_cors(&self, bucket: &str) -> Result<Option<String>, AppError> {
        let key = cache::bucket_cors_key(bucket);
        if let Some(cached) = self.cache.get(&key).await {
            return Ok(Some(cached));
        }

        let conn = self.db.conn()?;
        let mut rows = conn
            .query(
                "SELECT cors_config FROM bucket_configs WHERE bucket = ?1",
                params![bucket],
            )
            .await
            .map_err(|e| DbError::Query(e.to_string()))?;

        if let Some(row) = rows.next().await.map_err(|e| DbError::Query(e.to_string()))? {
            let val: Option<String> = row.get(0).ok();
            if let Some(ref s) = val {
                let _ = self.cache.set(&key, s, 600).await;
            }
            Ok(val)
        } else {
            Ok(None)
        }
    }

    pub async fn set_bucket_lifecycle(&self, bucket: &str, lifecycle_json: &str) -> Result<(), AppError> {
        let conn = self.db.conn()?;
        conn.execute(
            r#"INSERT INTO bucket_configs (bucket, lifecycle_config) VALUES (?1, ?2)
               ON CONFLICT(bucket) DO UPDATE SET lifecycle_config = excluded.lifecycle_config"#,
            params![bucket, lifecycle_json],
        )
        .await
        .map_err(|e| DbError::Query(e.to_string()))?;

        self.cache.delete(&cache::bucket_lifecycle_key(bucket)).await;
        Ok(())
    }

    pub async fn get_bucket_lifecycle(&self, bucket: &str) -> Result<Option<String>, AppError> {
        let key = cache::bucket_lifecycle_key(bucket);
        if let Some(cached) = self.cache.get(&key).await {
            return Ok(Some(cached));
        }

        let conn = self.db.conn()?;
        let mut rows = conn
            .query(
                "SELECT lifecycle_config FROM bucket_configs WHERE bucket = ?1",
                params![bucket],
            )
            .await
            .map_err(|e| DbError::Query(e.to_string()))?;

        if let Some(row) = rows.next().await.map_err(|e| DbError::Query(e.to_string()))? {
            let val: Option<String> = row.get(0).ok();
            if let Some(ref s) = val {
                let _ = self.cache.set(&key, s, 600).await;
            }
            Ok(val)
        } else {
            Ok(None)
        }
    }

    pub async fn set_bucket_website(&self, bucket: &str, website_json: &str) -> Result<(), AppError> {
        let conn = self.db.conn()?;
        conn.execute(
            r#"INSERT INTO bucket_configs (bucket, website_config) VALUES (?1, ?2)
               ON CONFLICT(bucket) DO UPDATE SET website_config = excluded.website_config"#,
            params![bucket, website_json],
        )
        .await
        .map_err(|e| DbError::Query(e.to_string()))?;

        self.cache.delete(&cache::bucket_website_key(bucket)).await;
        Ok(())
    }

    pub async fn get_bucket_website(&self, bucket: &str) -> Result<Option<String>, AppError> {
        let key = cache::bucket_website_key(bucket);
        if let Some(cached) = self.cache.get(&key).await {
            return Ok(Some(cached));
        }

        let conn = self.db.conn()?;
        let mut rows = conn
            .query(
                "SELECT website_config FROM bucket_configs WHERE bucket = ?1",
                params![bucket],
            )
            .await
            .map_err(|e| DbError::Query(e.to_string()))?;

        if let Some(row) = rows.next().await.map_err(|e| DbError::Query(e.to_string()))? {
            let val: Option<String> = row.get(0).ok();
            if let Some(ref s) = val {
                let _ = self.cache.set(&key, s, 600).await;
            }
            Ok(val)
        } else {
            Ok(None)
        }
    }

    pub async fn delete_bucket_cors(&self, bucket: &str) -> Result<(), AppError> {
        let conn = self.db.conn()?;
        conn.execute(
            "UPDATE bucket_configs SET cors_config = NULL WHERE bucket = ?1",
            params![bucket],
        )
        .await
        .map_err(|e| DbError::Query(e.to_string()))?;

        self.cache.delete(&cache::bucket_cors_key(bucket)).await;
        Ok(())
    }

    pub async fn delete_bucket_website(&self, bucket: &str) -> Result<(), AppError> {
        let conn = self.db.conn()?;
        conn.execute(
            "UPDATE bucket_configs SET website_config = NULL WHERE bucket = ?1",
            params![bucket],
        )
        .await
        .map_err(|e| DbError::Query(e.to_string()))?;

        self.cache.delete(&cache::bucket_website_key(bucket)).await;
        Ok(())
    }
}
