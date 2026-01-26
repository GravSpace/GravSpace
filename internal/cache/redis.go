package cache

import (
	"context"
	"encoding/json"
	"time"

	"github.com/go-redis/redis/v8"
)

type RedisCache struct {
	client *redis.Client
	ctx    context.Context
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

	return &RedisCache{
		client: client,
		ctx:    ctx,
	}, nil
}

func (r *RedisCache) Get(key string, target interface{}) bool {
	val, err := r.client.Get(r.ctx, key).Result()
	if err != nil {
		return false
	}

	err = json.Unmarshal([]byte(val), target)
	return err == nil
}

func (r *RedisCache) Set(key string, value interface{}, ttl time.Duration) error {
	data, err := json.Marshal(value)
	if err != nil {
		return r.client.Set(r.ctx, key, value, ttl).Err()
	}
	return r.client.Set(r.ctx, key, data, ttl).Err()
}

func (r *RedisCache) Delete(key string) error {
	return r.client.Del(r.ctx, key).Err()
}

func (r *RedisCache) Clear() error {
	return r.client.FlushDB(r.ctx).Err()
}

func (r *RedisCache) Stats() CacheStats {
	// Simple stats
	return CacheStats{}
}
