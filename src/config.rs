use std::env;

#[derive(Clone, Debug)]
pub struct Config {
    pub jwt_secret: String,
    pub admin_port: String,
    pub s3_port: String,
    pub cors_origins: Vec<String>,
    pub database_url: String,
    pub database_auth_token: String,
    pub vault_database_url: String,
    pub federation_database_url: String,
    pub server_host: String,
    pub cdn_hosts: Vec<String>,
    pub initial_admin_password: Option<String>,
    pub initial_admin_access_key: Option<String>,
    pub initial_admin_secret_key: Option<String>,
    pub sse_master_key: Vec<u8>,
    pub sync_worker_interval_secs: u64,
    pub lifecycle_worker_interval_secs: u64,
    pub redis_url: Option<String>,
}

impl Config {
    pub fn load() -> Self {
        let _ = dotenvy::dotenv();

        let jwt_secret = env::var("JWT_SECRET").unwrap_or_else(|_| "secret".to_string());
        let strict_secrets = env::var("GRAVSPACE_STRICT_SECRETS")
            .map(|v| matches!(v.trim().to_ascii_lowercase().as_str(), "1" | "true" | "yes"))
            .unwrap_or(false);
        if jwt_secret == "secret" {
            if strict_secrets {
                panic!("GRAVSPACE_STRICT_SECRETS=true requires a custom non-default JWT_SECRET");
            }
            tracing::warn!("Security warning: JWT_SECRET is using insecure default value; set JWT_SECRET in .env");
        }
        let admin_port = env::var("ADMIN_PORT").unwrap_or_else(|_| "8080".to_string());
        let s3_port = env::var("S3_PORT").unwrap_or_else(|_| "9000".to_string());

        let cors_origins = match env::var("CORS_ORIGINS") {
            Ok(val) if !val.trim().is_empty() => {
                val.split(',').map(|s| s.trim().to_string()).collect()
            }
            _ => vec!["*".to_string()],
        };

        let mut database_url = env::var("DATABASE_URL").unwrap_or_default();
        if database_url.is_empty() {
            database_url = env::var("TURSO_DATABASE_URL").unwrap_or_default();
        }
        if database_url.is_empty()
            || database_url == "http://127.0.0.1:8085"
            || database_url == "http://localhost:8085"
        {
            database_url = "./db/turso.db".to_string();
        }

        let mut database_auth_token = env::var("DATABASE_AUTH_TOKEN").unwrap_or_default();
        if database_auth_token.is_empty() {
            database_auth_token = env::var("TURSO_AUTH_TOKEN").unwrap_or_default();
        }

        let vault_database_url = env::var("VAULT_DATABASE_URL")
            .unwrap_or_else(|_| "./db/vault.db".to_string());
        let federation_database_url = env::var("FEDERATION_DATABASE_URL")
            .unwrap_or_else(|_| "./db/federation.db".to_string());

        let server_host = env::var("SERVER_HOST").unwrap_or_default();
        let cdn_hosts = env::var("CDN_HOSTS")
            .unwrap_or_default()
            .split(',')
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect();

        let initial_admin_password = env::var("INITIAL_ADMIN_PASSWORD")
            .ok()
            .filter(|s| !s.trim().is_empty());
        let initial_admin_access_key = env::var("INITIAL_ADMIN_ACCESS_KEY")
            .ok()
            .filter(|s| !s.trim().is_empty());
        let initial_admin_secret_key = env::var("INITIAL_ADMIN_SECRET_KEY")
            .ok()
            .filter(|s| !s.trim().is_empty());

        let key_str = env::var("SSE_MASTER_KEY")
            .unwrap_or_else(|_| "this-is-a-very-secret-key-32byte".to_string());
        if key_str == "this-is-a-very-secret-key-32byte" {
            if strict_secrets {
                panic!("GRAVSPACE_STRICT_SECRETS=true requires a custom 32-byte SSE_MASTER_KEY");
            }
            tracing::warn!("Security warning: SSE_MASTER_KEY is using insecure default value; set SSE_MASTER_KEY in .env");
        }
        let sse_master_key = key_str.into_bytes();

        let sync_worker_interval_secs = env::var("SYNC_WORKER_INTERVAL")
            .ok()
            .and_then(|s| parse_duration_seconds(&s))
            .unwrap_or(300);

        let lifecycle_worker_interval_secs = env::var("LIFECYCLE_WORKER_INTERVAL")
            .ok()
            .and_then(|s| parse_duration_seconds(&s))
            .unwrap_or(3600);

        let redis_url = env::var("REDIS_URL").ok().filter(|s| !s.is_empty());

        Self {
            jwt_secret,
            admin_port,
            s3_port,
            cors_origins,
            database_url,
            database_auth_token,
            vault_database_url,
            federation_database_url,
            server_host,
            cdn_hosts,
            initial_admin_password,
            initial_admin_access_key,
            initial_admin_secret_key,
            sse_master_key,
            sync_worker_interval_secs,
            lifecycle_worker_interval_secs,
            redis_url,
        }
    }
}

fn parse_duration_seconds(s: &str) -> Option<u64> {
    let s = s.trim();
    if s.is_empty() {
        return None;
    }
    if let Some(m) = s.strip_suffix('m') {
        m.parse::<u64>().ok().map(|v| v * 60)
    } else if let Some(h) = s.strip_suffix('h') {
        h.parse::<u64>().ok().map(|v| v * 3600)
    } else if let Some(sec) = s.strip_suffix('s') {
        sec.parse::<u64>().ok()
    } else {
        s.parse::<u64>().ok()
    }
}
