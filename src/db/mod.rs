pub mod audit;
pub mod buckets;
pub mod federation;
pub mod federation_peers;
pub mod federation_recovery;
pub mod federation_shares;
pub mod migration;
pub mod multipart;
pub mod objects;
pub mod policies;
pub mod presign;
pub mod replications;
pub mod schema;
pub mod schema_federation;
pub mod schema_vault;
pub mod settings;
pub mod shard_migration;
pub mod shards;
pub mod users;
pub mod vault;
pub mod vault_env;
pub mod vault_project;
pub mod webhooks;

use crate::error::{AppError, DbError};
use std::path::Path;
use std::sync::Arc;
use std::time::Duration;
pub use turso::{Builder, Connection, Database as TursoDb};

#[derive(Clone)]
pub struct Database {
    db: Arc<TursoDb>,
}

impl Database {
    /// Open or create an embedded Turso database at `path_str` with retry backoff on transient file locks
    pub async fn open_local(path_str: &str) -> Result<Self, AppError> {
        let path = Path::new(path_str);
        if let Some(parent) = path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        let db = open_with_retry(path_str).await?;

        let database = Self { db: Arc::new(db) };
        database.apply_pragmas().await?;
        Ok(database)
    }

    /// Open and initialize S3 Metadata Turso database (db/turso.db)
    pub async fn open_turso(path_str: &str) -> Result<Self, AppError> {
        let database = Self::open_local(path_str).await?;
        let conn = database.conn()?;

        // Execute S3 schema
        for statement in schema::SCHEMA.split(';') {
            let trimmed = statement.trim();
            if !trimmed.is_empty() {
                conn.execute(trimmed, ()).await.map_err(|e| {
                    DbError::Query(format!("Failed to execute schema statement: {e}"))
                })?;
            }
        }

        // Idempotent migrations for existing S3 databases
        ensure_column_exists(&conn, "presigned_urls", "method", "TEXT DEFAULT 'GET'").await?;

        // Initialize 16 Table-Partition Shards & Unified View
        shards::init_partitioned_tables(&conn).await?;

        tracing::info!("Turso S3 metadata database initialized at {path_str} with 16 shard partitions");
        Ok(database)
    }

    /// Open and initialize Vault Secrets database (db/vault.db)
    pub async fn open_vault(path_str: &str) -> Result<Self, AppError> {
        let database = Self::open_local(path_str).await?;
        let conn = database.conn()?;

        // Execute Vault schema
        for statement in schema_vault::SCHEMA.split(';') {
            let trimmed = statement.trim();
            if !trimmed.is_empty() {
                conn.execute(trimmed, ()).await.map_err(|e| {
                    DbError::Query(format!("Failed to execute vault schema statement: {e}"))
                })?;
            }
        }

        tracing::info!("Turso Vault database initialized at {path_str}");
        Ok(database)
    }

    /// Open and initialize Federation database (db/federation.db)
    pub async fn open_federation(path_str: &str) -> Result<Self, AppError> {
        let database = Self::open_local(path_str).await?;
        let conn = database.conn()?;

        // Execute Federation schema
        for statement in schema_federation::SCHEMA.split(';') {
            let trimmed = statement.trim();
            if !trimmed.is_empty() {
                conn.execute(trimmed, ()).await.map_err(|e| {
                    DbError::Query(format!("Failed to execute federation schema statement: {e}"))
                })?;
            }
        }

        tracing::info!("Turso Federation database initialized at {path_str}");
        Ok(database)
    }

    /// Backwards compatible constructor
    pub async fn new(db_url: &str, _auth_token: &str) -> Result<Self, AppError> {
        let clean_path = if db_url.is_empty()
            || db_url == "http://127.0.0.1:8085"
            || db_url == "http://localhost:8085"
            || db_url == "./db/metadata.db"
        {
            "./db/turso.db"
        } else if let Some(stripped) = db_url.strip_prefix("file:") {
            stripped
        } else {
            db_url
        };
        Self::open_turso(clean_path).await
    }

    pub fn conn(&self) -> Result<Connection, AppError> {
        self.db
            .connect()
            .map_err(|e| DbError::Query(format!("Connection error: {e}")).into())
    }

    pub async fn apply_pragmas(&self) -> Result<(), AppError> {
        let conn = self.conn()?;
        if let Ok(mut rows) = conn.query("PRAGMA journal_mode=WAL;", ()).await {
            let _ = rows.next().await;
        }
        let _ = conn.execute("PRAGMA synchronous=NORMAL;", ()).await;
        let _ = conn.execute("PRAGMA busy_timeout=5000;", ()).await;
        Ok(())
    }

    /// Non-blocking passive checkpoint to flush WAL frames without blocking active writers
    pub async fn checkpoint_passive(&self) -> Result<(i64, i64, i64), AppError> {
        self.run_checkpoint("PRAGMA wal_checkpoint(PASSIVE);").await
    }

