use crate::error::{AppError, DbError};
use libsql::{params, Connection};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PartRow {
    pub upload_id: String,
    pub part_number: i64,
    pub etag: String,
    pub size: i64,
    pub modified_at: String,
}

pub async fn create_multipart_upload(
    conn: &Connection,
    upload_id: &str,
    bucket: &str,
    key: &str,
) -> Result<(), AppError> {
    conn.execute(
        "INSERT INTO multipart_uploads (upload_id, bucket, key) VALUES (?1, ?2, ?3)",
        params![upload_id, bucket, key],
    )
    .await
    .map_err(|e| DbError::Query(e.to_string()))?;
    Ok(())
}

pub async fn delete_multipart_upload(
    conn: &Connection,
    upload_id: &str,
) -> Result<(), AppError> {
    conn.execute(
        "DELETE FROM multipart_uploads WHERE upload_id = ?1",
        params![upload_id],
    )
    .await
    .map_err(|e| DbError::Query(e.to_string()))?;
    Ok(())
}

pub async fn save_part(
    conn: &Connection,
    upload_id: &str,
    part_number: i64,
    etag: &str,
    size: i64,
) -> Result<(), AppError> {
    conn.execute(
        r#"INSERT INTO multipart_parts (upload_id, part_number, etag, size)
           VALUES (?1, ?2, ?3, ?4)
           ON CONFLICT(upload_id, part_number) DO UPDATE SET
               etag = excluded.etag,
               size = excluded.size,
               modified_at = CURRENT_TIMESTAMP"#,
        params![upload_id, part_number, etag, size],
    )
    .await
    .map_err(|e| DbError::Query(e.to_string()))?;
    Ok(())
}

pub async fn list_parts(
    conn: &Connection,
    upload_id: &str,
) -> Result<Vec<PartRow>, AppError> {
    let mut rows = conn
        .query(
            "SELECT upload_id, part_number, etag, size, modified_at
             FROM multipart_parts WHERE upload_id = ?1 ORDER BY part_number ASC",
            params![upload_id],
        )
        .await
        .map_err(|e| DbError::Query(e.to_string()))?;

    let mut parts = Vec::new();
    while let Some(row) = rows.next().await.map_err(|e| DbError::Query(e.to_string()))? {
        parts.push(PartRow {
            upload_id: row.get(0).map_err(|e| DbError::Query(e.to_string()))?,
            part_number: row.get(1).unwrap_or(0),
            etag: row.get(2).unwrap_or_default(),
            size: row.get(3).unwrap_or(0),
            modified_at: row.get(4).unwrap_or_default(),
        });
    }
    Ok(parts)
}
