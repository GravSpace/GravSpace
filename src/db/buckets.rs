use crate::error::{AppError, DbError};
use libsql::{params, Connection};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BucketRow {
    pub name: String,
    pub created_at: String,
    pub owner: String,
    pub versioning_enabled: bool,
    pub object_lock_enabled: bool,
    pub default_retention_mode: Option<String>,
    pub default_retention_days: Option<i64>,
    pub soft_delete_enabled: bool,
    pub soft_delete_retention: i64,
    pub quota_bytes: i64,
}

pub async fn create_bucket(conn: &Connection, name: &str, owner: &str) -> Result<(), AppError> {
    conn.execute(
        "INSERT INTO buckets (name, owner) VALUES (?1, ?2) ON CONFLICT(name) DO NOTHING",
        params![name, owner],
    )
    .await
    .map_err(|e| DbError::Query(e.to_string()))?;
    Ok(())
}

pub async fn get_bucket(conn: &Connection, name: &str) -> Result<Option<BucketRow>, AppError> {
    let mut rows = conn
        .query(
            "SELECT name, created_at, COALESCE(owner, 'admin'), versioning_enabled,
                    object_lock_enabled, default_retention_mode, default_retention_days,
                    soft_delete_enabled, soft_delete_retention, quota_bytes
             FROM buckets WHERE name = ?1",
            params![name],
        )
        .await
        .map_err(|e| DbError::Query(e.to_string()))?;

    if let Some(row) = rows.next().await.map_err(|e| DbError::Query(e.to_string()))? {
        let versioning: i64 = row.get(3).unwrap_or(0);
        let object_lock: i64 = row.get(4).unwrap_or(0);
        let soft_delete: i64 = row.get(7).unwrap_or(0);

        Ok(Some(BucketRow {
            name: row.get(0).map_err(|e| DbError::Query(e.to_string()))?,
            created_at: row.get(1).unwrap_or_default(),
            owner: row.get(2).unwrap_or_else(|_| "admin".to_string()),
            versioning_enabled: versioning != 0,
            object_lock_enabled: object_lock != 0,
            default_retention_mode: row.get(5).ok(),
            default_retention_days: row.get(6).ok(),
            soft_delete_enabled: soft_delete != 0,
            soft_delete_retention: row.get(8).unwrap_or(30),
            quota_bytes: row.get(9).unwrap_or(0),
        }))
    } else {
        Ok(None)
    }
}

pub async fn list_buckets(conn: &Connection) -> Result<Vec<String>, AppError> {
    let mut rows = conn
        .query("SELECT name FROM buckets ORDER BY name ASC", ())
        .await
        .map_err(|e| DbError::Query(e.to_string()))?;

    let mut names = Vec::new();
    while let Some(row) = rows.next().await.map_err(|e| DbError::Query(e.to_string()))? {
        if let Ok(name) = row.get::<String>(0) {
            names.push(name);
        }
    }
    Ok(names)
}

pub async fn delete_bucket(conn: &Connection, name: &str) -> Result<(), AppError> {
    let obj_table = crate::db::shards::object_table_for_bucket(name);
    let tag_table = crate::db::shards::object_tags_table_for_bucket(name);

    let id_sql = format!("SELECT id FROM {obj_table} WHERE bucket = ?1");
    let mut id_rows = conn
        .query(&id_sql, params![name])
        .await
        .map_err(|e| DbError::Query(e.to_string()))?;
    while let Some(row) = id_rows.next().await.map_err(|e| DbError::Query(e.to_string()))? {
        if let Ok(obj_id) = row.get::<i64>(0) {
            let del_tag = format!("DELETE FROM {tag_table} WHERE object_id = ?1");
            conn.execute(&del_tag, params![obj_id])
                .await
                .map_err(|e| DbError::Query(e.to_string()))?;
        }
    }

    let del_obj = format!("DELETE FROM {obj_table} WHERE bucket = ?1");
    conn.execute(&del_obj, params![name])
        .await
        .map_err(|e| DbError::Query(e.to_string()))?;

    conn.execute("DELETE FROM buckets WHERE name = ?1", params![name])
        .await
        .map_err(|e| DbError::Query(e.to_string()))?;
    Ok(())
}

