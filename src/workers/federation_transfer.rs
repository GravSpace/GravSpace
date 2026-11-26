use crate::auth::signature::{build_string_to_sign, calculate_signature, sha256_hex, uri_encode};
use crate::db::federation::{RemoteServerRow, SyncQueueRow};
use crate::storage::object_stream_ops::open_object_byte_stream;
use crate::storage::FileStorage;
use chrono::Utc;

/// Result of attempting to transfer a single federation outbox item to a remote peer.
pub enum TransferOutcome {
    Success,
    TransientError(String),
    PermanentError(String),
    Unreachable(String),
}

/// Signs an S3 HTTP request using AWS SigV4, supporting optional canonical query string parameters.
pub(crate) fn sign_s3_request(
    builder: reqwest::RequestBuilder,
    method: &str,
    endpoint: &str,
    bucket: &str,
    encoded_key: &str,
    canonical_query: &str,
    payload_hash: &str,
    peer: &RemoteServerRow,
) -> reqwest::RequestBuilder {
    let now = Utc::now();
    let amz_date = now.format("%Y%m%dT%H%M%SZ").to_string();
    let date_stamp = now.format("%Y%m%d").to_string();

    let stripped = endpoint
        .strip_prefix("https://")
        .or_else(|| endpoint.strip_prefix("http://"))
        .unwrap_or(endpoint);
    let host = stripped.split('/').next().unwrap_or(stripped);

    let trimmed_key = encoded_key.trim_matches('/');
    let canonical_uri = if trimmed_key.is_empty() {
        format!("/{}", bucket.trim_matches('/'))
    } else {
        format!("/{}/{}", bucket.trim_matches('/'), trimmed_key)
    };
    let canonical_headers =
        format!("host:{host}\nx-amz-content-sha256:{payload_hash}\nx-amz-date:{amz_date}\n");
    let signed_headers = "host;x-amz-content-sha256;x-amz-date";
    let canonical_request = format!(
        "{method}\n{canonical_uri}\n{canonical_query}\n{canonical_headers}\n{signed_headers}\n{payload_hash}"
    );

    let algorithm = "AWS4-HMAC-SHA256";
    let credential_scope = format!("{date_stamp}/us-east-1/s3/aws4_request");
    let string_to_sign =
        build_string_to_sign(algorithm, &amz_date, &credential_scope, &canonical_request);

    let signature =
        calculate_signature(&peer.secret_key, &date_stamp, "us-east-1", "s3", &string_to_sign);
    let auth_header = format!(
        "{algorithm} Credential={}/{credential_scope}, SignedHeaders={signed_headers}, Signature={signature}",
        peer.access_key
    );

    builder
        .header("Host", host)
        .header("User-Agent", "GravSpace-Federation/0.2.0")
        .header("x-amz-date", amz_date)
        .header("x-amz-content-sha256", payload_hash)
        .header("Authorization", auth_header)
}

pub(crate) fn resolve_target_endpoint(peer: &RemoteServerRow) -> (String, bool) {
    let is_s3_peer = peer.s3_endpoint.is_some()
        || (!peer.access_key.is_empty() && !peer.secret_key.starts_with("eyJ"));

    let base_ep = if let Some(ref s3_ep) = peer.s3_endpoint {
        let trimmed = s3_ep.trim().trim_end_matches('/');
        if !trimmed.is_empty() {
            trimmed.to_string()
        } else if peer.endpoint.contains(":8080") {
            peer.endpoint.trim_end_matches('/').replace(":8080", ":9001")
        } else {
            peer.endpoint.trim_end_matches('/').to_string()
        }
    } else if peer.endpoint.contains(":8080") {
        peer.endpoint.trim_end_matches('/').replace(":8080", ":9001")
    } else {
        peer.endpoint.trim_end_matches('/').to_string()
    };

    (base_ep, is_s3_peer)
}

pub(crate) fn encode_s3_key(key: &str) -> String {
    key.trim_start_matches('/')
        .split('/')
        .map(|seg| uri_encode(seg, true))
        .collect::<Vec<_>>()
        .join("/")
}

fn is_permanent_http_status(status: u16) -> bool {
    (400..500).contains(&status) && status != 408 && status != 429
}

