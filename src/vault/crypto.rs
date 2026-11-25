use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use sha2::{Digest, Sha256};
use crate::error::AppError;

pub fn get_master_key() -> [u8; 32] {
    let key_src = std::env::var("VAULT_MASTER_KEY")
        .or_else(|_| std::env::var("JWT_SECRET"))
        .unwrap_or_else(|_| "gravspace-default-vault-master-key-seed-32bytes".to_string());

    let mut hasher = Sha256::new();
    hasher.update(key_src.as_bytes());
    hasher.finalize().into()
}

pub fn generate_nonce() -> [u8; 12] {
    let u1 = uuid::Uuid::new_v4();
    let u2 = uuid::Uuid::new_v4();
    let mut nonce = [0u8; 12];
    nonce[0..6].copy_from_slice(&u1.as_bytes()[0..6]);
    nonce[6..12].copy_from_slice(&u2.as_bytes()[0..6]);
    nonce
}

pub fn encrypt_secret(plaintext: &[u8]) -> Result<String, AppError> {
    let key = get_master_key();
    let cipher = Aes256Gcm::new_from_slice(&key)
        .map_err(|e| AppError::Internal(format!("Failed to initialize AES-GCM cipher: {e}")))?;

    let raw_nonce = generate_nonce();
    let nonce = Nonce::from_slice(&raw_nonce);

    let ciphertext = cipher
        .encrypt(nonce, plaintext)
        .map_err(|e| AppError::Internal(format!("Encryption failed: {e}")))?;

    let nonce_hex = hex::encode(raw_nonce);
    let cipher_hex = hex::encode(ciphertext);
    Ok(format!("v1:{}:{}", nonce_hex, cipher_hex))
}

pub fn decrypt_secret(payload: &str) -> Result<Vec<u8>, AppError> {
    let parts: Vec<&str> = payload.split(':').collect();
    if parts.len() != 3 || parts[0] != "v1" {
        return Err(AppError::BadRequest("Invalid encrypted payload format".to_string()));
    }

    let raw_nonce = hex::decode(parts[1])
        .map_err(|_| AppError::BadRequest("Invalid nonce encoding".to_string()))?;
    let ciphertext = hex::decode(parts[2])
        .map_err(|_| AppError::BadRequest("Invalid ciphertext encoding".to_string()))?;

    if raw_nonce.len() != 12 {
        return Err(AppError::BadRequest("Invalid nonce length".to_string()));
    }

    let key = get_master_key();
    let cipher = Aes256Gcm::new_from_slice(&key)
        .map_err(|e| AppError::Internal(format!("Failed to initialize AES-GCM cipher: {e}")))?;

    let nonce = Nonce::from_slice(&raw_nonce);
    let decrypted = cipher
        .decrypt(nonce, ciphertext.as_ref())
        .map_err(|_| AppError::Unauthorized("AEAD integrity check failed".to_string()))?;

    Ok(decrypted)
}

#[cfg(test)]
pub mod tests {
    use super::*;

    #[test]
    fn test_encrypt_decrypt_roundtrip() {
        let secret = b"postgres://admin:secret123@db.internal:5432/prod";
        let encrypted = encrypt_secret(secret).expect("encrypt should succeed");
        assert!(encrypted.starts_with("v1:"));

        let decrypted = decrypt_secret(&encrypted).expect("decrypt should succeed");
        assert_eq!(decrypted, secret);
    }

    #[test]
    fn test_tampered_ciphertext_fails() {
        let secret = b"my-super-secret-key";
        let encrypted = encrypt_secret(secret).expect("encrypt should succeed");
        let parts: Vec<&str> = encrypted.split(':').collect();

        // Tamper with ciphertext by altering last byte
        let mut tampered = parts[2].to_string();
        if tampered.ends_with('0') {
            tampered.replace_range(tampered.len() - 1.., "1");
        } else {
            tampered.replace_range(tampered.len() - 1.., "0");
        }

        let bad_payload = format!("v1:{}:{}", parts[1], tampered);
        let res = decrypt_secret(&bad_payload);
        assert!(res.is_err());
    }
}
