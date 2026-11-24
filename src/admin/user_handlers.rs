use crate::db;
use crate::error::AppError;
use crate::storage::FileStorage;
use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde::Deserialize;
use serde_json::json;

pub async fn list_users(State(storage): State<FileStorage>) -> Result<Response, AppError> {
    let conn = storage.db.conn()?;
    let users = db::users::list_users(&conn).await?;
    let mut map = serde_json::Map::new();

    for u in users {
        let keys = db::users::list_access_keys(&conn, &u.username).await?;
        let policies = db::policies::list_user_policies(&conn, &u.username).await?;
        let mut parsed_policies = Vec::new();

        for p in policies {
            let parsed_data: serde_json::Value =
                serde_json::from_str(&p.data).unwrap_or_else(|_| json!({}));
            let statements = parsed_data
                .get("Statement")
                .or_else(|| parsed_data.get("statement"))
                .cloned()
                .unwrap_or(json!([]));

            parsed_policies.push(json!({
                "name": p.name,
                "data": p.data,
                "statement": statements.clone(),
                "Statement": statements,
            }));
        }

        let formatted_keys: Vec<serde_json::Value> = keys
            .into_iter()
            .map(|k| {
                json!({
                    "access_key_id": k.access_key_id,
                    "accessKeyId": k.access_key_id,
                    "secret_access_key": k.secret_access_key,
                    "secretAccessKey": k.secret_access_key,
                    "secretKey": k.secret_access_key,
                    "username": k.username,
                    "created_at": k.created_at,
                    "createdAt": k.created_at,
                })
            })
            .collect();

        let val = json!({
            "username": u.username,
            "created_at": u.created_at,
            "createdAt": u.created_at,
            "access_keys": formatted_keys.clone(),
            "accessKeys": formatted_keys,
            "policies": parsed_policies,
        });
        map.insert(u.username, val);
    }

    if !map.contains_key("anonymous") {
        let anon_policies = db::policies::list_user_policies(&conn, "anonymous")
            .await
            .unwrap_or_default();
        let parsed_anon_policies: Vec<serde_json::Value> = anon_policies
            .into_iter()
            .map(|p| {
                let parsed: serde_json::Value =
                    serde_json::from_str(&p.data).unwrap_or_else(|_| json!({}));
                let statements = parsed
                    .get("Statement")
                    .or_else(|| parsed.get("statement"))
                    .cloned()
                    .unwrap_or(json!([]));
                json!({
                    "name": p.name,
                    "data": p.data,
                    "statement": statements.clone(),
                    "Statement": statements,
                })
            })
            .collect();
        map.insert(
            "anonymous".to_string(),
            json!({
                "username": "anonymous",
                "created_at": 0,
                "createdAt": 0,
                "access_keys": [],
                "accessKeys": [],
                "policies": parsed_anon_policies,
            }),
        );
    }

    Ok((StatusCode::OK, Json(serde_json::Value::Object(map))).into_response())
}

#[derive(Deserialize)]
pub struct CreateUserPayload {
    pub username: String,
    pub password: Option<String>,
}

pub async fn create_user(
    State(storage): State<FileStorage>,
    Json(payload): Json<CreateUserPayload>,
) -> Result<Response, AppError> {
    let conn = storage.db.conn()?;
    let hash = if let Some(pass) = payload.password {
        bcrypt::hash(pass, bcrypt::DEFAULT_COST).unwrap_or_default()
    } else {
        String::new()
    };

    db::users::upsert_user(&conn, &payload.username, &hash).await?;
    Ok((StatusCode::OK, Json(json!({ "success": true }))).into_response())
}

pub async fn delete_user(
    State(storage): State<FileStorage>,
    Path(username): Path<String>,
) -> Result<Response, AppError> {
    let conn = storage.db.conn()?;
    db::users::delete_user(&conn, &username).await?;
    Ok((StatusCode::OK, Json(json!({ "success": true }))).into_response())
}

#[derive(Deserialize)]
pub struct UpdatePasswordPayload {
    pub password: String,
}

