use crate::error::AppError;
use std::net::IpAddr;

/// Validates an outbound HTTP/HTTPS endpoint URL to block metadata services,
/// invalid schemes, unspecified addresses, and internal DB/cache ports while allowing LAN peers.
pub(crate) fn validate_outbound_url(raw: &str, label: &str) -> Result<String, AppError> {
    let cleaned = raw.trim().trim_end_matches('/');
    if cleaned.is_empty() {
        return Err(AppError::BadRequest(format!("{label} is required")));
    }

    let parsed = reqwest::Url::parse(cleaned)
        .map_err(|e| AppError::BadRequest(format!("Invalid {label}: {e}")))?;

    let scheme = parsed.scheme();
    if scheme != "http" && scheme != "https" {
        return Err(AppError::BadRequest(
            "Only HTTP and HTTPS endpoints are permitted".to_string(),
        ));
    }

    let host_str = parsed
        .host_str()
        .ok_or_else(|| AppError::BadRequest(format!("Invalid {label}: missing host")))?;

    if let Ok(ip) = host_str.trim_matches(|c| c == '[' || c == ']').parse::<IpAddr>() {
        match ip {
            IpAddr::V4(v4) => {
                if v4.is_link_local() || v4.is_unspecified() {
                    return Err(AppError::BadRequest(
                        "Access to link-local metadata or unspecified IP is blocked".to_string(),
                    ));
                }
                if v4.is_loopback() && matches!(parsed.port(), Some(8085 | 6379)) {
                    return Err(AppError::BadRequest(
                        "Access to internal database/cache port is blocked".to_string(),
                    ));
                }
            }
            IpAddr::V6(v6) => {
                let seg0 = v6.segments()[0];
                if v6.is_unspecified() || (seg0 & 0xffc0) == 0xfe80 {
                    return Err(AppError::BadRequest(
                        "Access to link-local metadata or unspecified IP is blocked".to_string(),
                    ));
                }
                if v6.is_loopback() && matches!(parsed.port(), Some(8085 | 6379)) {
                    return Err(AppError::BadRequest(
                        "Access to internal database/cache port is blocked".to_string(),
                    ));
                }
            }
        }
    } else if host_str.eq_ignore_ascii_case("localhost")
        && matches!(parsed.port(), Some(8085 | 6379))
    {
        return Err(AppError::BadRequest(
            "Access to internal database/cache port is blocked".to_string(),
        ));
    }

    Ok(cleaned.to_string())
}

#[cfg(test)]
mod tests {
    use super::validate_outbound_url;

    #[test]
    fn blocks_metadata_non_http_and_internal_ports() {
        assert!(validate_outbound_url("http://169.254.169.254/latest/meta-data", "Webhook").is_err());
        assert!(validate_outbound_url("http://0.0.0.0:8080/hook", "Webhook").is_err());
        assert!(validate_outbound_url("file:///etc/passwd", "Webhook").is_err());
        assert!(validate_outbound_url("http://127.0.0.1:6379", "Peer").is_err());
        assert!(validate_outbound_url("http://localhost:8085", "Peer").is_err());
    }

    #[test]
    fn allows_lan_and_public_http_https() {
        assert_eq!(
            validate_outbound_url("http://192.168.1.50:8080/", "Peer").unwrap(),
            "http://192.168.1.50:8080"
        );
        assert!(validate_outbound_url("https://hooks.example.com/s3", "Webhook").is_ok());
    }
}
