use super::Cache;
use std::sync::Arc;

pub struct RedisCache {
    memory_fallback: Arc<super::memory::MemoryCache>,
    url: String,
}

impl RedisCache {
    pub fn new(url: String) -> Self {
        Self {
            memory_fallback: Arc::new(super::memory::MemoryCache::default()),
            url,
        }
    }
}

#[async_trait::async_trait]
impl Cache for RedisCache {
    async fn get(&self, key: &str) -> Option<String> {
        #[cfg(feature = "redis-cache")]
        {
            if let Ok(client) = redis::Client::open(self.url.as_str()) {
                if let Ok(mut conn) = client.get_multiplexed_async_connection().await {
                    let val: Result<Option<String>, _> = redis::cmd("GET")
                        .arg(key)
                        .query_async(&mut conn)
                        .await;
                    if let Ok(Some(v)) = val {
                        return Some(v);
                    }
                }
            }
        }
        self.memory_fallback.get(key).await
    }

    async fn set(&self, key: &str, value: &str, ttl_secs: u64) {
        #[cfg(feature = "redis-cache")]
        {
            if let Ok(client) = redis::Client::open(self.url.as_str()) {
                if let Ok(mut conn) = client.get_multiplexed_async_connection().await {
                    let _: Result<(), _> = redis::cmd("SETEX")
                        .arg(key)
                        .arg(ttl_secs)
                        .arg(value)
                        .query_async(&mut conn)
                        .await;
                }
            }
        }
        self.memory_fallback.set(key, value, ttl_secs).await;
    }

    async fn delete(&self, key: &str) {
        #[cfg(feature = "redis-cache")]
        {
            if let Ok(client) = redis::Client::open(self.url.as_str()) {
                if let Ok(mut conn) = client.get_multiplexed_async_connection().await {
                    let _: Result<(), _> = redis::cmd("DEL")
                        .arg(key)
                        .query_async(&mut conn)
                        .await;
                }
            }
        }
        self.memory_fallback.delete(key).await;
    }
}
