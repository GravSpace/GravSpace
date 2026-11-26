pub mod analytics;
pub mod db_maintenance;
pub mod federation_announce;
pub mod federation_pull;
pub mod federation_transfer;
pub mod federation_worker;
pub mod lifecycle;
pub mod notifications;
pub mod sync;
pub mod trash;

use crate::config::Config;
use crate::db::Database;
use crate::storage::FileStorage;
use std::sync::Arc;

pub fn start_workers(
    storage: FileStorage,
    db: Database,
    config: Arc<Config>,
    dispatcher: Arc<notifications::Dispatcher>,
) {
    tokio::spawn(sync::start_sync_worker(
        storage.clone(),
        config.sync_worker_interval_secs,
    ));

    tokio::spawn(lifecycle::start_lifecycle_worker(
        storage.clone(),
        config.lifecycle_worker_interval_secs,
    ));

    tokio::spawn(analytics::start_analytics_worker(storage.clone(), db.clone()));

    tokio::spawn(trash::start_trash_worker(storage.clone(), db.clone()));

    tokio::spawn(db_maintenance::start_db_maintenance_worker(storage.clone(), 300));

    tokio::spawn(federation_worker::start_federation_worker(storage));

    tokio::spawn(dispatcher.run());
}
