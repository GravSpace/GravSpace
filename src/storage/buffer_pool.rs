use std::ops::{Deref, DerefMut};
use std::sync::{Arc, Mutex};

pub const DEFAULT_CHUNK_SIZE: usize = 64 * 1024; // 64 KB

/// Reusable memory buffer pool to prevent heap allocations during multi-gigabyte streaming
#[derive(Clone)]
pub struct BufferPool {
    inner: Arc<BufferPoolInner>,
}

struct BufferPoolInner {
    chunk_size: usize,
    max_buffers: usize,
    available: Mutex<Vec<Vec<u8>>>,
}

impl BufferPool {
    pub fn new(chunk_size: usize, max_buffers: usize) -> Self {
        Self {
            inner: Arc::new(BufferPoolInner {
                chunk_size,
                max_buffers,
                available: Mutex::new(Vec::with_capacity(max_buffers)),
            }),
        }
    }

    pub fn default_pool() -> Self {
        Self::new(DEFAULT_CHUNK_SIZE, 128)
    }

    pub fn acquire(&self) -> PooledBuffer {
        let mut guard = self.inner.available.lock().unwrap_or_else(|e| e.into_inner());
        let mut buffer = guard.pop().unwrap_or_else(|| Vec::with_capacity(self.inner.chunk_size));
        buffer.clear();
        buffer.resize(self.inner.chunk_size, 0);

        PooledBuffer {
            pool: Some(self.inner.clone()),
            data: buffer,
            valid_len: 0,
        }
    }
}

pub struct PooledBuffer {
    pool: Option<Arc<BufferPoolInner>>,
    data: Vec<u8>,
    valid_len: usize,
}

impl PooledBuffer {
    pub fn set_len(&mut self, len: usize) {
        self.valid_len = len.min(self.data.len());
    }

    pub fn valid_slice(&self) -> &[u8] {
        &self.data[..self.valid_len]
    }

    pub fn raw_slice_mut(&mut self) -> &mut [u8] {
        &mut self.data
    }
}

impl Deref for PooledBuffer {
    type Target = [u8];
    fn deref(&self) -> &Self::Target {
        &self.data[..self.valid_len]
    }
}

impl DerefMut for PooledBuffer {
    fn deref_mut(&mut self) -> &mut Self::Target {
        &mut self.data[..self.valid_len]
    }
}

impl Drop for PooledBuffer {
    fn drop(&mut self) {
        if let Some(ref pool) = self.pool {
            let mut guard = pool.available.lock().unwrap_or_else(|e| e.into_inner());
            if guard.len() < pool.max_buffers {
                let mut recycled = std::mem::take(&mut self.data);
                recycled.clear();
                guard.push(recycled);
            }
        }
    }
}
