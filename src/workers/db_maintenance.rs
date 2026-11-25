use crate::db::Database;
use std::time::Duration;
use tracing::{debug, info, warn};

pub async fn start_db_maintenance_worker(db: Database, interval_secs: u64) {
    info!("Database maintenance & WAL checkpoint worker started with interval: {interval_secs}s");
    let mut interval = tokio::time::interval(Duration::from_secs(interval_secs));
    let mut tick_count: u64 = 0;

    loop {
        interval.tick().await;
        tick_count = tick_count.wrapping_add(1);

        // 1. Periodic WAL Checkpoint (TRUNCATE) to flush pages and keep .db-wal file at ~0-4MB
        match db.checkpoint().await {
            Ok((busy, log, checkpointed)) => {
                if log > 0 || checkpointed > 0 {
                    info!(
                        "DB Maintenance: Checkpointed {}/{} WAL pages into main db (busy: {})",
                        checkpointed, log, busy
                    );
                } else {
                    debug!("DB Maintenance: WAL is clean (0 pending pages)");
                }

                if busy > 0 {
                    warn!("DB Maintenance: Checkpoint reported busy lock (active readers)");
                }
            }
            Err(e) => {
                warn!("DB Maintenance: Checkpoint failed: {e}");
            }
        }

        // 2. Periodic incremental vacuum every ~1 hour (12 ticks of 5 mins)
        if tick_count % 12 == 0 {
            if let Ok(conn) = db.conn() {
                let _ = conn.execute("PRAGMA incremental_vacuum(500);", ()).await;
            }
        }
    }
}
