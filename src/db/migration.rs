use crate::db::{settings, Database};
use crate::error::{AppError, DbError};
use libsql::{params, params_from_iter, Connection, Value};
use std::collections::HashSet;

const VAULT_MIGRATION_KEY: &str = "vault_db_migration_v1";
const FEDERATION_MIGRATION_KEY: &str = "federation_db_migration_v1";

struct TableSpec {
    name: &'static str,
    columns: &'static [&'static str],
}

const VAULT_TABLES: &[TableSpec] = &[
    TableSpec {
        name: "vault_projects",
        columns: &[
            "id", "slug", "name", "description", "color", "icon", "created_at", "updated_at",
        ],
    },
    TableSpec {
        name: "vault_environments",
        columns: &[
            "id", "slug", "name", "color", "description", "position", "created_at",
        ],
    },
    TableSpec {
        name: "vault_secrets",
        columns: &[
            "id",
            "name",
            "environment",
            "secret_type",
            "description",
            "tags",
            "current_version",
            "encrypted_value",
            "metadata_json",
            "requires_approval",
            "created_by",
            "created_at",
            "updated_at",
            "project_id",
        ],
    },
    TableSpec {
        name: "vault_secret_versions",
        columns: &[
            "id",
            "secret_id",
            "version",
            "encrypted_value",
            "metadata_json",
            "comment",
            "created_by",
            "created_at",
        ],
    },
    TableSpec {
        name: "vault_access_requests",
        columns: &[
            "id",
            "secret_id",
            "environment",
            "requester",
            "justification",
            "requested_duration_minutes",
            "status",
            "reviewed_by",
            "reviewed_at",
            "review_comment",
            "access_granted_until",
            "created_at",
            "project_id",
        ],
    },
];

const FEDERATION_TABLES: &[TableSpec] = &[
    TableSpec {
        name: "remote_servers",
        columns: &[
            "id",
            "name",
            "endpoint",
            "s3_endpoint",
            "access_key",
            "secret_key",
            "status",
            "latency_ms",
            "last_heartbeat",
            "created_at",
        ],
    },
    TableSpec {
        name: "cross_server_shares",
        columns: &[
            "id",
            "name",
            "source_bucket",
            "source_prefix",
            "remote_server_id",
            "target_bucket",
            "target_prefix",
            "sync_mode",
            "enabled",
            "status",
            "last_synced_at",
            "created_at",
        ],
    },
    TableSpec {
        name: "sync_queue",
        columns: &[
            "id",
            "share_id",
            "source_bucket",
            "source_key",
            "target_bucket",
            "target_key",
            "action",
            "version_id",
            "content_hash",
            "size_bytes",
            "status",
            "attempts",
            "max_attempts",
            "next_retry_at",
            "last_error",
            "created_at",
            "updated_at",
        ],
    },
];

/// Migrates legacy Vault and Federation tables from `db/turso.db` into `db/vault.db` and `db/federation.db`.
pub async fn migrate_legacy_domains(
    turso_db: &Database,
    vault_db: &Database,
    federation_db: &Database,
) -> Result<(), AppError> {
    let vault_moved =
        migrate_table_group(turso_db, vault_db, VAULT_MIGRATION_KEY, VAULT_TABLES).await?;
    let fed_moved =
        migrate_table_group(turso_db, federation_db, FEDERATION_MIGRATION_KEY, FEDERATION_TABLES)
            .await?;

    if vault_moved > 0 || fed_moved > 0 {
        tracing::info!(
            "Multi-DB domain migration completed: moved {vault_moved} Vault row(s) -> vault.db, {fed_moved} Federation row(s) -> federation.db"
        );
    }
    Ok(())
}

