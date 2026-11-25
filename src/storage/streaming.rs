use crate::error::{AppError, StorageError};
use bytes::Bytes;
use futures_util::Stream;
use futures_util::StreamExt;
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};
use tokio::fs::File;
use tokio::io::AsyncWriteExt;

pub struct StreamWriteResult {
    pub total_bytes: i64,
    pub content_hash: String,
    pub final_path: PathBuf,
}

/// Streams an incoming byte stream directly to disk without buffering the entire payload in RAM.
/// Computes SHA-256 on the fly and performs an atomic rename to final_path upon successful completion.
pub async fn write_stream_to_file<S, E>(
    mut stream: S,
    final_path: impl AsRef<Path>,
) -> Result<StreamWriteResult, AppError>
where
    S: Stream<Item = Result<Bytes, E>> + Unpin,
    E: std::fmt::Display,
{
    let final_path_buf = final_path.as_ref().to_path_buf();
    if let Some(parent) = final_path_buf.parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|e| StorageError::Io(e.to_string()))?;
    }

    let temp_file_name = format!(".tmp_{}", uuid::Uuid::new_v4());
    let temp_path = final_path_buf
        .parent()
        .unwrap_or_else(|| Path::new("."))
        .join(&temp_file_name);

    let file = File::create(&temp_path)
        .await
        .map_err(|e| StorageError::Io(e.to_string()))?;
    let mut writer = tokio::io::BufWriter::with_capacity(64 * 1024, file);

    let mut hasher = Sha256::new();
    let mut total_bytes: i64 = 0;

    while let Some(chunk_res) = stream.next().await {
        let chunk = chunk_res.map_err(|e| {
            let _ = std::fs::remove_file(&temp_path);
            StorageError::Io(format!("Stream aborted: {e}"))
        })?;

        if chunk.is_empty() {
            continue;
        }

        hasher.update(&chunk);
        total_bytes += chunk.len() as i64;

        if let Err(e) = writer.write_all(&chunk).await {
            let _ = std::fs::remove_file(&temp_path);
            return Err(StorageError::Io(e.to_string()).into());
        }
    }

    if let Err(e) = writer.flush().await {
        let _ = std::fs::remove_file(&temp_path);
        return Err(StorageError::Io(e.to_string()).into());
    }
    drop(writer);

    // Atomic rename to final path
    if let Err(_e) = tokio::fs::rename(&temp_path, &final_path_buf).await {
        // Fallback to copy + remove if cross-device link
        if let Err(e2) = tokio::fs::copy(&temp_path, &final_path_buf).await {
            let _ = std::fs::remove_file(&temp_path);
            return Err(StorageError::Io(format!("Failed to finalize file: {e2}")).into());
        }
        let _ = std::fs::remove_file(&temp_path);
    }

    let content_hash = hex::encode(hasher.finalize());

    Ok(StreamWriteResult {
        total_bytes,
        content_hash,
        final_path: final_path_buf,
    })
}
