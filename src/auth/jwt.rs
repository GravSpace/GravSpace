use crate::error::{AppError, AuthError};
use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct Claims {
    pub username: String,
    pub exp: i64,
}

pub fn create_jwt(username: &str, secret: &str) -> Result<String, AppError> {
    let expiration = chrono::Utc::now()
        .checked_add_signed(chrono::Duration::hours(72))
        .unwrap_or_else(chrono::Utc::now)
        .timestamp();

    let claims = Claims {
        username: username.to_string(),
        exp: expiration,
    };

    encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(secret.as_bytes()),
    )
    .map_err(|e| AppError::Internal(format!("Failed to sign JWT: {e}")))
}

pub fn verify_jwt(token: &str, secret: &str) -> Result<String, AppError> {
    let token_data = decode::<Claims>(
        token,
        &DecodingKey::from_secret(secret.as_bytes()),
        &Validation::default(),
    )
    .map_err(|_| AuthError::TokenInvalid)?;

    Ok(token_data.claims.username)
}
