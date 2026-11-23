use axum::{
    extract::State,
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde_json::json;
use std::net::UdpSocket;
use crate::error::AppError;
use crate::storage::FileStorage;

/// Detects the local non-loopback network IP of the server.
/// Uses an OS kernel routing query via UDP socket (zero packets sent, zero network overhead).
pub fn detect_local_ip() -> Option<String> {
    let socket = UdpSocket::bind("0.0.0.0:0").ok()?;
    socket
        .connect("10.255.255.255:80")
        .or_else(|_| socket.connect("192.168.255.255:80"))
        .or_else(|_| socket.connect("8.8.8.8:80"))
        .ok()?;
    let addr = socket.local_addr().ok()?;
    let ip = addr.ip();
    if !ip.is_loopback() {
        Some(ip.to_string())
    } else {
        None
    }
}

fn get_hostname() -> String {
    if let Ok(h) = std::env::var("HOSTNAME") {
        let trimmed = h.trim();
        if !trimmed.is_empty() {
            return trimmed.to_string();
        }
    }
    if let Ok(h) = std::fs::read_to_string("/etc/hostname") {
        let trimmed = h.trim();
        if !trimmed.is_empty() {
            return trimmed.to_string();
        }
    }
    "gravspace-node".to_string()
}

pub async fn get_network_info(
    State(storage): State<FileStorage>,
) -> Result<Response, AppError> {
    let hostname = get_hostname();
    let admin_port: u16 = storage.config.admin_port.parse().unwrap_or(8080);
    let s3_port: u16 = storage.config.s3_port.parse().unwrap_or(9000);

    let configured_host = if !storage.config.server_host.trim().is_empty() {
        storage.config.server_host.trim().to_string()
    } else {
        String::new()
    };

    let local_ip = detect_local_ip().unwrap_or_else(|| "127.0.0.1".to_string());
    let primary_host = if !configured_host.is_empty() {
        configured_host.clone()
    } else {
        local_ip.clone()
    };

    let admin_endpoint = format!("http://{}:{}", primary_host, admin_port);
    let s3_endpoint = format!("http://{}:{}", primary_host, s3_port);

    Ok((
        StatusCode::OK,
        Json(json!({
            "hostname": hostname,
            "local_ip": local_ip,
            "configured_host": configured_host,
            "primary_host": primary_host,
            "admin_port": admin_port,
            "s3_port": s3_port,
            "admin_endpoint": admin_endpoint,
            "s3_endpoint": s3_endpoint,
            "s3_proxy_path": "/s3",
        })),
    )
        .into_response())
}
