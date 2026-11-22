use crate::db::{self, audit::AuditLogRow, Database};
use std::fs::OpenOptions;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tokio::sync::broadcast;

pub type SharedAuditLogger = Arc<AuditLogger>;

pub struct AuditLogger {
    log_file: PathBuf,
    db: Database,
    tx: broadcast::Sender<AuditLogRow>,
}

impl AuditLogger {
    pub fn new(log_path: impl AsRef<Path>, db: Database) -> Self {
        let path = log_path.as_ref().to_path_buf();
        if let Some(parent) = path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        let (tx, _) = broadcast::channel(100);
        Self {
            log_file: path,
            db,
            tx,
        }
    }

    pub fn subscribe(&self) -> broadcast::Receiver<AuditLogRow> {
        self.tx.subscribe()
    }

    pub async fn log(
        &self,
        username: Option<&str>,
        action: &str,
        resource: &str,
        result: &str,
        ip: Option<&str>,
        user_agent: Option<&str>,
        details: Option<&str>,
    ) {
        let timestamp = chrono::Utc::now().to_rfc3339();
        let log_entry = format!(
            "[{timestamp}] user={:?} action={action} resource={resource} result={result} ip={:?}\n",
            username.unwrap_or("anonymous"),
            ip.unwrap_or("-")
        );

        if let Ok(mut file) = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&self.log_file)
        {
            let _ = file.write_all(log_entry.as_bytes());
        }

        if let Ok(conn) = self.db.conn() {
            let _ = db::audit::insert_audit_log(
                &conn, username, action, resource, result, ip, user_agent, details,
            )
            .await;
        }

        let record = AuditLogRow {
            id: 0,
            timestamp,
            username: username.map(String::from),
            action: action.to_string(),
            resource: resource.to_string(),
            result: result.to_string(),
            ip: ip.map(String::from),
            user_agent: user_agent.map(String::from),
            details: details.map(String::from),
        };

        let _ = self.tx.send(record);
    }
}
