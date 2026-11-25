use crate::storage::FileStorage;
use std::path::Path;
use std::time::Duration;
use tokio::time::Instant;
use tracing::{debug, info, warn};

pub async fn start_db_maintenance_worker(storage: FileStorage, interval_secs: u64) {
    info!("Multi-Database maintenance & WAL supervisor worker started (interval: {interval_secs}s)");
    let period = Duration::from_secs(interval_secs);
    // Delay the first tick so startup workers (sync, analytics, trash) do not contend with WAL checkpoints.
    let mut interval = tokio::time::interval_at(Instant::now() + period, period);

    loop {
        interval.tick().await;

        let targets = [
            ("turso", &storage.db, "db/turso.db-wal"),
            ("vault", &storage.vault_db, "db/vault.db-wal"),
            ("federation", &storage.federation_db, "db/federation.db-wal"),
        ];

        for (name, db, wal_path_str) in targets {
            // 1. Passive WAL checkpoint flushes committed frames without blocking writers.
            match db.checkpoint_passive().await {
                Ok((busy, log, checkpointed)) => {
                    if log > 0 || checkpointed > 0 {
                        info!(
                            "WAL Supervisor [{name}]: Checkpointed {}/{} pages (busy readers: {})",
                            checkpointed, log, busy
                        );
                    } else {
                        debug!("WAL Supervisor [{name}]: Database WAL is clean (0 pending pages)");
                    }

                    if busy > 0 {
                        warn!("WAL Supervisor [{name}]: Passive checkpoint encountered busy reader; retry on next tick");
                    }
                }
                Err(e) => {
                    warn!("WAL Supervisor [{name}]: Passive checkpoint failed: {e}");
                }
            }

            // 2. Threshold check on WAL disk size (urgent TRUNCATE only if WAL >= 32 MB).
            let path = Path::new(wal_path_str);
            if let Ok(meta) = std::fs::metadata(path) {
                let size_mb = meta.len() / (1024 * 1024);
                if size_mb >= 32 {
                    warn!(
                        "WAL Supervisor [{name}]: WAL file {wal_path_str} is {size_mb} MB (exceeds 32 MB threshold), triggering truncate checkpoint"
                    );
                    let _ = db.checkpoint().await;
                }
            }
        }
    }
}
