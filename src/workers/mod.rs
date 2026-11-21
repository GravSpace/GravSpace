pub mod analytics;
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

    tokio::spawn(trash::start_trash_worker(storage, db));

    tokio::spawn(dispatcher.run());
}
