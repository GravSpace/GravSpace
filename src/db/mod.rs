pub mod audit;
pub mod buckets;
pub mod federation;
pub mod multipart;
pub mod objects;
pub mod policies;
pub mod presign;
pub mod replications;
pub mod schema;
pub mod settings;
pub mod turso_bridge;
pub mod users;
pub mod webhooks;

use crate::error::{AppError, DbError};
use libsql::{Builder, Connection, Database as LibsqlDb};
use std::path::Path;
use std::sync::Arc;
use turso_bridge::start_turso_v2_bridge;

#[derive(Clone)]
pub struct Database {
    db: Arc<LibsqlDb>,
}

impl Database {
    pub async fn new(db_url: &str, auth_token: &str) -> Result<Self, AppError> {
        let is_remote = db_url.starts_with("http://")
            || db_url.starts_with("https://")
            || db_url.starts_with("libsql://");

        let db = if is_remote {
            let remote_target = if db_url == "http://127.0.0.1:8085"
                || db_url == "http://localhost:8085"
            {
                let v2_alive = reqwest::Client::new()
                    .post(format!("{}/v2/pipeline", db_url.trim_end_matches('/')))
                    .header("Content-Type", "application/json")
                    .body(r#"{"baton":null,"requests":[{"type":"execute","stmt":{"sql":"SELECT 1;"}}]}"#)
                    .send()
                    .await
                    .map(|r| r.status().is_success())
                    .unwrap_or(false);

                if v2_alive {
                    match start_turso_v2_bridge(db_url).await {
                        Ok(bridge_url) => bridge_url,
                        Err(_) => db_url.to_string(),
                    }
                } else {
                    db_url.to_string()
                }
            } else {
                db_url.to_string()
            };

            match Builder::new_remote(remote_target, auth_token.to_string())
                .build()
                .await
            {
                Ok(remote_db) => match remote_db.connect() {
                    Ok(conn) => match conn.execute("SELECT 1;", ()).await {
                        Ok(_) => {
                            tracing::info!("Connected to Turso database: {db_url}");
                            remote_db
                        }
                        Err(e) if db_url == "http://127.0.0.1:8085" => {
                            tracing::warn!("Default Turso server at 127.0.0.1:8085 error ({e}), falling back to local SQLite ./db/metadata.db");
                            Self::open_local("./db/metadata.db").await?
                        }
                        Err(e) => {
                            return Err(DbError::Query(format!(
                                "Failed to query remote db {db_url}: {e}"
                            ))
                            .into());
                        }
                    },
                    Err(e) if db_url == "http://127.0.0.1:8085" => {
                        tracing::warn!("Failed to connect to 127.0.0.1:8085 ({e}), falling back to local SQLite ./db/metadata.db");
                        Self::open_local("./db/metadata.db").await?
                    }
                    Err(e) => {
                        return Err(DbError::Query(format!(
                            "Failed to connect to remote db {db_url}: {e}"
                        ))
                        .into())
                    }
                },
                Err(e) if db_url == "http://127.0.0.1:8085" => {
                    tracing::warn!("Failed to build remote db for 127.0.0.1:8085 ({e}), falling back to local SQLite ./db/metadata.db");
                    Self::open_local("./db/metadata.db").await?
                }
                Err(e) => {
                    return Err(DbError::Query(format!(
                        "Failed to connect to remote db {db_url}: {e}"
                    ))
                    .into())
                }
            }
        } else {
            let path_str = if db_url.is_empty() || db_url == "./db/metadata.db" {
                "./db/metadata.db"
            } else if let Some(stripped) = db_url.strip_prefix("file:") {
                stripped
            } else {
                db_url
            };
            Self::open_local(path_str).await?
        };

        let database = Self { db: Arc::new(db) };
        database.init_schema().await?;
        Ok(database)
    }

    async fn open_local(path_str: &str) -> Result<LibsqlDb, AppError> {
        let path = Path::new(path_str);
        if let Some(parent) = path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        Builder::new_local(path_str)
            .build()
            .await
            .map_err(|e| DbError::Query(format!("Failed to open local db {path_str}: {e}")).into())
    }

    pub fn conn(&self) -> Result<Connection, AppError> {
        self.db
            .connect()
            .map_err(|e| DbError::Query(format!("Connection error: {e}")).into())
    }

    async fn init_schema(&self) -> Result<(), AppError> {
        let conn = self.conn()?;
        let _ = conn.execute("PRAGMA journal_mode=WAL;", ()).await;
        let _ = conn.execute("PRAGMA synchronous=NORMAL;", ()).await;
        let _ = conn.execute("PRAGMA busy_timeout=5000;", ()).await;

        // Execute schema statements
        for statement in schema::SCHEMA.split(';') {
            let trimmed = statement.trim();
            if !trimmed.is_empty() {
                conn.execute(trimmed, ()).await.map_err(|e| {
                    DbError::Query(format!("Failed to execute schema statement: {e}"))
                })?;
            }
        }

        // Idempotent migrations for existing databases
        ensure_column_exists(&conn, "presigned_urls", "method", "TEXT DEFAULT 'GET'").await?;

        Ok(())
    }
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
