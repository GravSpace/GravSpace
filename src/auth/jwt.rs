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

    let key = EncodingKey::from_secret(secret.as_bytes())
        .map_err(|e| AppError::Internal(format!("Failed to init encoding key: {e}")))?;
    encode(&Header::default(), &claims, &key)
        .map_err(|e| AppError::Internal(format!("Failed to sign JWT: {e}")))
}

pub fn verify_jwt(token: &str, secret: &str) -> Result<String, AppError> {
    let key = DecodingKey::from_secret(secret.as_bytes())
        .map_err(|_| AuthError::TokenInvalid)?;
    let token_data = decode::<Claims>(
        token,
        &key,
        &Validation::default(),
    )
    .map_err(|_| AuthError::TokenInvalid)?;

    Ok(token_data.claims.username)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_create_and_verify_jwt() {
        let token = create_jwt("admin", "secret").expect("Failed to create jwt");
        let username = verify_jwt(&token, "secret").expect("Failed to verify jwt");
        assert_eq!(username, "admin");
    }
}
