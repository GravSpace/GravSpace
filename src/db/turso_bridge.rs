use crate::error::{AppError, DbError};
use axum::response::IntoResponse;
use axum::routing::post;
use axum::Router;

pub async fn start_turso_v2_bridge(target_url: &str) -> Result<String, AppError> {
    let target = format!("{}/v2/pipeline", target_url.trim_end_matches('/'));
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
        .await
        .map_err(|e| DbError::Query(format!("Failed to bind bridge: {e}")))?;
    let local_addr = listener
        .local_addr()
        .map_err(|e| DbError::Query(e.to_string()))?;
    let bridge_url = format!("http://{}", local_addr);

    let client = reqwest::Client::new();
    let client_pipeline = client.clone();
    let target_pipeline = target.clone();
    let client_cursor = client.clone();
    let target_cursor = target.clone();

    let app = Router::new()
        .route(
            "/v3/pipeline",
            post(move |body: axum::body::Bytes| {
                let client = client_pipeline.clone();
                let target = target_pipeline.clone();
                async move { handle_pipeline(client, target, body).await }
            }),
        )
        .route(
            "/v3/cursor",
            post(move |body: axum::body::Bytes| {
                let client = client_cursor.clone();
                let target = target_cursor.clone();
                async move { handle_cursor(client, target, body).await }
            }),
        );

    tokio::spawn(async move {
        let _ = axum::serve(listener, app).await;
    });

    Ok(bridge_url)
}

fn create_synthetic_response(kind: &str) -> serde_json::Value {
    match kind {
        "get_autocommit" => serde_json::json!({
            "type": "ok",
            "response": { "type": "get_autocommit", "is_autocommit": true }
        }),
        "close" => serde_json::json!({
            "type": "ok",
            "response": { "type": "close" }
        }),
        _ => serde_json::json!({
            "type": "ok",
            "response": {
                "type": "describe",
                "result": { "params": [], "cols": [], "is_explain": false, "is_readonly": true }
            }
        }),
    }
}

async fn handle_pipeline(
    client: reqwest::Client,
    target: String,
    body: axum::body::Bytes,
) -> axum::response::Response {
    let parsed: Result<serde_json::Value, _> = serde_json::from_slice(&body);
    let (filtered_body, synthetic_indices, real_count) = if let Ok(mut val) = parsed {
        let mut synth = Vec::new();
        let mut real_count = 0;
        if let Some(reqs) = val.get_mut("requests").and_then(|r| r.as_array_mut()) {
            let mut real_reqs = Vec::new();
            for (idx, req) in reqs.drain(..).enumerate() {
                let r_type = req.get("type").and_then(|t| t.as_str()).unwrap_or("");
                if r_type == "get_autocommit" || r_type == "close" || r_type == "describe" {
                    synth.push((idx, r_type.to_string()));
                } else {
                    real_reqs.push(req);
                }
            }
            real_count = real_reqs.len();
            *reqs = real_reqs;
        }
        (
            serde_json::to_vec(&val).unwrap_or_else(|_| body.to_vec()),
            synth,
            real_count,
        )
    } else {
        (body.to_vec(), Vec::new(), 1)
    };

    // If all requests were synthetic (e.g. only `describe` or `close`), return mock response directly
    if real_count == 0 {
        let mut results = Vec::new();
        for (_, kind) in synthetic_indices {
            results.push(create_synthetic_response(&kind));
        }
        let out = serde_json::json!({
            "baton": null,
            "base_url": null,
            "results": results
        });
        return (
            axum::http::StatusCode::OK,
            [(axum::http::header::CONTENT_TYPE, "application/json")],
            serde_json::to_vec(&out).unwrap_or_default(),
        )
            .into_response();
    }

    match client
        .post(&target)
        .header("Content-Type", "application/json")
        .body(filtered_body)
        .send()
        .await
    {
        Ok(resp) => {
            let status = resp.status();
            let bytes = resp.bytes().await.unwrap_or_default();
            if synthetic_indices.is_empty() || !status.is_success() {
                return (
                    status,
                    [(axum::http::header::CONTENT_TYPE, "application/json")],
                    bytes,
                )
                    .into_response();
            }

            let mut resp_val: serde_json::Value =
                serde_json::from_slice(&bytes).unwrap_or(serde_json::json!({}));
            if let Some(results) = resp_val.get_mut("results").and_then(|r| r.as_array_mut()) {
                for (idx, kind) in synthetic_indices {
                    let item = create_synthetic_response(&kind);
                    let insert_pos = idx.min(results.len());
                    results.insert(insert_pos, item);
                }
            }

            let out_bytes = serde_json::to_vec(&resp_val).unwrap_or_else(|_| bytes.to_vec());
            (
                status,
                [(axum::http::header::CONTENT_TYPE, "application/json")],
                out_bytes,
            )
                .into_response()
        }
        Err(e) => (
            axum::http::StatusCode::BAD_GATEWAY,
            [(axum::http::header::CONTENT_TYPE, "application/json")],
            serde_json::json!({ "error": e.to_string() }).to_string(),
        )
            .into_response(),
    }
}