pub async fn update_password(
    State(storage): State<FileStorage>,
    Path(username): Path<String>,
    Json(payload): Json<UpdatePasswordPayload>,
) -> Result<Response, AppError> {
    let conn = storage.db.conn()?;
    let hash = bcrypt::hash(payload.password, bcrypt::DEFAULT_COST).unwrap_or_default();
    db::users::upsert_user(&conn, &username, &hash).await?;
    Ok((StatusCode::OK, Json(json!({ "success": true }))).into_response())
}

pub async fn generate_key(
    State(storage): State<FileStorage>,
    Path(username): Path<String>,
) -> Result<Response, AppError> {
    let conn = storage.db.conn()?;
    let key_id = uuid::Uuid::new_v4().to_string().replace('-', "")[..20].to_uppercase();
    let secret = uuid::Uuid::new_v4().to_string().replace('-', "")
        + &uuid::Uuid::new_v4().to_string().replace('-', "")[..8];

    db::users::create_access_key(&conn, &username, &key_id, &secret).await?;
    Ok((
        StatusCode::OK,
        Json(json!({
            "accessKeyId": key_id,
            "access_key_id": key_id,
            "secretAccessKey": secret,
            "secret_access_key": secret,
            "username": username
        })),
    )
        .into_response())
}

pub async fn delete_key(
    State(storage): State<FileStorage>,
    Path((_username, id)): Path<(String, String)>,
) -> Result<Response, AppError> {
    let conn = storage.db.conn()?;
    db::users::delete_access_key(&conn, &id).await?;
    Ok((StatusCode::OK, Json(json!({ "success": true }))).into_response())
}

#[derive(Deserialize)]
pub struct AddPolicyPayload {
    pub name: String,
    #[serde(default)]
    pub policy: Option<serde_json::Value>,
    #[serde(default)]
    pub version: Option<String>,
    #[serde(default)]
    pub statement: Option<serde_json::Value>,
    #[serde(rename = "Statement", default)]
    pub statement_upper: Option<serde_json::Value>,
}

pub async fn add_policy(
    State(storage): State<FileStorage>,
    Path(username): Path<String>,
    Json(payload): Json<AddPolicyPayload>,
) -> Result<Response, AppError> {
    let conn = storage.db.conn()?;
    if username == "anonymous" {
        let _ = db::users::upsert_user(&conn, "anonymous", "").await;
    }
    let policy_doc = if let Some(p) = payload.policy {
        p
    } else {
        let stmts = payload.statement.or(payload.statement_upper).unwrap_or(json!([]));
        let ver = payload.version.unwrap_or_else(|| "2012-10-17".to_string());
        json!({
            "Version": ver,
            "Statement": stmts,
        })
    };
    let policy_str = serde_json::to_string(&policy_doc).unwrap_or_default();
    db::policies::upsert_user_policy(&conn, &username, &payload.name, &policy_str).await?;
    Ok((StatusCode::CREATED, Json(json!({ "success": true }))).into_response())
}

#[derive(Deserialize)]
pub struct AttachPolicyPayload {
    pub policy_name: String,
}

pub async fn attach_policy(
    State(storage): State<FileStorage>,
    Path(username): Path<String>,
    Json(payload): Json<AttachPolicyPayload>,
) -> Result<Response, AppError> {
    let conn = storage.db.conn()?;
    let global_policies = db::policies::list_global_policies(&conn).await?;
    if let Some(gp) = global_policies.into_iter().find(|p| p.name == payload.policy_name) {
        db::policies::upsert_user_policy(&conn, &username, &payload.policy_name, &gp.data).await?;
    }
    Ok((StatusCode::OK, Json(json!({ "success": true }))).into_response())
}

pub async fn remove_policy(
    State(storage): State<FileStorage>,
    Path((username, name)): Path<(String, String)>,
) -> Result<Response, AppError> {
    let conn = storage.db.conn()?;
    db::policies::delete_user_policy(&conn, &username, &name).await?;
    Ok((StatusCode::OK, Json(json!({ "success": true }))).into_response())
}
