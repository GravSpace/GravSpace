use crate::error::{AppError, DbError};
use libsql::{params, Connection};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InboundShareBinding {
    pub id: i64,
    pub source_node: String,
    pub source_bucket: String,
    pub source_prefix: String,
    pub target_bucket: String,
    pub target_prefix: String,
    pub sync_mode: String,
    pub share_name: String,
    pub last_synced_at: String,
    pub created_at: String,
}

pub struct InboundShareUpsert<'a> {
    pub source_node: &'a str,
    pub source_bucket: &'a str,
    pub source_prefix: &'a str,
    pub target_bucket: &'a str,
    pub target_prefix: &'a str,
    pub sync_mode: &'a str,
    pub share_name: &'a str,
}

fn map_inbound_row(row: &libsql::Row) -> Result<InboundShareBinding, AppError> {
    Ok(InboundShareBinding {
        id: row.get(0).map_err(|e| DbError::Query(e.to_string()))?,
        source_node: row.get(1).unwrap_or_default(),
        source_bucket: row.get(2).unwrap_or_default(),
        source_prefix: row.get(3).unwrap_or_default(),
        target_bucket: row.get(4).unwrap_or_default(),
        target_prefix: row.get(5).unwrap_or_default(),
        sync_mode: row.get(6).unwrap_or_else(|_| "one_way".to_string()),
        share_name: row.get(7).unwrap_or_default(),
        last_synced_at: row.get(8).unwrap_or_default(),
        created_at: row.get(9).unwrap_or_default(),
    })
}

/// Inserts or refreshes an inbound federation binding received from a source peer.
pub async fn upsert_inbound_share(
    conn: &Connection,
    entry: &InboundShareUpsert<'_>,
) -> Result<(), AppError> {
    conn.execute(
        "INSERT INTO federation_inbound_shares
            (source_node, source_bucket, source_prefix, target_bucket, target_prefix, sync_mode, share_name, last_synced_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, CURRENT_TIMESTAMP)
         ON CONFLICT(source_node, source_bucket, source_prefix, target_bucket, target_prefix)
         DO UPDATE SET
            sync_mode = excluded.sync_mode,
            share_name = excluded.share_name,
            last_synced_at = CURRENT_TIMESTAMP",
        params![
            entry.source_node,
            entry.source_bucket,
            entry.source_prefix,
            entry.target_bucket,
            entry.target_prefix,
            entry.sync_mode,
            entry.share_name,
        ],
    )
    .await
    .map_err(|e| DbError::Query(e.to_string()))?;
    Ok(())
}

/// Removes an inbound federation binding matching its source/target coordinates.
pub async fn remove_inbound_share_by_key(
    conn: &Connection,
    source_node: &str,
    source_bucket: &str,
    source_prefix: &str,
    target_bucket: &str,
    target_prefix: &str,
) -> Result<(), AppError> {
    conn.execute(
        "DELETE FROM federation_inbound_shares
         WHERE source_node = ?1 AND source_bucket = ?2 AND source_prefix = ?3
           AND target_bucket = ?4 AND target_prefix = ?5",
        params![
            source_node,
            source_bucket,
            source_prefix,
            target_bucket,
            target_prefix,
        ],
    )
    .await
    .map_err(|e| DbError::Query(e.to_string()))?;
    Ok(())
}

/// Lists inbound federation bindings, optionally filtered to a single target bucket.
pub async fn list_inbound_shares(
    conn: &Connection,
    target_bucket: Option<&str>,
) -> Result<Vec<InboundShareBinding>, AppError> {
    let mut rows = if let Some(bucket) = target_bucket {
        conn.query(
            "SELECT id, source_node, source_bucket, source_prefix, target_bucket, target_prefix, sync_mode, share_name, last_synced_at, created_at
             FROM federation_inbound_shares
             WHERE target_bucket = ?1
             ORDER BY last_synced_at DESC, id DESC",
            params![bucket],
        )
        .await
    } else {
        conn.query(
            "SELECT id, source_node, source_bucket, source_prefix, target_bucket, target_prefix, sync_mode, share_name, last_synced_at, created_at
             FROM federation_inbound_shares
             ORDER BY last_synced_at DESC, id DESC",
            params![],
        )
        .await
    }
    .map_err(|e| DbError::Query(e.to_string()))?;

    let mut list = Vec::new();
    while let Some(row) = rows.next().await.map_err(|e| DbError::Query(e.to_string()))? {
        list.push(map_inbound_row(&row)?);
    }
    Ok(list)
}

/// Deletes an inbound federation binding by row ID. Returns true if a row was removed.
pub async fn delete_inbound_share(conn: &Connection, id: i64) -> Result<bool, AppError> {
    let affected = conn
        .execute("DELETE FROM federation_inbound_shares WHERE id = ?1", params![id])
        .await
        .map_err(|e| DbError::Query(e.to_string()))?;
    Ok(affected > 0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::Database;

    #[tokio::test]
    async fn upsert_list_remove_and_delete_should_work() {
        let dir = std::env::temp_dir().join(format!("grav_fed_inb_{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).expect("tempdir");
        let db_path = dir.join("fed_inbound.db");
        let database = Database::open_federation(db_path.to_str().expect("path"))
            .await
            .expect("open_federation");
        let conn = database.conn().expect("conn");

        let entry = InboundShareUpsert {
            source_node: "Server 83",
            source_bucket: "prod-data",
            source_prefix: "multi-db/",
            target_bucket: "prod-data",
            target_prefix: "multi-db/",
            sync_mode: "one_way",
            share_name: "MultiDB Mirror",
        };
        upsert_inbound_share(&conn, &entry).await.expect("first upsert");
        upsert_inbound_share(
            &conn,
            &InboundShareUpsert {
                sync_mode: "two_way",
                ..entry
            },
        )
        .await
        .expect("second upsert deduplicates");

        let rows = list_inbound_shares(&conn, Some("prod-data")).await.expect("list");
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].sync_mode, "two_way");
        assert_eq!(rows[0].source_node, "Server 83");

        let other_rows = list_inbound_shares(&conn, Some("other")).await.expect("list other");
        assert!(other_rows.is_empty());

        remove_inbound_share_by_key(&conn, "Server 83", "prod-data", "multi-db/", "prod-data", "multi-db/")
            .await
            .expect("remove by key");
        assert!(list_inbound_shares(&conn, None).await.expect("empty").is_empty());

        upsert_inbound_share(&conn, &entry).await.expect("reinsert");
        let id = list_inbound_shares(&conn, None).await.expect("list again")[0].id;
        assert!(delete_inbound_share(&conn, id).await.expect("delete by id"));
        assert!(!delete_inbound_share(&conn, id).await.expect("second delete false"));
    }
}
