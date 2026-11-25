use crate::audit::SharedAuditLogger;
use crate::cache::{self, SharedCache};
use crate::config::Config;
use crate::db::Database;
use crate::error::AppError;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use turso::Connection;

#[derive(Clone)]
pub struct FileStorage {
    pub root: PathBuf,
    pub db: Database,
    pub vault_db: Database,
    pub federation_db: Database,
    pub cache: SharedCache,
    pub config: Arc<Config>,
    pub audit: Option<SharedAuditLogger>,
    pub dispatcher: Option<Arc<crate::workers::notifications::Dispatcher>>,
}

impl FileStorage {
    pub fn new(
        root: impl AsRef<Path>,
        db: Database,
        vault_db: Database,
        federation_db: Database,
        cache: SharedCache,
        config: Arc<Config>,
        audit: Option<SharedAuditLogger>,
    ) -> Self {
        let root_buf = root.as_ref().to_path_buf();
        let _ = std::fs::create_dir_all(&root_buf);
        let _ = std::fs::create_dir_all(root_buf.join(".trash"));
        Self {
            root: root_buf,
            db,
            vault_db,
            federation_db,
            cache,
            config,
            audit,
            dispatcher: None,
        }
    }

    pub fn conn(&self) -> Result<Connection, AppError> {
        self.db.conn()
    }

    pub fn vault_conn(&self) -> Result<Connection, AppError> {
        self.vault_db.conn()
    }

    pub fn federation_conn(&self) -> Result<Connection, AppError> {
        self.federation_db.conn()
    }

    pub fn with_dispatcher(mut self, dispatcher: Arc<crate::workers::notifications::Dispatcher>) -> Self {
        self.dispatcher = Some(dispatcher);
        self
    }

    pub fn trash_path(&self, bucket: &str, key: &str, version_id: &str) -> PathBuf {
        let base = self.root.join(".trash").join(bucket).join(key.trim_start_matches('/'));
        let clean_vid = version_id.trim_matches('\'');
        if clean_vid.is_empty() || clean_vid == "legacy" || clean_vid == "null" {
            base
        } else {
            base.join(clean_vid)
        }
    }

    pub async fn invalidate_bucket_cache(&self, bucket: &str) {
        self.cache.delete(cache::bucket_list_key()).await;
        self.cache.delete(&cache::bucket_info_key(bucket)).await;
        self.cache.delete(&cache::bucket_lock_key(bucket)).await;
        self.cache.delete(&cache::bucket_cors_key(bucket)).await;
        self.cache.delete(&cache::bucket_lifecycle_key(bucket)).await;
        self.cache.delete(&cache::bucket_website_key(bucket)).await;
    }

    pub async fn invalidate_object_list_cache(&self, bucket: &str, key: &str) {
        let trimmed = key.trim_start_matches('/');
        self.cache.delete(&cache::object_list_key(bucket, "")).await;
        let parts: Vec<&str> = trimmed.split('/').collect();
        for i in 1..parts.len() {
            let prefix = format!("{}/", parts[..i].join("/"));
            self.cache.delete(&cache::object_list_key(bucket, &prefix)).await;
        }
    }
}