pub async fn set_bucket_versioning(
    conn: &Connection,
    name: &str,
    enabled: bool,
) -> Result<(), AppError> {
    conn.execute(
        "UPDATE buckets SET versioning_enabled = ?1 WHERE name = ?2",
        params![enabled as i64, name],
    )
    .await
    .map_err(|e| DbError::Query(e.to_string()))?;
    Ok(())
}

pub async fn get_bucket_versioning(conn: &Connection, name: &str) -> Result<bool, AppError> {
    Ok(get_bucket(conn, name).await?.map(|b| b.versioning_enabled).unwrap_or(false))
}

pub async fn set_bucket_object_lock(
    conn: &Connection,
    name: &str,
    enabled: bool,
) -> Result<(), AppError> {
    conn.execute(
        "UPDATE buckets SET object_lock_enabled = ?1 WHERE name = ?2",
        params![enabled as i64, name],
    )
    .await
    .map_err(|e| DbError::Query(e.to_string()))?;
    Ok(())
}

pub async fn set_bucket_default_retention(
    conn: &Connection,
    name: &str,
    mode: &str,
    days: i64,
) -> Result<(), AppError> {
    conn.execute(
        "UPDATE buckets SET default_retention_mode = ?1, default_retention_days = ?2 WHERE name = ?3",
        params![mode, days, name],
    )
    .await
    .map_err(|e| DbError::Query(e.to_string()))?;
    Ok(())
}

pub async fn set_bucket_quota(
    conn: &Connection,
    name: &str,
    quota_bytes: i64,
) -> Result<(), AppError> {
    conn.execute(
        "UPDATE buckets SET quota_bytes = ?1 WHERE name = ?2",
        params![quota_bytes, name],
    )
    .await
    .map_err(|e| DbError::Query(e.to_string()))?;
    Ok(())
}

pub async fn set_bucket_soft_delete(
    conn: &Connection,
    name: &str,
    enabled: bool,
    retention_days: i64,
) -> Result<(), AppError> {
    conn.execute(
        "UPDATE buckets SET soft_delete_enabled = ?1, soft_delete_retention = ?2 WHERE name = ?3",
        params![enabled as i64, retention_days, name],
    )
    .await
    .map_err(|e| DbError::Query(e.to_string()))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{objects, shards, Database};
    use std::collections::HashMap;

    #[tokio::test]
    async fn delete_bucket_should_clean_shard_objects_and_tags() {
        let tmp_dir =
            std::env::temp_dir().join(format!("grav_bkt_del_{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&tmp_dir).unwrap();
        let db = Database::open_turso(tmp_dir.join("turso.db").to_str().unwrap())
            .await
            .unwrap();
        let conn = db.conn().unwrap();

        create_bucket(&conn, "temp-bkt", "admin").await.unwrap();
        let obj_table = shards::object_table_for_bucket("temp-bkt");
        let tag_table = shards::object_tags_table_for_bucket("temp-bkt");

        conn.execute(
            &format!("INSERT INTO {obj_table} (id, bucket, key, version_id, size) VALUES (5, 'temp-bkt', 'doc.pdf', 'v1', 100)"),
            (),
        )
        .await
        .unwrap();
        let mut tags = HashMap::new();
        tags.insert("k".to_string(), "v".to_string());
        objects::put_object_tagging(&conn, "temp-bkt", 5, &tags)
            .await
            .unwrap();

        delete_bucket(&conn, "temp-bkt").await.unwrap();

        let mut obj_rows = conn
            .query(&format!("SELECT COUNT(*) FROM {obj_table} WHERE bucket = 'temp-bkt'"), ())
            .await
            .unwrap();
        assert_eq!(obj_rows.next().await.unwrap().unwrap().get::<i64>(0).unwrap(), 0);

        let mut tag_rows = conn
            .query(&format!("SELECT COUNT(*) FROM {tag_table} WHERE object_id = 5"), ())
            .await
            .unwrap();
        assert_eq!(tag_rows.next().await.unwrap().unwrap().get::<i64>(0).unwrap(), 0);

        let _ = std::fs::remove_dir_all(&tmp_dir);
    }
}
