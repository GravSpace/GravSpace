use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use std::io::{Read, Write};

pub const CHUNK_SIZE: usize = 64 * 1024;
pub const TAG_SIZE: usize = 16;
pub const NONCE_SIZE: usize = 12;

pub fn derive_chunk_nonce(base_nonce: &[u8; NONCE_SIZE], seq: u32) -> [u8; NONCE_SIZE] {
    let mut nonce = *base_nonce;
    for (i, byte) in nonce.iter_mut().take(4).enumerate() {
        *byte ^= (seq >> (i * 8)) as u8;
    }
    nonce
}

pub fn encrypt_bytes(key: &[u8], plaintext: &[u8]) -> Result<Vec<u8>, String> {
    let cipher = Aes256Gcm::new_from_slice(key).map_err(|e| e.to_string())?;

    let mut base_nonce = [0u8; NONCE_SIZE];
    for byte in &mut base_nonce {
        *byte = rand_byte();
    }

    let mut output = Vec::with_capacity(NONCE_SIZE + plaintext.len() + TAG_SIZE);
    output.extend_from_slice(&base_nonce);

    let mut seq = 0u32;
    for chunk in plaintext.chunks(CHUNK_SIZE) {
        let chunk_nonce = derive_chunk_nonce(&base_nonce, seq);
        let nonce = Nonce::from_slice(&chunk_nonce);
        let ciphertext = cipher
            .encrypt(nonce, chunk)
            .map_err(|e| format!("Encryption error: {e}"))?;
        output.extend_from_slice(&ciphertext);
        seq += 1;
    }

    Ok(output)
}

pub fn decrypt_bytes(key: &[u8], ciphertext: &[u8]) -> Result<Vec<u8>, String> {
    if ciphertext.len() < NONCE_SIZE {
        return Err("Ciphertext too short: missing nonce".to_string());
    }

    let cipher = Aes256Gcm::new_from_slice(key).map_err(|e| e.to_string())?;

    let mut base_nonce = [0u8; NONCE_SIZE];
    base_nonce.copy_from_slice(&ciphertext[..NONCE_SIZE]);

    let data = &ciphertext[NONCE_SIZE..];
    let chunk_full_size = CHUNK_SIZE + TAG_SIZE;
    let mut output = Vec::with_capacity(data.len());

    let mut seq = 0u32;
    for chunk in data.chunks(chunk_full_size) {
        let chunk_nonce = derive_chunk_nonce(&base_nonce, seq);
        let nonce = Nonce::from_slice(&chunk_nonce);
        let plaintext = cipher
            .decrypt(nonce, chunk)
            .map_err(|e| format!("Decryption error at chunk {seq}: {e}"))?;
        output.extend_from_slice(&plaintext);
        seq += 1;
    }

    Ok(output)
}

pub fn encrypt_stream<R: Read, W: Write>(
    key: &[u8],
    mut reader: R,
    mut writer: W,
) -> Result<u64, String> {
    let cipher = Aes256Gcm::new_from_slice(key).map_err(|e| e.to_string())?;

    let mut base_nonce = [0u8; NONCE_SIZE];
    for byte in &mut base_nonce {
        *byte = rand_byte();
    }
    writer
        .write_all(&base_nonce)
        .map_err(|e| e.to_string())?;

    let mut buffer = vec![0u8; CHUNK_SIZE];
    let mut seq = 0u32;
    let mut total_written = NONCE_SIZE as u64;

    loop {
        let bytes_read = reader.read(&mut buffer).map_err(|e| e.to_string())?;
        if bytes_read == 0 {
            break;
        }

        let chunk = &buffer[..bytes_read];
        let chunk_nonce = derive_chunk_nonce(&base_nonce, seq);
        let nonce = Nonce::from_slice(&chunk_nonce);
        let encrypted_chunk = cipher
            .encrypt(nonce, chunk)
            .map_err(|e| format!("Encrypt chunk error: {e}"))?;

        writer
            .write_all(&encrypted_chunk)
            .map_err(|e| e.to_string())?;
        total_written += encrypted_chunk.len() as u64;
        seq += 1;
    }

    Ok(total_written)
}

pub fn decrypt_stream<R: Read, W: Write>(
    key: &[u8],
    mut reader: R,
    mut writer: W,
) -> Result<u64, String> {
    let cipher = Aes256Gcm::new_from_slice(key).map_err(|e| e.to_string())?;

    let mut base_nonce = [0u8; NONCE_SIZE];
    reader
        .read_exact(&mut base_nonce)
        .map_err(|e| format!("Failed to read nonce: {e}"))?;

    let mut buffer = vec![0u8; CHUNK_SIZE + TAG_SIZE];
    let mut seq = 0u32;
    let mut total_written = 0u64;

    loop {
        let bytes_read = reader.read(&mut buffer).map_err(|e| e.to_string())?;
        if bytes_read == 0 {
            break;
        }

        let chunk = &buffer[..bytes_read];
        let chunk_nonce = derive_chunk_nonce(&base_nonce, seq);
        let nonce = Nonce::from_slice(&chunk_nonce);
        let decrypted_chunk = cipher
            .decrypt(nonce, chunk)
            .map_err(|e| format!("Decrypt chunk error at {seq}: {e}"))?;

        writer
            .write_all(&decrypted_chunk)
            .map_err(|e| e.to_string())?;
        total_written += decrypted_chunk.len() as u64;
        seq += 1;
    }

    Ok(total_written)
}

fn rand_byte() -> u8 {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let pid = std::process::id();
    (now as u8) ^ ((pid & 0xFF) as u8)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_encrypt_decrypt_roundtrip() {
        let key = b"this-is-a-very-secret-key-32byte";
        let original = b"Hello, GravSpace encrypted world! This is a test string.";
        let encrypted = encrypt_bytes(key, original).expect("encrypt failed");
        assert_ne!(&encrypted[..], &original[..]);

        let decrypted = decrypt_bytes(key, &encrypted).expect("decrypt failed");
        assert_eq!(&decrypted[..], &original[..]);
    }
}
