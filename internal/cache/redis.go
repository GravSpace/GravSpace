package cache

import (
	"context"
	"encoding/json"
	"log"
	"time"

	"github.com/redis/go-redis/v9"
)

type RedisCache struct {
	client *redis.Client
	ctx    context.Context
	stats  CacheStats
}

func NewRedisCache(url string) (*RedisCache, error) {
	opts, err := redis.ParseURL(url)
	if err != nil {
		return nil, err
	}

	client := redis.NewClient(opts)
	ctx := context.Background()

	if err := client.Ping(ctx).Err(); err != nil {
		return nil, err
	}

	log.Printf("Using Redis cache at %s", url)

	return &RedisCache{
		client: client,
		ctx:    ctx,
		stats:  CacheStats{},
	}, nil
}

func (r *RedisCache) Get(key string, target interface{}) bool {
	val, err := r.client.Get(r.ctx, key).Result()
	if err == redis.Nil {
		r.stats.Misses++
		return false
	}
	if err != nil {
		log.Printf("Redis GET error for key %s: %v", key, err)
		r.stats.Misses++
		return false
	}

	err = json.Unmarshal([]byte(val), target)
	if err != nil {
		log.Printf("Redis unmarshal error for key %s: %v", key, err)
		r.stats.Misses++
		return false
	}

	r.stats.Hits++
	return true
}

func (r *RedisCache) Set(key string, value interface{}, ttl time.Duration) error {
	data, err := json.Marshal(value)
	if err != nil {
		return err
	}
	return r.client.Set(r.ctx, key, data, ttl).Err()
}

func (r *RedisCache) Delete(key string) error {
	return r.client.Del(r.ctx, key).Err()
}

func (r *RedisCache) Clear() error {
	r.stats = CacheStats{}
	return r.client.FlushDB(r.ctx).Err()
}

func (r *RedisCache) Stats() CacheStats {
	// Get approximate size from Redis
	size, err := r.client.DBSize(r.ctx).Result()
	if err != nil {
		log.Printf("Redis DBSIZE error: %v", err)
		size = 0
	}

	stats := r.stats
	stats.Size = int(size)
	return stats
}

// Close closes the Redis connection
func (r *RedisCache) Close() error {
	return r.client.Close()
}
