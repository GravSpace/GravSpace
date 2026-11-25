pub const SCHEMA: &str = r#"
CREATE TABLE IF NOT EXISTS vault_secrets (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    environment TEXT NOT NULL DEFAULT 'development',
    secret_type TEXT NOT NULL DEFAULT 'kv',
    description TEXT,
    tags TEXT,
    current_version INTEGER NOT NULL DEFAULT 1,
    encrypted_value TEXT NOT NULL,
    metadata_json TEXT,
    requires_approval BOOLEAN DEFAULT FALSE,
    created_by TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    project_id TEXT NOT NULL DEFAULT 'default',
    UNIQUE(environment, name)
);
CREATE INDEX IF NOT EXISTS idx_vault_secrets_env ON vault_secrets(environment);
CREATE INDEX IF NOT EXISTS idx_vault_secrets_type ON vault_secrets(secret_type);
CREATE INDEX IF NOT EXISTS idx_vault_secrets_project ON vault_secrets(project_id);
CREATE INDEX IF NOT EXISTS idx_vault_secrets_proj_env ON vault_secrets(project_id, environment);

CREATE TABLE IF NOT EXISTS vault_secret_versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    secret_id TEXT NOT NULL,
    version INTEGER NOT NULL,
    encrypted_value TEXT NOT NULL,
    metadata_json TEXT,
    comment TEXT,
    created_by TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (secret_id) REFERENCES vault_secrets(id) ON DELETE CASCADE,
    UNIQUE(secret_id, version)
);

CREATE TABLE IF NOT EXISTS vault_access_requests (
    id TEXT PRIMARY KEY,
    secret_id TEXT,
    environment TEXT NOT NULL,
    requester TEXT NOT NULL,
    justification TEXT NOT NULL,
    requested_duration_minutes INTEGER NOT NULL DEFAULT 60,
    status TEXT NOT NULL DEFAULT 'pending',
    reviewed_by TEXT,
    reviewed_at TIMESTAMP,
    review_comment TEXT,
    access_granted_until TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    project_id TEXT NOT NULL DEFAULT 'default',
    FOREIGN KEY (secret_id) REFERENCES vault_secrets(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_vault_access_requests_status ON vault_access_requests(status);

CREATE TABLE IF NOT EXISTS vault_projects (
    id TEXT PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT,
    color TEXT NOT NULL DEFAULT 'indigo',
    icon TEXT NOT NULL DEFAULT 'folder',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_vault_projects_slug ON vault_projects(slug);

INSERT OR IGNORE INTO vault_projects (id, slug, name, description, color, icon)
VALUES 
    ('proj_default', 'default', 'Default Project', 'General and shared system secrets', 'indigo', 'folder');

CREATE TABLE IF NOT EXISTS vault_environments (
    id TEXT PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT 'sky',
    description TEXT,
    position INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_vault_environments_position ON vault_environments(position);

INSERT OR IGNORE INTO vault_environments (id, slug, name, color, description, position)
VALUES 
    ('env_dev', 'development', 'Development', 'sky', 'Local development environment', 1),
    ('env_staging', 'staging', 'Staging', 'amber', 'Pre-production staging environment', 2),
    ('env_prod', 'production', 'Production', 'rose', 'Live customer-facing environment', 3);
"#;
