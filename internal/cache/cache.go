package cache

import (
	"encoding/json"
	"sync"
	"time"
)

type Cache interface {
	Get(key string, target interface{}) bool
	Set(key string, value interface{}, ttl time.Duration) error
	Delete(key string) error
	Clear() error
	Stats() CacheStats
}

type CacheStats struct {
	Hits   int64
	Misses int64
	Size   int
}

type cacheEntry struct {
	value      interface{}
	expiration time.Time
}

type InMemoryCache struct {
	data  map[string]cacheEntry
	mu    sync.RWMutex
	stats CacheStats
}

func NewInMemoryCache() *InMemoryCache {
	c := &InMemoryCache{
		data: make(map[string]cacheEntry),
	}

	// Start cleanup goroutine
	go c.cleanupExpired()

	return c
}

func (c *InMemoryCache) Get(key string, target interface{}) bool {
	c.mu.RLock()
	defer c.mu.RUnlock()

	entry, exists := c.data[key]
	if !exists {
		c.stats.Misses++
		return false
	}

	// Check if expired
	if time.Now().After(entry.expiration) {
		c.stats.Misses++
		return false
	}

	c.stats.Hits++

	// Copy value to target
	// If it's already the same type, we can try reflection or just JSON marshal/unmarshal for safety
	data, err := json.Marshal(entry.value)
	if err != nil {
		return false
	}
	err = json.Unmarshal(data, target)
	return err == nil
}

func (c *InMemoryCache) Set(key string, value interface{}, ttl time.Duration) error {
	c.mu.Lock()
	defer c.mu.Unlock()

	c.data[key] = cacheEntry{
		value:      value,
		expiration: time.Now().Add(ttl),
	}

	return nil
}

func (c *InMemoryCache) Delete(key string) error {
	c.mu.Lock()
	defer c.mu.Unlock()

	delete(c.data, key)
	return nil
}

func (c *InMemoryCache) Clear() error {
	c.mu.Lock()
	defer c.mu.Unlock()

	c.data = make(map[string]cacheEntry)
	c.stats = CacheStats{}
	return nil
}

func (c *InMemoryCache) Stats() CacheStats {
	c.mu.RLock()
	defer c.mu.RUnlock()

	stats := c.stats
	stats.Size = len(c.data)
	return stats
}

func (c *InMemoryCache) cleanupExpired() {
	ticker := time.NewTicker(5 * time.Minute)
	defer ticker.Stop()

	for range ticker.C {
		c.mu.Lock()
		now := time.Now()
		for key, entry := range c.data {
			if now.After(entry.expiration) {
				delete(c.data, key)
			}
		}
		c.mu.Unlock()
	}
}

// Helper functions for common cache keys
func BucketListKey() string {
	return "buckets:list"
}

func ObjectListKey(bucket, prefix string) string {
	return "objects:" + bucket + ":" + prefix
}

func BucketCORSKey(bucket string) string {
	return "cors:" + bucket
}

func BucketLifecycleKey(bucket string) string {
	return "lifecycle:" + bucket
}

func BucketWebsiteKey(bucket string) string {
	return "website:" + bucket
}

func ObjectMetadataKey(bucket, key, versionID string) string {
	if versionID != "" {
		return "object:" + bucket + ":" + key + ":" + versionID
	}
	return "object:" + bucket + ":" + key
}
