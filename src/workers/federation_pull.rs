use crate::auth::signature::{sha256_hex, uri_encode};
use crate::db;
use crate::db::federation::{CrossServerShareRow, RemoteServerRow};
use crate::storage::FileStorage;
use crate::workers::federation_transfer::{encode_s3_key, resolve_target_endpoint, sign_s3_request};
use chrono::DateTime;
use tracing::{debug, warn};

const MAX_LIST_PAGES: usize = 50;

#[derive(Debug, PartialEq, Eq)]
pub(crate) struct RemoteListObject {
    pub key: String,
    pub size: i64,
    pub etag: String,
    pub last_modified: String,
}

#[derive(Debug, PartialEq, Eq)]
pub(crate) struct ParsedListPage {
    pub objects: Vec<RemoteListObject>,
    pub next_continuation_token: Option<String>,
}

pub(crate) fn unescape_xml(raw: &str) -> String {
    raw.replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&apos;", "'")
}

fn extract_tag(block: &str, tag: &str) -> String {
    let open = format!("<{tag}>");
    let close = format!("</{tag}>");
    let Some(start) = block.find(&open) else {
        return String::new();
    };
    let rest = &block[start + open.len()..];
    let Some(end) = rest.find(&close) else {
        return String::new();
    };
    unescape_xml(rest[..end].trim())
}

pub(crate) fn parse_list_objects_v2_xml(xml: &str) -> ParsedListPage {
    let mut objects = Vec::new();
    for chunk in xml.split("<Contents>").skip(1) {
        let Some(end) = chunk.find("</Contents>") else {
            continue;
        };
        let block = &chunk[..end];
        let key = extract_tag(block, "Key");
        if key.is_empty() {
            continue;
        }
        let size = extract_tag(block, "Size").parse::<i64>().unwrap_or(0);
        let etag = extract_tag(block, "ETag");
        let last_modified = extract_tag(block, "LastModified");
        objects.push(RemoteListObject {
            key,
            size,
            etag,
            last_modified,
        });
    }

    let is_truncated = extract_tag(xml, "IsTruncated").eq_ignore_ascii_case("true");
    let next_token = if is_truncated {
        let tok = extract_tag(xml, "NextContinuationToken");
        if tok.is_empty() { None } else { Some(tok) }
    } else {
        None
    };

    ParsedListPage {
        objects,
        next_continuation_token: next_token,
    }
}

pub(crate) fn is_local_newer_or_equal(local: &str, remote: &str) -> bool {
    if remote.trim().is_empty() {
        return false;
    }
    match (
        DateTime::parse_from_rfc3339(local.trim()),
        DateTime::parse_from_rfc3339(remote.trim()),
    ) {
        (Ok(l_dt), Ok(r_dt)) => l_dt.timestamp_millis() >= r_dt.timestamp_millis(),
        _ => local >= remote,
    }
}

fn build_list_v2_canonical_query(prefix: &str, continuation_token: Option<&str>) -> String {
    let mut params: Vec<(&str, String)> = Vec::with_capacity(3);
    if let Some(tok) = continuation_token.filter(|t| !t.is_empty()) {
        params.push(("continuation-token", uri_encode(tok, true)));
    }
    params.push(("list-type", "2".to_string()));
    if !prefix.is_empty() {
        params.push(("prefix", uri_encode(prefix, true)));
    }
    params.sort_by(|a, b| a.0.cmp(b.0));
    params
        .into_iter()
        .map(|(k, v)| format!("{k}={v}"))
        .collect::<Vec<_>>()
        .join("&")
}

fn map_remote_to_local_key(remote_key: &str, share: &CrossServerShareRow) -> Option<String> {
    let t_pfx = share.target_prefix.trim_matches('/');
    let s_pfx = share.source_prefix.trim_matches('/');
    let rel = if t_pfx.is_empty() {
        remote_key.trim_start_matches('/')
    } else {
        remote_key
            .trim_start_matches('/')
            .strip_prefix(&format!("{t_pfx}/"))?
    };

    if s_pfx.is_empty() {
        Some(rel.to_string())
    } else {
        Some(format!("{s_pfx}/{rel}"))
    }
}

