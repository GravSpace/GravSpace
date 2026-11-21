use crate::auth::signature::hmac_sha256;
use crate::db::{self, Database};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::mpsc;
use tracing::{error, info};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct S3Event {
    pub event_name: String,
    pub bucket: String,
    pub key: String,
    pub size: i64,
    pub etag: String,
    pub version_id: String,
    pub timestamp: String,
}

pub struct Dispatcher {
    db: Database,
    tx: mpsc::Sender<S3Event>,
    rx: tokio::sync::Mutex<mpsc::Receiver<S3Event>>,
    client: reqwest::Client,
}

impl Dispatcher {
    pub fn new(db: Database) -> Self {
        let (tx, rx) = mpsc::channel(100);
        Self {
            db,
            tx,
            rx: tokio::sync::Mutex::new(rx),
            client: reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(10))
                .build()
                .unwrap_or_default(),
        }
    }

    pub async fn dispatch(&self, event: S3Event) {
        let _ = self.tx.send(event).await;
    }

    pub async fn run(self: Arc<Self>) {
        info!("S3 event notifications dispatcher started");
        let mut rx = self.rx.lock().await;

        while let Some(event) = rx.recv().await {
            let db = self.db.clone();
            let client = self.client.clone();

            tokio::spawn(async move {
                process_event(&db, &client, event).await;
            });
        }
    }
}

async fn process_event(db: &Database, client: &reqwest::Client, event: S3Event) {
    let conn = match db.conn() {
        Ok(c) => c,
        Err(_) => return,
    };

    let webhooks = match db::webhooks::list_webhooks(&conn, &event.bucket).await {
        Ok(list) => list,
        Err(_) => return,
    };

    let payload = serde_json::to_string(&event).unwrap_or_default();

    for wh in webhooks {
        if !wh.active {
            continue;
        }

        let mut req = client
            .post(&wh.url)
            .header("Content-Type", "application/json")
            .header("X-GravSpace-Event", &event.event_name);

        if let Some(ref sec) = wh.secret {
            let sig = hex::encode(hmac_sha256(sec.as_bytes(), payload.as_bytes()));
            req = req.header("X-GravSpace-Signature", sig);
        }

        match req.body(payload.clone()).send().await {
            Ok(res) if res.status().is_success() => {
                info!("Webhook delivered to {}: status {}", wh.url, res.status());
            }
            Err(e) => {
                error!("Webhook failed to {}: {e}", wh.url);
                let _ = db::webhooks::insert_webhook_dlq(
                    &conn,
                    Some(wh.id),
                    &event.bucket,
                    &wh.url,
                    &event.event_name,
                    &payload,
                    Some(&e.to_string()),
                )
                .await;
            }
            Ok(res) => {
                let status = res.status();
                error!("Webhook to {} returned non-2xx: {status}", wh.url);
                let _ = db::webhooks::insert_webhook_dlq(
                    &conn,
                    Some(wh.id),
                    &event.bucket,
                    &wh.url,
                    &event.event_name,
                    &payload,
                    Some(&format!("HTTP {status}")),
                )
                .await;
            }
        }
    }
}
