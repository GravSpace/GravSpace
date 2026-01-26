package crypto

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"fmt"
	"io"
	"os"
	"sync"
)

var masterKey []byte

const (
	ChunkSize = 64 * 1024 // 64KB chunks
)

var (
	chunkPool = sync.Pool{
		New: func() interface{} {
			return make([]byte, ChunkSize)
		},
	}
	cipherPool = sync.Pool{
		New: func() interface{} {
			// ChunkSize + GCM overhead
			return make([]byte, ChunkSize+16)
		},
	}
)

func init() {
	key := os.Getenv("SSE_MASTER_KEY")
	if key == "" {
		key = "this-is-a-very-secret-key-32byte"
	}
	masterKey = []byte(key)
}

// EncryptStream wraps a writer with chunked AES-GCM encryption.
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

	// Write base nonce first
	if _, err := writer.Write(nonce); err != nil {
		return nil, err
	}

	return &encryptWriter{
		writer: writer,
		gcm:    gcm,
		nonce:  nonce,
		chunk:  chunkPool.Get().([]byte)[:0],
	}, nil
}

type encryptWriter struct {
	writer io.Writer
	gcm    cipher.AEAD
	nonce  []byte
	chunk  []byte
	seq    uint32
}

func (w *encryptWriter) Write(p []byte) (n int, err error) {
	total := len(p)
	for len(p) > 0 {
		space := ChunkSize - len(w.chunk)
		if space > len(p) {
			w.chunk = append(w.chunk, p...)
			p = nil
		} else {
			w.chunk = append(w.chunk, p[:space]...)
			p = p[space:]
			if err := w.flushChunk(); err != nil {
				return 0, err
			}
		}
	}
	return total, nil
}

func (w *encryptWriter) flushChunk() error {
	if len(w.chunk) == 0 {
		return nil
	}

	// Derive nonce for this chunk
	chunkNonce := make([]byte, len(w.nonce))
	copy(chunkNonce, w.nonce)
	for i := 0; i < 4; i++ {
		chunkNonce[i] ^= byte(w.seq >> (i * 8))
	}

	ciphertext := w.gcm.Seal(nil, chunkNonce, w.chunk, nil)
	if _, err := w.writer.Write(ciphertext); err != nil {
		return err
	}

	w.chunk = w.chunk[:0]
	w.seq++
	return nil
}

func (w *encryptWriter) Close() error {
	if err := w.flushChunk(); err != nil {
		return err
	}
	chunkPool.Put(w.chunk[:ChunkSize])
	if closer, ok := w.writer.(io.Closer); ok {
		return closer.Close()
	}
	return nil
}

// DecryptStream wraps a reader with chunked AES-GCM decryption.
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

	return &decryptReader{
		reader: reader,
		gcm:    gcm,
		nonce:  nonce,
		cached: chunkPool.Get().([]byte)[:0],
	}, nil
}

type decryptReader struct {
	reader io.Reader
	gcm    cipher.AEAD
	nonce  []byte
	cached []byte
	pos    int
	seq    uint32
	eof    bool
}

func (r *decryptReader) Read(p []byte) (n int, err error) {
	if r.pos >= len(r.cached) {
		if r.eof {
			return 0, io.EOF
		}
		if err := r.nextChunk(); err != nil {
			return 0, err
		}
	}

	n = copy(p, r.cached[r.pos:])
	r.pos += n
	return n, nil
}

func (r *decryptReader) nextChunk() error {
	cipherSize := ChunkSize + r.gcm.Overhead()
	cipherBuf := cipherPool.Get().([]byte)
	defer cipherPool.Put(cipherBuf)

	n, err := io.ReadFull(r.reader, cipherBuf[:cipherSize])
	if err != nil && err != io.ErrUnexpectedEOF && err != io.EOF {
		return err
	}
	if n == 0 {
		r.eof = true
		return io.EOF
	}

	// Derive nonce
	chunkNonce := make([]byte, len(r.nonce))
	copy(chunkNonce, r.nonce)
	for i := 0; i < 4; i++ {
		chunkNonce[i] ^= byte(r.seq >> (i * 8))
	}

	r.cached = r.cached[:0]
	plaintext, err := r.gcm.Open(r.cached, chunkNonce, cipherBuf[:n], nil)
	if err != nil {
		return fmt.Errorf("decryption failed at chunk %d: %w", r.seq, err)
	}

	r.cached = plaintext
	r.pos = 0
	r.seq++
	if n < cipherSize {
		r.eof = true
	}
	return nil
}

func (r *decryptReader) Close() error {
	chunkPool.Put(r.cached[:ChunkSize])
	if closer, ok := r.reader.(io.Closer); ok {
		return closer.Close()
	}
	return nil
}

func GetMasterKey() []byte {
	return masterKey
}
