#![allow(dead_code)]

mod admin;
mod audit;
mod auth;
mod cache;
mod config;
mod crypto;
mod db;
mod error;
mod health;
mod metrics;
mod s3;
mod storage;
mod workers;

use crate::audit::AuditLogger;
use crate::cache::{memory::MemoryCache, redis::RedisCache, Cache};
use crate::config::Config;
use crate::db::Database;
use crate::storage::FileStorage;
use crate::workers::notifications::Dispatcher;
use axum::{routing::get, Router};
use std::env;
use std::net::SocketAddr;
use std::sync::Arc;
use tower_http::cors::{Any, CorsLayer};
use tracing::info;

pub const VERSION: &str = env!("CARGO_PKG_VERSION");

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<String> = env::args().collect();
    if args.iter().any(|arg| arg == "--version" || arg == "-v") {
        println!("GravSpace v{VERSION} (Rust core)");
        return Ok(());
    }

    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "info,tower_http=debug".into()),
        )
        .init();

    info!("Starting GravSpace v{VERSION} (Rust core)");

    let config = Arc::new(Config::load());
    let _ = metrics::init_metrics();

    let db = Database::new(&config.database_url, &config.database_auth_token).await?;

    // Seed initial admin user if not present, or if INITIAL_ADMIN_PASSWORD is set
    if let Ok(conn) = db.conn() {
        let admin_user = db::users::get_user(&conn, "admin").await.unwrap_or(None);
        let should_seed = admin_user.is_none() || config.initial_admin_password.is_some();
        if should_seed {
            let admin_pass = config
                .initial_admin_password
                .as_deref()
                .unwrap_or("admin");
            let hash = bcrypt::hash(admin_pass, bcrypt::DEFAULT_COST).unwrap_or_default();
            let _ = db::users::upsert_user(&conn, "admin", &hash).await;
            info!("Configured admin user credentials");

            if let (Some(k_id), Some(secret)) = (
                &config.initial_admin_access_key,
                &config.initial_admin_secret_key,
            ) {
                let _ = db::users::create_access_key(&conn, "admin", k_id, secret).await;
                info!("Seeded initial admin access key");
            }
        }

        // Seed AdministratorAccess policy
        let admin_policy = serde_json::json!({
            "Version": "2012-10-17",
            "Statement": [{
                "Effect": "Allow",
                "Action": ["s3:*"],
                "Resource": ["*"]
            }]
        });
        let _ = db::policies::upsert_global_policy(
            &conn,
            "AdministratorAccess",
            &serde_json::to_string(&admin_policy).unwrap_or_default(),
        )
        .await;
    }

    // Cache: Redis if REDIS_URL configured, otherwise fast In-Memory Moka cache
    let cache: Arc<dyn Cache> = if let Some(ref redis_url) = config.redis_url {
        info!("Using Redis cache at {redis_url}");
        Arc::new(RedisCache::new(redis_url.clone()))
    } else {
        info!("Using In-Memory TTL cache");
        Arc::new(MemoryCache::default())
    };

    let audit_logger = Arc::new(AuditLogger::new("./logs/audit.log", db.clone()));
    let dispatcher = Arc::new(Dispatcher::new(db.clone()));
    let storage = FileStorage::new(
        "./data",
        db.clone(),
        cache,
        config.clone(),
        Some(audit_logger.clone()),
    ).with_dispatcher(dispatcher.clone());

    // Start background workers
    workers::start_workers(storage.clone(), db.clone(), config.clone(), dispatcher.clone());

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    // Build Admin API router
    let admin_app = Router::new()
        .nest("/health", health::health_router())
        .route("/metrics", get(metrics::metrics_handler))
        .merge(admin::routes::admin_router(
            storage.clone(),
            config.clone(),
            audit_logger.clone(),
        ))
        .layer(axum::extract::DefaultBodyLimit::disable())
        .layer(tower_http::trace::TraceLayer::new_for_http())
        .layer(cors.clone());

    // Build S3 API router
    let s3_app = s3::routes::s3_router(storage.clone())
        .layer(axum::extract::DefaultBodyLimit::disable())
        .layer(tower_http::trace::TraceLayer::new_for_http())
        .layer(cors);

    let admin_port: u16 = config.admin_port.parse().unwrap_or(8080);
    let s3_port: u16 = config.s3_port.parse().unwrap_or(9000);

    let admin_addr = SocketAddr::from(([0, 0, 0, 0], admin_port));
    let s3_addr = SocketAddr::from(([0, 0, 0, 0], s3_port));

    info!("Admin API listening on {admin_addr}");
    info!("S3 API listening on {s3_addr}");

    let admin_listener = tokio::net::TcpListener::bind(admin_addr).await?;
    let s3_listener = tokio::net::TcpListener::bind(s3_addr).await?;

    let admin_server = tokio::spawn(async move {
        axum::serve(admin_listener, admin_app).await.unwrap();
    });

    let s3_server = tokio::spawn(async move {
        axum::serve(s3_listener, s3_app).await.unwrap();
    });

    tokio::select! {
        _ = tokio::signal::ctrl_c() => {
            info!("Received shutdown signal");
        }
        _ = admin_server => {}
        _ = s3_server => {}
    }

    Ok(())
}
