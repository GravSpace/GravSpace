pub mod memory;
pub mod redis;

use std::sync::Arc;

#[async_trait::async_trait]
pub trait Cache: Send + Sync {
    async fn get(&self, key: &str) -> Option<String>;
    async fn set(&self, key: &str, value: &str, ttl_secs: u64);
    async fn delete(&self, key: &str);
}

pub type SharedCache = Arc<dyn Cache>;

pub fn bucket_list_key() -> &'static str {
    "bucket_list"
}

pub fn bucket_info_key(name: &str) -> String {
    format!("bucket_info:{name}")
}

pub fn bucket_lock_key(name: &str) -> String {
    format!("bucket_lock:{name}")
}

pub fn bucket_cors_key(name: &str) -> String {
    format!("bucket_cors:{name}")
}

pub fn bucket_lifecycle_key(name: &str) -> String {
    format!("bucket_lifecycle:{name}")
}

pub fn bucket_website_key(name: &str) -> String {
    format!("bucket_website:{name}")
}

pub fn object_list_key(bucket: &str, prefix: &str) -> String {
    format!("object_list:{bucket}:{prefix}")
}