    /// Checkpoints transactions from the WAL file into the main database and truncates the WAL file
    pub async fn checkpoint(&self) -> Result<(i64, i64, i64), AppError> {
        self.run_checkpoint("PRAGMA wal_checkpoint(TRUNCATE);").await
    }

    async fn run_checkpoint(&self, pragma_sql: &str) -> Result<(i64, i64, i64), AppError> {
        let conn = self.conn()?;
        if let Ok(mut rows) = conn.query(pragma_sql, ()).await {
            if let Ok(Some(row)) = rows.next().await {
                let busy = row.get::<i64>(0).unwrap_or(0);
                let log = row.get::<i64>(1).unwrap_or(0);
                let checkpointed = row.get::<i64>(2).unwrap_or(0);
                return Ok((busy, log, checkpointed));
            }
        }
        Ok((0, 0, 0))
    }
}

async fn open_with_retry(path_str: &str) -> Result<TursoDb, AppError> {
    const MAX_ATTEMPTS: usize = 10;
    for attempt in 1..=MAX_ATTEMPTS {
        match Builder::new_local(path_str).build().await {
            Ok(db) => return Ok(db),
            Err(e) => {
                let msg = e.to_string();
                if attempt < MAX_ATTEMPTS && is_transient_lock_error(&msg) {
                    let delay_ms = (200 * attempt as u64).min(1000);
                    tracing::warn!(
                        "Database '{path_str}' temporarily locked on startup (attempt {attempt}/{MAX_ATTEMPTS}): {msg}. Retrying in {delay_ms}ms..."
                    );
                    tokio::time::sleep(Duration::from_millis(delay_ms)).await;
                } else {
                    return Err(DbError::Query(format!("Failed to open local db {path_str}: {msg}")).into());
                }
            }
        }
    }
    Err(DbError::Query(format!("Exhausted retries opening local db {path_str}")).into())
}

fn is_transient_lock_error(msg: &str) -> bool {
    let lower = msg.to_ascii_lowercase();
    lower.contains("busy") || lower.contains("locked")
}

async fn ensure_column_exists(
    conn: &Connection,
    table: &str,
    column: &str,
    col_def: &str,
) -> Result<(), AppError> {
    let pragma_sql = format!("PRAGMA table_info({table});");
    if let Ok(mut rows) = conn.query(&pragma_sql, ()).await {
        let mut exists = false;
        while let Ok(Some(row)) = rows.next().await {
            if let Ok(name) = row.get::<String>(1) {
                if name.eq_ignore_ascii_case(column) {
                    exists = true;
                    break;
                }
            }
        }
        if !exists {
            let alter_sql = format!("ALTER TABLE {table} ADD COLUMN {column} {col_def};");
            let _ = conn.execute(&alter_sql, ()).await;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{is_transient_lock_error, Database};

    #[test]
    fn is_transient_lock_error_should_match_busy_and_locked() {
        assert!(is_transient_lock_error("Database is busy"));
        assert!(is_transient_lock_error("SQLITE_BUSY: database is locked"));
        assert!(!is_transient_lock_error("no such table: foo"));
    }

    #[tokio::test]
    async fn test_open_three_databases_and_checkpoint() {
        let tmp_dir = std::env::temp_dir().join(format!("grav_db_test_{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&tmp_dir).unwrap();

        let turso = Database::open_turso(tmp_dir.join("turso.db").to_str().unwrap())
            .await
            .expect("open_turso should succeed");
        let vault = Database::open_vault(tmp_dir.join("vault.db").to_str().unwrap())
            .await
            .expect("open_vault should succeed");
        let federation = Database::open_federation(tmp_dir.join("federation.db").to_str().unwrap())
            .await
            .expect("open_federation should succeed");

        let (busy_t, _, _) = turso.checkpoint_passive().await.expect("passive checkpoint turso");
        let (busy_v, _, _) = vault.checkpoint_passive().await.expect("passive checkpoint vault");
        let (busy_f, _, _) = federation.checkpoint_passive().await.expect("passive checkpoint federation");

        assert_eq!(busy_t, 0);
        assert_eq!(busy_v, 0);
        assert_eq!(busy_f, 0);

        // Re-opening existing DBs must succeed without schema autoindex panic
        drop(turso);
        drop(vault);
        drop(federation);
        let _turso2 = Database::open_turso(tmp_dir.join("turso.db").to_str().unwrap())
            .await
            .expect("re-open turso should succeed");
        let _vault2 = Database::open_vault(tmp_dir.join("vault.db").to_str().unwrap())
            .await
            .expect("re-open vault should succeed");
        let _fed2 = Database::open_federation(tmp_dir.join("federation.db").to_str().unwrap())
            .await
            .expect("re-open federation should succeed");

        let _ = std::fs::remove_dir_all(&tmp_dir);
    }
}