/// Performs paginated non-destructive bidirectional pull for an enabled `two_way` share.
pub async fn pull_two_way_share(
    storage: &FileStorage,
    fed_conn: &turso::Connection,
    client: &reqwest::Client,
    share: &CrossServerShareRow,
    peer: &RemoteServerRow,
) -> i64 {
    let (base_ep, use_sigv4) = resolve_target_endpoint(peer);
    if !use_sigv4 {
        return 0;
    }

    let Ok(local_conn) = storage.db.conn() else {
        return 0;
    };
    let prefix_param = share.target_prefix.trim_start_matches('/');
    let empty_hash = sha256_hex(b"");

    let mut pulled = 0_i64;
    let mut token: Option<String> = None;

    for _ in 0..MAX_LIST_PAGES {
        let canonical_query = build_list_v2_canonical_query(prefix_param, token.as_deref());
        let list_url = format!("{base_ep}/{}?{canonical_query}", share.target_bucket);

        let req = sign_s3_request(
            client.get(&list_url),
            "GET",
            &base_ep,
            &share.target_bucket,
            "",
            &canonical_query,
            &empty_hash,
            peer,
        );

        let Ok(resp) = req.send().await else {
            break;
        };
        if !resp.status().is_success() {
            break;
        }
        let Ok(xml) = resp.text().await else {
            break;
        };

        let page = parse_list_objects_v2_xml(&xml);
        for remote_obj in page.objects {
            if remote_obj.key.ends_with('/') {
                continue;
            }
            let Some(local_key) = map_remote_to_local_key(&remote_obj.key, share) else {
                continue;
            };

            let has_pending_outbound =
                db::federation_recovery::has_pending_sync_item(fed_conn, share.id, &local_key, "PUT")
                    .await
                    .unwrap_or(false)
                    || db::federation_recovery::has_pending_sync_item(
                        fed_conn,
                        share.id,
                        &local_key,
                        "DELETE",
                    )
                    .await
                    .unwrap_or(false);
            if has_pending_outbound {
                continue;
            }

            if let Ok(Some(local_obj)) =
                db::objects::get_object(&local_conn, &share.source_bucket, &local_key, "").await
            {
                let same_size = local_obj.size == remote_obj.size;
                let same_etag = !remote_obj.etag.is_empty()
                    && local_obj.etag.as_deref() == Some(remote_obj.etag.as_str());
                let local_newer =
                    is_local_newer_or_equal(&local_obj.modified_at, &remote_obj.last_modified);
                if (same_size && same_etag) || local_newer {
                    continue;
                }
            }

            let encoded_key = encode_s3_key(&remote_obj.key);
            let obj_url = format!("{base_ep}/{}/{}", share.target_bucket, encoded_key);
            let get_req = sign_s3_request(
                client.get(&obj_url),
                "GET",
                &base_ep,
                &share.target_bucket,
                &encoded_key,
                "",
                &empty_hash,
                peer,
            );
            if let Ok(obj_resp) = get_req.send().await {
                if obj_resp.status().is_success() {
                    let stream = obj_resp.bytes_stream();
                    match storage
                        .put_object_stream_with_options(
                            &share.source_bucket,
                            &local_key,
                            stream,
                            None,
                            true,
                        )
                        .await
                    {
                        Ok(_) => {
                            pulled += 1;
                            debug!("Two-way pull synced {}/{}", share.source_bucket, local_key);
                        }
                        Err(e) => {
                            warn!(
                                "Two-way pull write failed for {}/{}: {e}",
                                share.source_bucket, local_key
                            );
                        }
                    }
                }
            }
        }

        if page.next_continuation_token.is_none() {
            break;
        }
        token = page.next_continuation_token;
    }

    pulled
}

/// Runs bidirectional pull across enabled `two_way` shares (optionally scoped to one healthy peer).
pub async fn run_two_way_pull_sync(
    storage: &FileStorage,
    fed_conn: &turso::Connection,
    client: &reqwest::Client,
    peer_id: Option<i64>,
) -> i64 {
    let shares = db::federation::list_shares(fed_conn).await.unwrap_or_default();
    let peers = db::federation::list_remote_servers(fed_conn)
        .await
        .unwrap_or_default();

    let mut total_pulled = 0_i64;
    for share in shares
        .iter()
        .filter(|s| s.enabled && s.sync_mode == "two_way")
        .filter(|s| peer_id.is_none_or(|pid| s.remote_server_id == pid))
    {
        let Some(peer) = peers
            .iter()
            .find(|p| p.id == share.remote_server_id && p.status == "healthy")
        else {
            continue;
        };
        total_pulled += pull_two_way_share(storage, fed_conn, client, share, peer).await;
    }
    total_pulled
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_list_objects_v2_xml_unescapes_entities_and_reads_pagination() {
        let xml = r#"<ListBucketResult><IsTruncated>true</IsTruncated><NextContinuationToken>tok+1/2=</NextContinuationToken><Contents><Key>media/a&amp;b &lt;1&gt;.png</Key><LastModified>2026-11-26T04:00:00Z</LastModified><ETag>&quot;abc123&quot;</ETag><Size>4096</Size></Contents></ListBucketResult>"#;
        let page = parse_list_objects_v2_xml(xml);
        assert_eq!(page.objects.len(), 1);
        assert_eq!(page.objects[0].key, "media/a&b <1>.png");
        assert_eq!(page.objects[0].etag, "\"abc123\"");
        assert_eq!(page.next_continuation_token.as_deref(), Some("tok+1/2="));

        let q = build_list_v2_canonical_query("media/", page.next_continuation_token.as_deref());
        assert!(q.starts_with("continuation-token="));
        assert!(q.contains("&list-type=2&prefix=media%2F"));
    }

    #[test]
    fn is_local_newer_or_equal_handles_different_rfc3339_offsets() {
        assert!(is_local_newer_or_equal(
            "2026-11-26T12:00:00+07:00",
            "2026-11-26T04:30:00Z"
        ));
        assert!(!is_local_newer_or_equal(
            "2026-11-26T10:00:00+07:00",
            "2026-11-26T04:00:00Z"
        ));
    }
}