async fn migrate_table_group(
    src_db: &Database,
    dst_db: &Database,
    flag_key: &str,
    specs: &[TableSpec],
) -> Result<i64, AppError> {
    let src_conn = src_db.conn()?;
    if settings::get_setting(&src_conn, flag_key).await?.as_deref() == Some("done") {
        return Ok(0);
    }

    let dst_conn = dst_db.conn()?;
    let mut total_migrated: i64 = 0;

    for spec in specs {
        if !table_exists(&src_conn, spec.name).await? {
            continue;
        }
        let copied = copy_table(&src_conn, &dst_conn, spec).await?;
        let src_count = count_rows(&src_conn, spec.name).await?;
        let dst_count = count_rows(&dst_conn, spec.name).await?;
        if dst_count < src_count {
            return Err(DbError::Query(format!(
                "Multi-DB migration verification failed for '{}': dst={dst_count} < src={src_count}",
                spec.name
            ))
            .into());
        }
        total_migrated += copied;
    }

    // Verified safe: delete legacy rows in reverse FK order (children before parents)
    for spec in specs.iter().rev() {
        if table_exists(&src_conn, spec.name).await? {
            let del_sql = format!("DELETE FROM {}", spec.name);
            src_conn
                .execute(&del_sql, ())
                .await
                .map_err(|e| DbError::Query(format!("Failed clearing legacy {}: {e}", spec.name)))?;
        }
    }

    settings::set_setting(&src_conn, flag_key, "done").await?;
    Ok(total_migrated)
}

async fn table_exists(conn: &Connection, table: &str) -> Result<bool, AppError> {
    let mut rows = conn
        .query(
            "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?1 LIMIT 1",
            params![table],
        )
        .await
        .map_err(|e| DbError::Query(e.to_string()))?;
    Ok(rows
        .next()
        .await
        .map_err(|e| DbError::Query(e.to_string()))?
        .is_some())
}

async fn available_columns(
    conn: &Connection,
    table: &str,
    desired: &[&'static str],
) -> Result<Vec<&'static str>, AppError> {
    let pragma_sql = format!("PRAGMA table_info({table});");
    let mut rows = conn
        .query(&pragma_sql, ())
        .await
        .map_err(|e| DbError::Query(e.to_string()))?;

    let mut present = HashSet::new();
    while let Some(row) = rows.next().await.map_err(|e| DbError::Query(e.to_string()))? {
        if let Ok(name) = row.get::<String>(1) {
            present.insert(name);
        }
    }

    Ok(desired
        .iter()
        .copied()
        .filter(|col| present.contains(*col))
        .collect())
}

async fn copy_table(
    src_conn: &Connection,
    dst_conn: &Connection,
    spec: &TableSpec,
) -> Result<i64, AppError> {
    let cols = available_columns(src_conn, spec.name, spec.columns).await?;
    if cols.is_empty() {
        return Ok(0);
    }

    let col_list = cols.join(", ");
    let placeholders: Vec<String> = (1..=cols.len()).map(|i| format!("?{i}")).collect();
    let select_sql = format!("SELECT {col_list} FROM {}", spec.name);
    let insert_sql = format!(
        "INSERT OR IGNORE INTO {} ({col_list}) VALUES ({})",
        spec.name,
        placeholders.join(", ")
    );

    let mut rows = src_conn
        .query(&select_sql, ())
        .await
        .map_err(|e| DbError::Query(format!("Failed reading legacy {}: {e}", spec.name)))?;

    let mut count: i64 = 0;
    while let Some(row) = rows.next().await.map_err(|e| DbError::Query(e.to_string()))? {
        let mut vals: Vec<Value> = Vec::with_capacity(cols.len());
        for idx in 0..cols.len() {
            vals.push(
                row.get_value(idx)
                    .map_err(|e| DbError::Query(e.to_string()))?,
            );
        }
        dst_conn
            .execute(&insert_sql, params_from_iter(vals))
            .await
            .map_err(|e| DbError::Query(format!("Failed inserting into {}: {e}", spec.name)))?;
        count += 1;
    }

    Ok(count)
}

