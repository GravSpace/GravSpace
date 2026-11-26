use crate::error::{AppError, DbError};
use libsql::{params, Connection};

/// Borrowed fields for updating an existing cross-server share rule.
pub struct ShareUpdate<'a> {
    pub name: &'a str,
    pub source_bucket: &'a str,
    pub source_prefix: &'a str,
    pub remote_server_id: i64,
    pub target_bucket: &'a str,
    pub target_prefix: &'a str,
    pub sync_mode: &'a str,
    pub enabled: bool,
}

/// Updates an existing `cross_server_shares` rule. Returns `Ok(false)` if not found.
pub async fn update_share(
    conn: &Connection,
    id: i64,
    patch: &ShareUpdate<'_>,
) -> Result<bool, AppError> {
    let affected = conn
        .execute(
            "UPDATE cross_server_shares
             SET name = ?1,
                 source_bucket = ?2,
                 source_prefix = ?3,
                 remote_server_id = ?4,
                 target_bucket = ?5,
                 target_prefix = ?6,
                 sync_mode = ?7,
                 enabled = ?8
             WHERE id = ?9",
            params![
                patch.name,
                patch.source_bucket,
                patch.source_prefix,
                patch.remote_server_id,
                patch.target_bucket,
                patch.target_prefix,
                patch.sync_mode,
                if patch.enabled { 1_i64 } else { 0_i64 },
                id
            ],
        )
        .await
        .map_err(|e| DbError::Query(e.to_string()))?;

    Ok(affected > 0)
}

/// Sets or toggles `enabled` on a share rule, returning `Some(new_enabled)` if the row exists.
pub async fn set_share_enabled(
    conn: &Connection,
    id: i64,
    desired: Option<bool>,
) -> Result<Option<bool>, AppError> {
    let next_enabled = match desired {
        Some(v) => v,
        None => {
            let mut rows = conn
                .query(
                    "SELECT enabled FROM cross_server_shares WHERE id = ?1",
                    params![id],
                )
                .await
                .map_err(|e| DbError::Query(e.to_string()))?;
            let Some(row) = rows.next().await.map_err(|e| DbError::Query(e.to_string()))? else {
                return Ok(None);
            };
            row.get::<i64>(0).unwrap_or(1) == 0
        }
    };

    let affected = conn
        .execute(
            "UPDATE cross_server_shares SET enabled = ?1 WHERE id = ?2",
            params![if next_enabled { 1_i64 } else { 0_i64 }, id],
        )
        .await
        .map_err(|e| DbError::Query(e.to_string()))?;

    if affected == 0 {
        Ok(None)
    } else {
        Ok(Some(next_enabled))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{federation, schema_federation};
    use turso::Builder;

    #[tokio::test]
    async fn update_share_and_toggle_enabled_should_persist() {
        let db = Builder::new_local(":memory:").build().await.unwrap();
        let conn = db.connect().unwrap();
        conn.execute_batch(schema_federation::SCHEMA).await.unwrap();

        let peer_id = federation::create_remote_server(
            &conn,
            "sg-dr",
            "http://10.0.0.1:8080",
            None,
            "ak",
            "sk",
        )
        .await
        .unwrap();

        let share_id = federation::create_share(
            &conn,
            "media-sync",
            "edge",
            "media/",
            peer_id,
            "edge-dr",
            "media/",
            "one_way",
        )
        .await
        .unwrap();

        let updated = update_share(
            &conn,
            share_id,
            &ShareUpdate {
                name: "media-two-way",
                source_bucket: "edge",
                source_prefix: "assets/",
                remote_server_id: peer_id,
                target_bucket: "edge-dr",
                target_prefix: "backup/",
                sync_mode: "two_way",
                enabled: false,
            },
        )
        .await
        .unwrap();
        assert!(updated);

        let shares = federation::list_shares(&conn).await.unwrap();
        assert_eq!(shares[0].name, "media-two-way");
        assert_eq!(shares[0].sync_mode, "two_way");
        assert!(!shares[0].enabled);

        let toggled = set_share_enabled(&conn, share_id, None).await.unwrap();
        assert_eq!(toggled, Some(true));
        let shares_after = federation::list_shares(&conn).await.unwrap();
        assert!(shares_after[0].enabled);

        assert_eq!(set_share_enabled(&conn, 9999, Some(false)).await.unwrap(), None);
    }
}
