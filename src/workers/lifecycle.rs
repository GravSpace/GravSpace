use crate::storage::FileStorage;
use serde::Deserialize;
use std::time::Duration;
use tracing::info;

#[derive(Debug, Deserialize)]
struct LifecycleConfig {
    #[serde(rename = "Rule", default)]
    rules: Vec<LifecycleRule>,
}

#[derive(Debug, Deserialize)]
struct LifecycleRule {
    #[serde(rename = "ID")]
    id: Option<String>,
    #[serde(rename = "Status")]
    status: String,
    #[serde(rename = "Prefix")]
    prefix: Option<String>,
    #[serde(rename = "Expiration")]
    expiration: Option<Expiration>,
}

#[derive(Debug, Deserialize)]
struct Expiration {
    #[serde(rename = "Days")]
    days: Option<i64>,
}

pub async fn start_lifecycle_worker(storage: FileStorage, interval_secs: u64) {
    info!("Lifecycle worker started with interval: {interval_secs}s");
    let mut interval = tokio::time::interval(Duration::from_secs(interval_secs));

    loop {
        interval.tick().await;

        if let Ok(buckets) = storage.list_buckets().await {
            for b in buckets {
                if let Ok(Some(config_json)) = storage.get_bucket_lifecycle(&b).await {
                    if let Ok(cfg) = serde_json::from_str::<LifecycleConfig>(&config_json) {
                        process_lifecycle_rules(&storage, &b, cfg.rules).await;
                    }
                }
            }
        }
    }
}

async fn process_lifecycle_rules(storage: &FileStorage, bucket: &str, rules: Vec<LifecycleRule>) {
    for rule in rules {
        if rule.status != "Enabled" {
            continue;
        }
        if let Some(exp) = rule.expiration {
            if let Some(days) = exp.days {
                let prefix = rule.prefix.unwrap_or_default();
                if let Ok(conn) = storage.db.conn() {
                    let sql = r#"
                        SELECT key, version_id
                        FROM objects
                        WHERE bucket = ?1
                          AND is_latest = TRUE
                          AND deleted_at IS NULL
                          AND key LIKE ?2
                          AND datetime(modified_at, '+' || ?3 || ' days') < datetime('now')
                    "#;
                    let pattern = format!("{prefix}%");
                    if let Ok(mut rows) = conn.query(sql, libsql::params![bucket, pattern, days]).await {
                        while let Ok(Some(row)) = rows.next().await {
                            if let (Ok(key), Ok(version_id)) = (row.get::<String>(0), row.get::<String>(1)) {
                                info!("Lifecycle expiring object: {bucket}/{key}:{version_id}");
                                let _ = storage.delete_object(bucket, &key, Some(&version_id), true).await;
                            }
                        }
                    }
                }
            }
        }
    }
}