async fn count_rows(conn: &Connection, table: &str) -> Result<i64, AppError> {
    let sql = format!("SELECT COUNT(*) FROM {table}");
    let mut rows = conn
        .query(&sql, ())
        .await
        .map_err(|e| DbError::Query(e.to_string()))?;
    if let Some(row) = rows.next().await.map_err(|e| DbError::Query(e.to_string()))? {
        Ok(row.get::<i64>(0).unwrap_or(0))
    } else {
        Ok(0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{schema_federation, schema_vault};

    #[tokio::test]
    async fn migrate_vault_and_federation_should_preserve_ids_and_clean_source() {
        let tmp_dir =
            std::env::temp_dir().join(format!("grav_multi_mig_{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&tmp_dir).unwrap();

        let turso = Database::open_turso(tmp_dir.join("turso.db").to_str().unwrap())
            .await
            .unwrap();
        let vault = Database::open_vault(tmp_dir.join("vault.db").to_str().unwrap())
            .await
            .unwrap();
        let federation = Database::open_federation(tmp_dir.join("federation.db").to_str().unwrap())
            .await
            .unwrap();

        // Seed legacy vault & federation tables directly inside turso.db
        let t_conn = turso.conn().unwrap();
        for stmt in schema_vault::SCHEMA
            .split(';')
            .chain(schema_federation::SCHEMA.split(';'))
        {
            let trimmed = stmt.trim();
            if !trimmed.is_empty() {
                t_conn.execute(trimmed, ()).await.unwrap();
            }
        }

        t_conn
            .execute(
                "INSERT INTO vault_projects (id, slug, name) VALUES ('proj_custom', 'custom', 'Custom')",
                (),
            )
            .await
            .unwrap();
        t_conn
            .execute(
                "INSERT INTO vault_secrets (id, name, environment, encrypted_value, project_id) VALUES ('sec_1', 'API_KEY', 'production', 'enc123', 'proj_custom')",
                (),
            )
            .await
            .unwrap();
        t_conn
            .execute(
                "INSERT INTO vault_secret_versions (id, secret_id, version, encrypted_value) VALUES (42, 'sec_1', 1, 'enc123')",
                (),
            )
            .await
            .unwrap();
        t_conn
            .execute(
                "INSERT INTO remote_servers (id, name, endpoint, access_key, secret_key) VALUES (7, 'edge-1', 'https://edge.local', 'ak', 'sk')",
                (),
            )
            .await
            .unwrap();
        t_conn
            .execute(
                "INSERT INTO cross_server_shares (id, name, source_bucket, remote_server_id, target_bucket) VALUES (9, 'sync-statics', 'statics', 7, 'statics-rep')",
                (),
            )
            .await
            .unwrap();
        t_conn
            .execute(
                "INSERT INTO sync_queue (id, share_id, source_bucket, source_key, target_bucket, target_key, action) VALUES (15, 9, 'statics', 'a.png', 'statics-rep', 'a.png', 'PUT')",
                (),
            )
            .await
            .unwrap();

        migrate_legacy_domains(&turso, &vault, &federation)
            .await
            .unwrap();

        // Source tables should be cleaned
        assert_eq!(count_rows(&t_conn, "vault_secrets").await.unwrap(), 0);
        assert_eq!(count_rows(&t_conn, "remote_servers").await.unwrap(), 0);

        // Destination DBs should hold migrated rows with preserved IDs
        let v_conn = vault.conn().unwrap();
        assert_eq!(count_rows(&v_conn, "vault_secrets").await.unwrap(), 1);
        assert_eq!(count_rows(&v_conn, "vault_projects").await.unwrap(), 2);
        let mut ver_rows = v_conn
            .query("SELECT id FROM vault_secret_versions WHERE secret_id = 'sec_1'", ())
            .await
            .unwrap();
        assert_eq!(ver_rows.next().await.unwrap().unwrap().get::<i64>(0).unwrap(), 42);

        let f_conn = federation.conn().unwrap();
        assert_eq!(count_rows(&f_conn, "remote_servers").await.unwrap(), 1);
        assert_eq!(count_rows(&f_conn, "cross_server_shares").await.unwrap(), 1);
        let mut q_rows = f_conn
            .query("SELECT id FROM sync_queue WHERE share_id = 9", ())
            .await
            .unwrap();
        assert_eq!(q_rows.next().await.unwrap().unwrap().get::<i64>(0).unwrap(), 15);

        let _ = std::fs::remove_dir_all(&tmp_dir);
    }
}
