use crate::db::federation::RemoteServerRow;
use crate::error::{AppError, DbError};
use libsql::{params, Connection};
use serde::Serialize;

/// Public peer representation omitting `secret_key` so listing endpoints never expose plaintext secrets.
#[derive(Debug, Clone, Serialize)]
pub struct RemoteServerPublic {
    pub id: i64,
    pub name: String,
    pub endpoint: String,
    pub s3_endpoint: Option<String>,
    pub access_key: String,
    pub has_secret: bool,
    pub status: String,
    pub latency_ms: i64,
    pub last_heartbeat: Option<String>,
    pub created_at: String,
}

impl From<RemoteServerRow> for RemoteServerPublic {
    fn from(row: RemoteServerRow) -> Self {
        Self {
            id: row.id,
            name: row.name,
            endpoint: row.endpoint,
            s3_endpoint: row.s3_endpoint,
            access_key: row.access_key,
            has_secret: !row.secret_key.trim().is_empty(),
            status: row.status,
            latency_ms: row.latency_ms,
            last_heartbeat: row.last_heartbeat,
            created_at: row.created_at,
        }
    }
}

/// Borrowed patch fields used when updating an existing remote federation peer.
pub struct RemoteServerUpdate<'a> {
    pub name: &'a str,
    pub endpoint: &'a str,
    pub s3_endpoint: Option<&'a str>,
    pub access_key: &'a str,
    pub secret_key: Option<&'a str>,
}

/// Updates an existing `remote_servers` row, keeping `secret_key` unchanged when `patch.secret_key` is `None`.
pub async fn update_remote_server(
    conn: &Connection,
    id: i64,
    patch: &RemoteServerUpdate<'_>,
) -> Result<bool, AppError> {
    let res = conn
        .execute(
            "UPDATE remote_servers
             SET name = ?1,
                 endpoint = ?2,
                 s3_endpoint = ?3,
                 access_key = ?4,
                 secret_key = COALESCE(?5, secret_key)
             WHERE id = ?6",
            params![
                patch.name,
                patch.endpoint,
                patch.s3_endpoint,
                patch.access_key,
                patch.secret_key,
                id
            ],
        )
        .await;

    match res {
        Ok(affected) => Ok(affected > 0),
        Err(e) => {
            let msg = e.to_string();
            if msg.contains("UNIQUE") || msg.contains("unique") {
                return Err(AppError::BadRequest(format!(
                    "Peer name '{}' already exists",
                    patch.name
                )));
            }
            Err(DbError::Query(msg).into())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{federation, schema_federation};
    use turso::Builder;

    #[tokio::test]
    async fn update_remote_server_should_preserve_secret_when_none_and_reject_duplicate_name() {
        let db = Builder::new_local(":memory:").build().await.unwrap();
        let conn = db.connect().unwrap();
        conn.execute_batch(schema_federation::SCHEMA).await.unwrap();

        let id1 = federation::create_remote_server(
            &conn,
            "sg-dr",
            "http://10.0.0.1:8080",
            Some("http://10.0.0.1:9001"),
            "ak-1",
            "sk-original",
        )
        .await
        .unwrap();
        let _id2 = federation::create_remote_server(
            &conn,
            "jp-dr",
            "http://10.0.0.2:8080",
            None,
            "ak-2",
            "sk-2",
        )
        .await
        .unwrap();

        // Preserve existing secret when `secret_key` is `None`
        let updated = update_remote_server(
            &conn,
            id1,
            &RemoteServerUpdate {
                name: "sg-dr-renamed",
                endpoint: "http://10.0.0.11:8080",
                s3_endpoint: Some("http://10.0.0.11:9001"),
                access_key: "ak-rotated",
                secret_key: None,
            },
        )
        .await
        .unwrap();
        assert!(updated);

        let peer = federation::get_remote_server(&conn, id1).await.unwrap().unwrap();
        assert_eq!(peer.name, "sg-dr-renamed");
        assert_eq!(peer.endpoint, "http://10.0.0.11:8080");
        assert_eq!(peer.access_key, "ak-rotated");
        assert_eq!(peer.secret_key, "sk-original");

        // Rotate secret explicitly when `Some`
        update_remote_server(
            &conn,
            id1,
            &RemoteServerUpdate {
                name: "sg-dr-renamed",
                endpoint: "http://10.0.0.11:8080",
                s3_endpoint: None,
                access_key: "ak-rotated",
                secret_key: Some("sk-new"),
            },
        )
        .await
        .unwrap();
        let rotated = federation::get_remote_server(&conn, id1).await.unwrap().unwrap();
        assert_eq!(rotated.secret_key, "sk-new");
        assert_eq!(rotated.s3_endpoint, None);

        // Reject duplicate name
        let dup_err = update_remote_server(
            &conn,
            id1,
            &RemoteServerUpdate {
                name: "jp-dr",
                endpoint: "http://10.0.0.11:8080",
                s3_endpoint: None,
                access_key: "ak-rotated",
                secret_key: None,
            },
        )
        .await;
        assert!(matches!(dup_err, Err(AppError::BadRequest(_))));

        // Missing ID returns false
        let missing = update_remote_server(
            &conn,
            9999,
            &RemoteServerUpdate {
                name: "missing",
                endpoint: "http://10.0.0.99:8080",
                s3_endpoint: None,
                access_key: "ak",
                secret_key: None,
            },
        )
        .await
        .unwrap();
        assert!(!missing);
    }
}
