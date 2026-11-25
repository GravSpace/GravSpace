use crate::db::Database;
use crate::storage::FileStorage;
use libsql::params;
use std::time::Duration;
use tracing::info;

pub async fn start_analytics_worker(storage: FileStorage, db: Database) {
    info!("Storage analytics snapshot worker started");
    let mut interval = tokio::time::interval(Duration::from_secs(3600));

    loop {
        interval.tick().await;

        if let Ok(buckets) = storage.list_buckets().await {
            for b in buckets {
                if let Ok(conn) = db.conn() {
                    let table = crate::db::shards::object_table_for_bucket(&b);
                    let sql = format!(
                        "SELECT COALESCE(SUM(size), 0) FROM {table} WHERE bucket = ?1 AND deleted_at IS NULL"
                    );
                    if let Ok(mut rows) = conn.query(&sql, params![b.as_str()]).await {
                        if let Ok(Some(row)) = rows.next().await {
                            let total_size: i64 = row.get(0).unwrap_or(0);
                            let _ = conn.execute(
                                "INSERT INTO storage_snapshots (bucket, size) VALUES (?1, ?2)",
                                params![b.as_str(), total_size],
                            ).await;
                        }
                    }
                }
            }
        }
    }
}