/// Transfers a single queued PUT or DELETE sync item to the target peer,
/// streaming raw files directly from disk with `x-gravspace-replicated: 1` echo guard.
pub async fn transfer_sync_item(
    storage: &FileStorage,
    client: &reqwest::Client,
    item: &SyncQueueRow,
    peer: &RemoteServerRow,
) -> TransferOutcome {
    let (base_ep, use_sigv4) = resolve_target_endpoint(peer);
    let encoded_key = encode_s3_key(&item.target_key);

    let target_url = if use_sigv4 {
        format!("{base_ep}/{}/{}", item.target_bucket, encoded_key)
    } else {
        format!(
            "{base_ep}/admin/buckets/{}/objects/{}",
            item.target_bucket, encoded_key
        )
    };

    let sync_result = if item.action == "DELETE" {
        let req_builder = client
            .delete(&target_url)
            .header("x-gravspace-replicated", "1");
        let req = if use_sigv4 {
            let empty_hash = sha256_hex(b"");
            sign_s3_request(
                req_builder,
                "DELETE",
                &base_ep,
                &item.target_bucket,
                &encoded_key,
                "",
                &empty_hash,
                peer,
            )
        } else {
            req_builder
                .header("Authorization", format!("Bearer {}", peer.secret_key))
                .header("User-Agent", "GravSpace-Federation/0.2.0")
        };
        req.send().await
    } else {
        match storage
            .resolve_raw_object_path(&item.source_bucket, &item.source_key, None)
            .await
        {
            Ok(Some((file_path, file_len, meta))) => {
                let body = reqwest::Body::wrap_stream(open_object_byte_stream(file_path));
                let req_builder = client
                    .put(&target_url)
                    .header("Content-Type", meta.content_type)
                    .header("Content-Length", file_len.to_string())
                    .header("x-gravspace-replicated", "1")
                    .body(body);
                let req = if use_sigv4 {
                    sign_s3_request(
                        req_builder,
                        "PUT",
                        &base_ep,
                        &item.target_bucket,
                        &encoded_key,
                        "",
                        "UNSIGNED-PAYLOAD",
                        peer,
                    )
                } else {
                    req_builder
                        .header("Authorization", format!("Bearer {}", peer.secret_key))
                        .header("User-Agent", "GravSpace-Federation/0.2.0")
                };
                req.send().await
            }
            Ok(None) => {
                let (data, meta, _) = match storage
                    .get_object(&item.source_bucket, &item.source_key, None, None)
                    .await
                {
                    Ok(res) => res,
                    Err(e) => {
                        return TransferOutcome::TransientError(format!("Local object read error: {e}"));
                    }
                };

                let payload_hash = if use_sigv4 {
                    sha256_hex(&data)
                } else {
                    String::new()
                };
                let req_builder = client
                    .put(&target_url)
                    .header("Content-Type", meta.content_type)
                    .header("x-gravspace-replicated", "1")
                    .body(data);
                let req = if use_sigv4 {
                    sign_s3_request(
                        req_builder,
                        "PUT",
                        &base_ep,
                        &item.target_bucket,
                        &encoded_key,
                        "",
                        &payload_hash,
                        peer,
                    )
                } else {
                    req_builder
                        .header("Authorization", format!("Bearer {}", peer.secret_key))
                        .header("User-Agent", "GravSpace-Federation/0.2.0")
                };
                req.send().await
            }
            Err(e) => {
                return TransferOutcome::TransientError(format!("Local object read error: {e}"));
            }
        }
    };

    match sync_result {
        Ok(resp) if resp.status().is_success() || (item.action == "DELETE" && resp.status() == 404) => {
            TransferOutcome::Success
        }
        Ok(resp) => {
            let status = resp.status();
            let err_body = resp
                .text()
                .await
                .unwrap_or_else(|_| "Unknown HTTP error".to_string());
            let err_msg = format!("HTTP {status}: {err_body}");
            if is_permanent_http_status(status.as_u16()) {
                TransferOutcome::PermanentError(err_msg)
            } else {
                TransferOutcome::TransientError(err_msg)
            }
        }
        Err(e) => TransferOutcome::Unreachable(format!("Network/Connection error: {e}")),
    }
}