async fn handle_cursor(
    client: reqwest::Client,
    target: String,
    body: axum::body::Bytes,
) -> axum::response::Response {
    let parsed: Result<serde_json::Value, _> = serde_json::from_slice(&body);
    let batch = match parsed {
        Ok(val) => val.get("batch").cloned(),
        Err(_) => None,
    };

    let batch_val = match batch {
        Some(b) => b,
        None => {
            return (
                axum::http::StatusCode::BAD_REQUEST,
                "Missing batch in cursor request",
            )
                .into_response();
        }
    };

    let v2_req = serde_json::json!({
        "baton": null,
        "requests": [
            {
                "type": "batch",
                "batch": batch_val
            }
        ]
    });

    match client
        .post(&target)
        .header("Content-Type", "application/json")
        .json(&v2_req)
        .send()
        .await
    {
        Ok(resp) => {
            let bytes = resp.bytes().await.unwrap_or_default();
            let resp_json: serde_json::Value =
                serde_json::from_slice(&bytes).unwrap_or(serde_json::json!({}));

            let mut ndjson = String::new();
            // Line 1: Cursor initialization header
            ndjson.push_str("{\"baton\":null,\"base_url\":null}\n");

            // Extract results from batch
            if let Some(first_result) = resp_json
                .get("results")
                .and_then(|r| r.as_array())
                .and_then(|arr| arr.first())
            {
                let empty_vec = Vec::new();
                let result_obj = first_result.get("response").and_then(|r| r.get("result"));
                let step_res = result_obj
                    .and_then(|res| {
                        res.get("step_results")
                            .and_then(|s| s.as_array())
                            .and_then(|arr| arr.first())
                    })
                    .or(result_obj);

                let cols = step_res
                    .and_then(|r| r.get("cols"))
                    .and_then(|c| c.as_array())
                    .unwrap_or(&empty_vec);
                let rows = step_res
                    .and_then(|r| r.get("rows"))
                    .and_then(|rw| rw.as_array())
                    .unwrap_or(&empty_vec);
                let affected = step_res
                    .and_then(|r| r.get("affected_row_count"))
                    .and_then(|a| a.as_u64())
                    .unwrap_or(0);
                let last_id = step_res.and_then(|r| r.get("last_insert_rowid"));

                // Line 2: step_begin
                let begin_obj = serde_json::json!({
                    "type": "step_begin",
                    "step": 0,
                    "cols": cols
                });
                ndjson.push_str(&begin_obj.to_string());
                ndjson.push('\n');

                // Lines 3..N: rows
                for row in rows {
                    let row_obj = serde_json::json!({
                        "type": "row",
                        "row": row
                    });
                    ndjson.push_str(&row_obj.to_string());
                    ndjson.push('\n');
                }

                // Final line: step_end
                let end_obj = serde_json::json!({
                    "type": "step_end",
                    "affected_row_count": affected,
                    "last_insert_rowid": last_id
                });
                ndjson.push_str(&end_obj.to_string());
                ndjson.push('\n');
            } else {
                ndjson.push_str("{\"type\":\"step_begin\",\"step\":0,\"cols\":[]}\n");
                ndjson.push_str(
                    "{\"type\":\"step_end\",\"affected_row_count\":0,\"last_insert_rowid\":null}\n",
                );
            }

            (
                axum::http::StatusCode::OK,
                [(axum::http::header::CONTENT_TYPE, "application/x-ndjson")],
                ndjson,
            )
                .into_response()
        }
        Err(e) => (
            axum::http::StatusCode::BAD_GATEWAY,
            [(axum::http::header::CONTENT_TYPE, "application/json")],
            serde_json::json!({ "error": e.to_string() }).to_string(),
        )
            .into_response(),
    }
}
