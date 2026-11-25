use crate::db::Database;
use std::path::Path;
use std::time::Duration;
use tracing::{debug, info, warn};

pub async fn start_db_maintenance_worker(db: Database, interval_secs: u64) {
    info!("Database maintenance & WAL supervisor worker started (interval: {interval_secs}s)");
    let mut interval = tokio::time::interval(Duration::from_secs(interval_secs));
    let mut tick_count: u64 = 0;

    let wal_paths = ["db/turso.db-wal", "db/metadata.db-wal"];

    loop {
        interval.tick().await;
        tick_count = tick_count.wrapping_add(1);

        // 1. Proactive WAL Checkpoint (TRUNCATE) to keep WAL files small (0-4MB)
        match db.checkpoint().await {
            Ok((busy, log, checkpointed)) => {
                if log > 0 || checkpointed > 0 {
                    info!(
                        "WAL Supervisor: Checkpointed {}/{} pages into database (busy readers: {})",
                        checkpointed, log, busy
                    );
                } else {
                    debug!("WAL Supervisor: Database WAL is clean (0 pending pages)");
                }

                if busy > 0 {
                    warn!("WAL Supervisor: Checkpoint encountered busy lock; retry on next tick");
                }
            }
            Err(e) => {
                warn!("WAL Supervisor: Checkpoint failed: {e}");
            }
        }

        // 2. Threshold Check on WAL disk size (Urgent Truncation if WAL > 32 MB)
        for wal_path_str in &wal_paths {
            let path = Path::new(wal_path_str);
            if let Ok(meta) = std::fs::metadata(path) {
                let size_mb = meta.len() / (1024 * 1024);
                if size_mb >= 32 {
                    warn!(
                        "WAL Supervisor: WAL file {wal_path_str} is {size_mb} MB (exceeds 32 MB threshold), triggering urgent truncate checkpoint"
                    );
                    let _ = db.checkpoint().await;
                }
            }
        }

        // 3. Periodic incremental vacuum every ~1 hour (12 ticks of 5 mins)
        if tick_count % 12 == 0 {
            if let Ok(conn) = db.conn() {
                let _ = conn.execute("PRAGMA incremental_vacuum(500);", ()).await;
            }
        }
    }
}
