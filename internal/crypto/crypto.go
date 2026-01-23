package crypto

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"io"
	"os"
)

var masterKey []byte

func init() {
	key := os.Getenv("SSE_MASTER_KEY")
	if key == "" {
		// Use a default key for development if not set
		key = "this-is-a-very-secret-key-32byte"
	}
	masterKey = []byte(key)
}

// EncryptStream wraps a writer with AES-GCM encryption.
// It writes a random nonce first.
func EncryptStream(masterKey []byte, writer io.Writer) (io.WriteCloser, error) {
	block, err := aes.NewCipher(masterKey)
	if err != nil {
		return nil, err
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}

	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return nil, err
	}

	// Write nonce first
	if _, err := writer.Write(nonce); err != nil {
		return nil, err
	}

	return &encryptWriter{
		writer: writer,
		gcm:    gcm,
		nonce:  nonce,
	}, nil
}

type encryptWriter struct {
	writer io.Writer
	gcm    cipher.AEAD
	nonce  []byte
	buf    []byte
}

func (w *encryptWriter) Write(p []byte) (n int, err error) {
	w.buf = append(w.buf, p...)
	return len(p), nil
}

func (w *encryptWriter) Close() error {
	// Encrypt all at once for GCM simplicity (fine for standard object sizes)
	// For very large objects, we'd need a different mode or block-level encryption
	ciphertext := w.gcm.Seal(nil, w.nonce, w.buf, nil)
	_, err := w.writer.Write(ciphertext)
	return err
}

// DecryptStream wraps a reader with AES-GCM decryption.
// It expects the nonce to be the first bytes.
func DecryptStream(masterKey []byte, reader io.Reader) (io.ReadCloser, error) {
	block, err := aes.NewCipher(masterKey)
	if err != nil {
		return nil, err
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}

	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(reader, nonce); err != nil {
		return nil, err
	}

	ciphertext, err := io.ReadAll(reader)
	if err != nil {
		return nil, err
	}

	plaintext, err := gcm.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return nil, err
	}

	return &decryptReader{
		plaintext: plaintext,
		offset:    0,
	}, nil
}

type decryptReader struct {
	plaintext []byte
	offset    int
}

func (r *decryptReader) Read(p []byte) (n int, err error) {
	if r.offset >= len(r.plaintext) {
		return 0, io.EOF
	}
	n = copy(p, r.plaintext[r.offset:])
	r.offset += n
	return n, nil
}

func (r *decryptReader) Close() error {
	return nil
}

func GetMasterKey() []byte {
	return masterKey
}
