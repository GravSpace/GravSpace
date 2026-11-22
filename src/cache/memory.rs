use super::Cache;
use moka::future::Cache as MokaCache;
use std::time::Duration;

pub struct MemoryCache {
    inner: MokaCache<String, String>,
}

impl MemoryCache {
    pub fn new(max_capacity: u64, default_ttl_secs: u64) -> Self {
        let inner = MokaCache::builder()
            .max_capacity(max_capacity)
            .time_to_live(Duration::from_secs(default_ttl_secs))
            .build();
        Self { inner }
    }
}

impl Default for MemoryCache {
    fn default() -> Self {
        Self::new(10_000, 600)
    }
}

#[async_trait::async_trait]
impl Cache for MemoryCache {
    async fn get(&self, key: &str) -> Option<String> {
        self.inner.get(key).await
    }

    async fn set(&self, key: &str, value: &str, _ttl_secs: u64) {
        self.inner.insert(key.to_string(), value.to_string()).await;
    }

    async fn delete(&self, key: &str) {
        self.inner.invalidate(key).await;
    }
}
