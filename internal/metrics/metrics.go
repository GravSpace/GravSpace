package metrics

import (
	"time"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
)

var (
	// Request Metrics
	RequestsTotal = promauto.NewCounterVec(
		prometheus.CounterOpts{
			Name: "gravitystore_requests_total",
			Help: "Total number of HTTP requests",
		},
		[]string{"method", "status", "path"},
	)
	RequestDuration = promauto.NewHistogramVec(
		prometheus.HistogramOpts{
			Name:    "gravitystore_request_duration_seconds",
			Help:    "Duration of HTTP requests",
			Buckets: prometheus.DefBuckets,
		},
		[]string{"method", "path"},
	)
	RequestSize = promauto.NewHistogramVec(
		prometheus.HistogramOpts{
			Name:    "gravitystore_request_size_bytes",
			Help:    "Size of HTTP requests",
			Buckets: prometheus.ExponentialBuckets(100, 10, 8),
		},
		[]string{"method", "path"},
	)
	ResponseSize = promauto.NewHistogramVec(
		prometheus.HistogramOpts{
			Name:    "gravitystore_response_size_bytes",
			Help:    "Size of HTTP responses",
			Buckets: prometheus.ExponentialBuckets(100, 10, 8),
		},
		[]string{"method", "path"},
	)

	// Storage Metrics
	BucketsTotal = promauto.NewGauge(
		prometheus.GaugeOpts{
			Name: "gravitystore_buckets_total",
			Help: "Total number of buckets",
		},
	)
	ObjectsTotal = promauto.NewGaugeVec(
		prometheus.GaugeOpts{
			Name: "gravitystore_objects_total",
			Help: "Total number of objects in a bucket",
		},
		[]string{"bucket"},
	)
	StorageBytes = promauto.NewGaugeVec(
		prometheus.GaugeOpts{
			Name: "gravitystore_storage_bytes",
			Help: "Total storage used in bytes per bucket",
		},
		[]string{"bucket"},
	)

	// Cache Metrics
	CacheHits = promauto.NewCounterVec(
		prometheus.CounterOpts{
			Name: "gravitystore_cache_hits_total",
			Help: "Total number of cache hits",
		},
		[]string{"type"},
	)
	CacheMisses = promauto.NewCounterVec(
		prometheus.CounterOpts{
			Name: "gravitystore_cache_misses_total",
			Help: "Total number of cache misses",
		},
		[]string{"type"},
	)

	// Database Metrics
	DBQueriesTotal = promauto.NewCounterVec(
		prometheus.CounterOpts{
			Name: "gravitystore_db_queries_total",
			Help: "Total number of database queries",
		},
		[]string{"operation"},
	)
	DBQueryDuration = promauto.NewHistogramVec(
		prometheus.HistogramOpts{
			Name:    "gravitystore_db_query_duration_seconds",
			Help:    "Duration of database queries",
			Buckets: prometheus.DefBuckets,
		},
		[]string{"operation"},
	)
)

// StartMetricsUpdater is a placeholder for background updates of gauge metrics.
// In a real application, this might query the database or filesystem periodically.
func StartMetricsUpdater() {
	// For now, we'll let the individual packages update their own gauges on operations,
	// or we could add a periodic task here if we want absolute numbers.
	go func() {
		ticker := time.NewTicker(1 * time.Minute)
		for range ticker.C {
			// Periodic update logic could go here
		}
	}()
}

func RecordCacheHit(cacheType string) {
	CacheHits.WithLabelValues(cacheType).Inc()
}

func RecordCacheMiss(cacheType string) {
	CacheMisses.WithLabelValues(cacheType).Inc()
}

func RecordDBQuery(operation string, duration time.Duration) {
	DBQueriesTotal.WithLabelValues(operation).Inc()
	DBQueryDuration.WithLabelValues(operation).Observe(duration.Seconds())
}
