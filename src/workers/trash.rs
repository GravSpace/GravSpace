use crate::db::Database;
use crate::storage::FileStorage;
use std::time::Duration;
use tracing::{error, info};

pub async fn start_trash_worker(storage: FileStorage, db: Database) {
    info!("Trash cleanup worker started");
    let mut interval = tokio::time::interval(Duration::from_secs(3600));

    loop {
        interval.tick().await;

        if let Ok(conn) = db.conn() {
            for idx in 0..crate::db::shards::NUM_SHARDS {
                let table = crate::db::shards::shard_table_name(idx);
                let sql = format!(
                    r#"
                    SELECT o.bucket, o.key, o.version_id, b.soft_delete_retention
                    FROM {table} o
                    JOIN buckets b ON o.bucket = b.name
                    WHERE o.deleted_at IS NOT NULL
                      AND datetime(o.deleted_at, '+' || b.soft_delete_retention || ' days') < datetime('now')
                "#
                );

                if let Ok(mut rows) = conn.query(&sql, ()).await {
                    while let Ok(Some(row)) = rows.next().await {
                        if let (Ok(bucket), Ok(key), Ok(version_id)) = (
                            row.get::<String>(0),
                            row.get::<String>(1),
                            row.get::<String>(2),
                        ) {
                            info!("Purging expired trash object: {bucket}/{key}:{version_id}");
                            if let Err(e) = storage.delete_trash_object(&bucket, &key, &version_id).await {
                                error!("Failed to purge trash object: {e}");
                            }
                        }
                    }
                }
            }
        }
    }
}
