use hmac::{Hmac, Mac};
use sha2::{Digest, Sha256};
use std::collections::HashMap;

type HmacSha256 = Hmac<Sha256>;

pub fn uri_encode(input: &str, encode_slash: bool) -> String {
    let mut buf = String::with_capacity(input.len() * 3);
    for b in input.bytes() {
        if b.is_ascii_alphanumeric() || b == b'-' || b == b'_' || b == b'.' || b == b'~' {
            buf.push(b as char);
        } else if b == b'/' && !encode_slash {
            buf.push('/');
        } else {
            buf.push_str(&format!("%{b:02X}"));
        }
    }
    buf
}

pub fn hmac_sha256(key: &[u8], data: &[u8]) -> Vec<u8> {
    let mut mac = HmacSha256::new_from_slice(key).expect("HMAC can take key of any size");
    mac.update(data);
    mac.finalize().into_bytes().to_vec()
}

pub fn sha256_hex(data: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(data);
    hex::encode(hasher.finalize())
}

pub fn calculate_signature(
    secret_key: &str,
    date: &str,
    region: &str,
    service: &str,
    string_to_sign: &str,
) -> String {
    let k_date = hmac_sha256(format!("AWS4{secret_key}").as_bytes(), date.as_bytes());
    let k_region = hmac_sha256(&k_date, region.as_bytes());
    let k_service = hmac_sha256(&k_region, service.as_bytes());
    let k_signing = hmac_sha256(&k_service, b"aws4_request");
    hex::encode(hmac_sha256(&k_signing, string_to_sign.as_bytes()))
}

pub fn build_canonical_request(
    method: &str,
    path: &str,
    query: &HashMap<String, Vec<String>>,
    headers: &HashMap<String, String>,
    signed_headers: &[String],
    payload_hash: &str,
    request_host: &str,
) -> String {
    // 1. Canonical URI
    let mut canonical_uri = if path.is_empty() {
        "/".to_string()
    } else {
        path.to_string()
    };
    if !canonical_uri.starts_with('/') {
        canonical_uri = format!("/{canonical_uri}");
    }
    let has_trailing = canonical_uri.ends_with('/') && canonical_uri.len() > 1;
    let parts: Vec<String> = canonical_uri
        .trim_matches('/')
        .split('/')
        .filter(|p| !p.is_empty())
        .map(|p| uri_encode(p, true))
        .collect();
    let mut canonical_uri = format!("/{}", parts.join("/"));
    if has_trailing {
        canonical_uri.push('/');
    }

    // 2. Canonical Query String
    let mut query_parts = Vec::new();
    for (k, vs) in query {
        if k == "X-Amz-Signature" {
            continue;
        }
        for v in vs {
            query_parts.push(format!("{}={}", uri_encode(k, true), uri_encode(v, true)));
        }
    }
    query_parts.sort();
    let canonical_query = query_parts.join("&");

    // 3. Canonical Headers
    let mut header_parts = Vec::new();
    for h in signed_headers {
        let low_h = h.to_lowercase();
        let val = headers
            .get(&low_h)
            .map(|s| s.trim())
            .unwrap_or(if low_h == "host" { request_host } else { "" });
        header_parts.push(format!("{low_h}:{val}\n"));
    }
    let canonical_headers = header_parts.concat();

    // 4. Signed Headers string
    let signed_headers_str = signed_headers.join(";");

    // 5. Payload Hash
    let hash = if payload_hash.is_empty() {
        "UNSIGNED-PAYLOAD"
    } else {
        payload_hash
    };

    format!(
        "{method}\n{canonical_uri}\n{canonical_query}\n{canonical_headers}\n{signed_headers_str}\n{hash}"
    )
}

pub fn build_string_to_sign(
    algorithm: &str,
    amz_date: &str,
    credential_scope: &str,
    canonical_request: &str,
) -> String {
    let hashed_req = sha256_hex(canonical_request.as_bytes());
    format!("{algorithm}\n{amz_date}\n{credential_scope}\n{hashed_req}")
}

pub fn candidate_hosts(request_host: &str, server_host: &str, cdn_hosts: &[String]) -> Vec<String> {
    let mut hosts = vec![request_host.to_string()];
    if let Some((h, port)) = request_host.split_once(':') {
        if h == "127.0.0.1" {
            hosts.push(format!("localhost:{port}"));
        } else if h == "localhost" {
            hosts.push(format!("127.0.0.1:{port}"));
        }
    }
    if !server_host.is_empty() && !hosts.contains(&server_host.to_string()) {
        hosts.push(server_host.to_string());
    }
    for cdn in cdn_hosts {
        if !cdn.is_empty() && !hosts.contains(cdn) {
            hosts.push(cdn.clone());
        }
    }
    hosts
}

pub fn percent_decode(input: &str) -> String {
    let mut bytes = Vec::with_capacity(input.len());
    let mut chars = input.bytes().peekable();
    while let Some(b) = chars.next() {
        if b == b'%' {
            let h1 = chars.next();
            let h2 = chars.next();
            if let (Some(c1), Some(c2)) = (h1, h2) {
                let hex_str = [c1, c2];
                if let Ok(decoded_byte) = u8::from_str_radix(std::str::from_utf8(&hex_str).unwrap_or(""), 16) {
                    bytes.push(decoded_byte);
                    continue;
                }
                bytes.push(b'%');
                bytes.push(c1);
                bytes.push(c2);
            } else {
                bytes.push(b'%');
                if let Some(c1) = h1 { bytes.push(c1); }
            }
        } else if b == b'+' {
            bytes.push(b' ');
        } else {
            bytes.push(b);
        }
    }
    String::from_utf8_lossy(&bytes).to_string()
}

pub fn format_http_date(ts: &str) -> String {
    if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(ts) {
        return dt.format("%a, %d %b %Y %H:%M:%S GMT").to_string();
    }
    if let Ok(ndt) = chrono::NaiveDateTime::parse_from_str(ts, "%Y-%m-%d %H:%M:%S") {
        let dt = chrono::DateTime::<chrono::Utc>::from_naive_utc_and_offset(ndt, chrono::Utc);
        return dt.format("%a, %d %b %Y %H:%M:%S GMT").to_string();
    }
    chrono::Utc::now().format("%a, %d %b %Y %H:%M:%S GMT").to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_percent_decode() {
        assert_eq!(
            percent_decode("85b76536364bf2aa51ae%2F20261121%2Fus-east-1%2Fs3%2Faws4_request"),
            "85b76536364bf2aa51ae/20261121/us-east-1/s3/aws4_request"
        );
        assert_eq!(percent_decode("hello+world%20test"), "hello world test");
    }

    #[test]
    fn test_format_http_date() {
        let rfc3339 = "2026-11-21T09:42:17Z";
        let out = format_http_date(rfc3339);
        assert_eq!(out, "Sat, 21 Nov 2026 09:42:17 GMT");

        let sqlite = "2026-11-21 09:42:17";
        let out_sqlite = format_http_date(sqlite);
        assert_eq!(out_sqlite, "Sat, 21 Nov 2026 09:42:17 GMT");
    }
}


