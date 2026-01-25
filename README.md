# GravSpace

High Performance S3 Compatible Object Storage focused on speed and simplicity.

## Features
- **S3 Compatibility**: Support for S3 API (Buckets, Objects, and **Versioning**).
- **IAM Policy Management**: Fine-grained access control with JSON policies.
- **Anonymous/Public Access**: One-click public buckets and folders.
- **Presigned URLs**: Authentication via query-string parameters.
- **High Performance**: Go-powered core with Nuxt 4 dashboard.
- **MIME Type Detection**: Direct in-browser display for images and documents.

## Table of Contents
- [Getting Started](#getting-started)
- [Docker Deployment](#docker-deployment)
- [Environment Variables](#environment-variables)
- [S3 CLI Usage](#s3-cli-usage)
- [Production Deployment](#production-deployment)

## Getting Started

### Development Mode

#### Backend
1. Ensure you have Go installed (compatible with 1.24+).
2. Run the server:
   ```bash
   ./storage-server
   ```
   The server will start on `:8080`.

#### Frontend
1. Ensure you have Node.js installed (v20+).
2. Navigate to the `frontend` directory.
3. Install dependencies and run in dev mode:
   ```bash
   npm install
   npm run dev
   ```

## Docker Deployment

### Option 1: Using Pre-built Images (Recommended)

The easiest way to deploy GravSpace is using pre-built images from GitHub Container Registry:

1. **Create environment file**:
   ```bash
   cp .env.example .env
   ```

2. **Edit `.env` file** with your configuration (see [Environment Variables](#environment-variables)).

3. **Deploy using pre-built images**:
   ```bash
   docker-compose -f docker-compose.ghcr.yml up -d
   ```

4. **Access the application**:
   - Frontend Dashboard: `http://localhost:3000`
   - Backend API: `http://localhost:8080`

> [!NOTE]
> Pre-built images are automatically built and published to `ghcr.io/gravspace/gravspace-backend` and `ghcr.io/gravspace/gravspace-frontend` on every release. See [.github/DOCKER_REGISTRY.md](.github/DOCKER_REGISTRY.md) for more details.

### Option 2: Build from Source

If you want to build the images yourself:

1. **Clone the repository**:
   ```bash
   git clone <repository-url>
   cd storage-object
   ```

2. **Create environment file**:
   ```bash
   cp .env.example .env
   ```

3. **Edit `.env` file** with your configuration (see [Environment Variables](#environment-variables)).

4. **Start the services**:
   ```bash
   docker-compose up -d
   ```

5. **Access the application**:
   - Frontend Dashboard: `http://localhost:3000`
   - Backend API: `http://localhost:8080`
   - Health Check: `http://localhost:8080/health/live`
   - Metrics: `http://localhost:8080/metrics`

6. **View logs**:
   ```bash
   # All services
   docker-compose logs -f
   
   # Backend only
   docker-compose logs -f backend
   
   # Frontend only
   docker-compose logs -f frontend
   ```

7. **Stop the services**:
   ```bash
   docker-compose down
   ```

8. **Stop and remove volumes** (⚠️ This will delete all data):
   ```bash
   docker-compose down -v
   ```

### Building Individual Images

#### Backend
```bash
docker build -t gravspace-core:latest .
docker run -p 8080:8080 \
  -e JWT_SECRET=your-secret-key \
  -e CORS_ORIGINS=http://localhost:3000 \
  -v $(pwd)/data:/app/data \
  gravspace-core:latest
```

#### Frontend
```bash
cd frontend
docker build -t gravspace-frontend:latest .
docker run -p 3000:3000 \
  -e NUXT_PUBLIC_API_BASE=http://localhost:8080 \
  gravspace-frontend:latest
```

## Environment Variables

### Backend Configuration

#### Required Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `JWT_SECRET` | Secret key for JWT token signing | `secret` | ⚠️ **Yes (Production)** |

#### Network Configuration

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `CORS_ORIGINS` | Comma-separated list of allowed CORS origins | `*` | No |
| `BACKEND_PORT` | Port for backend service (Docker Compose only) | `8080` | No |

#### Database Configuration

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `DATABASE_URL` | Database connection URL (supports SQLite and Turso) | Local SQLite | No |
| `TURSO_DATABASE_URL` | Alternative Turso database URL | - | No |
| `DATABASE_AUTH_TOKEN` | Database authentication token (for Turso) | - | No (Yes for Turso) |
| `TURSO_AUTH_TOKEN` | Alternative Turso auth token | - | No (Yes for Turso) |

**Database URL Formats**:
- Local SQLite: `file:./db/metadata.db`
- Turso: `libsql://[your-database].turso.io`
- Remote: `https://[your-database].turso.io`

#### Encryption Configuration

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `SSE_MASTER_KEY` | Master key for Server-Side Encryption (SSE-S3) | - | No |

#### Worker Configuration

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `SYNC_WORKER_INTERVAL` | Interval for sync worker (duration format) | `5m` | No |
| `LIFECYCLE_WORKER_INTERVAL` | Interval for lifecycle worker (duration format) | `1h` | No |

**Duration Format Examples**: `30s`, `5m`, `1h`, `24h`

#### Complete Backend Example

```bash
# Required
JWT_SECRET=super-secret-key-change-in-production

# Network
CORS_ORIGINS=http://localhost:3000,https://yourdomain.com
BACKEND_PORT=8080

# Database (Optional - for Turso)
DATABASE_URL=libsql://my-database.turso.io
DATABASE_AUTH_TOKEN=your-turso-auth-token

# Encryption (Optional)
SSE_MASTER_KEY=your-encryption-master-key

# Workers (Optional)
SYNC_WORKER_INTERVAL=10m
LIFECYCLE_WORKER_INTERVAL=2h
```

### Frontend Configuration

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `NUXT_PUBLIC_API_BASE` | Backend API base URL | `http://localhost:8080` | Yes |
| `FRONTEND_PORT` | Port for frontend service (Docker Compose only) | `3000` | No |
| `NODE_ENV` | Node environment | `production` | No |

**Example**:
```bash
NUXT_PUBLIC_API_BASE=http://localhost:8080
FRONTEND_PORT=3000
NODE_ENV=production
```

### Security Recommendations

> [!WARNING]
> **Never use default values in production!**

1. **JWT_SECRET**: Generate a strong random secret:
   ```bash
   openssl rand -base64 32
   ```

2. **CORS_ORIGINS**: Specify exact domains instead of `*`:
   ```bash
   CORS_ORIGINS=https://app.yourdomain.com,https://admin.yourdomain.com
   ```

3. **Use HTTPS** in production with a reverse proxy (nginx, Traefik, Caddy).

## S3 CLI Usage

You can use `aws-cli` with GravSpace:

```bash
# Configure AWS CLI
aws configure set aws_access_key_id <your-access-key>
aws configure set aws_secret_access_key <your-secret-key>

# List buckets
aws --endpoint-url http://localhost:8080 s3 ls

# Create bucket
aws --endpoint-url http://localhost:8080 s3 mb s3://my-bucket

# Upload file
aws --endpoint-url http://localhost:8080 s3 cp file.txt s3://my-bucket/

# List objects
aws --endpoint-url http://localhost:8080 s3 ls s3://my-bucket/

# Download file
aws --endpoint-url http://localhost:8080 s3 cp s3://my-bucket/file.txt ./downloaded.txt
```

## Production Deployment

### Using Docker Compose with Reverse Proxy

1. **Set up environment variables** in `.env`:
   ```bash
   JWT_SECRET=$(openssl rand -base64 32)
   CORS_ORIGINS=https://yourdomain.com
   NUXT_PUBLIC_API_BASE=https://api.yourdomain.com
   ```

2. **Update `docker-compose.yml`** to use production settings.

3. **Set up reverse proxy** (nginx example):
   ```nginx
   # Frontend
   server {
       listen 443 ssl http2;
       server_name yourdomain.com;
       
       ssl_certificate /path/to/cert.pem;
       ssl_certificate_key /path/to/key.pem;
       
       location / {
           proxy_pass http://localhost:3000;
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
       }
   }
   
   # Backend API
   server {
       listen 443 ssl http2;
       server_name api.yourdomain.com;
       
       ssl_certificate /path/to/cert.pem;
       ssl_certificate_key /path/to/key.pem;
       
       location / {
           proxy_pass http://localhost:8080;
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           client_max_body_size 100M;
       }
   }
   ```

4. **Start services**:
   ```bash
   docker-compose up -d
   ```

### Data Persistence

Data is stored in a Docker volume named `storage_data`. To backup:

```bash
# Create backup
docker run --rm -v storage-object_storage_data:/data -v $(pwd):/backup alpine tar czf /backup/backup.tar.gz -C /data .

# Restore backup
docker run --rm -v storage-object_storage_data:/data -v $(pwd):/backup alpine tar xzf /backup/backup.tar.gz -C /data
```

### Monitoring

- **Health Checks**: `http://localhost:8080/health/live`, `/health/ready`, `/health/startup`
- **Metrics**: `http://localhost:8080/metrics` (Prometheus format)

### Scaling

To scale the backend service:
```bash
docker-compose up -d --scale backend=3
```

> [!NOTE]
> You'll need a load balancer (nginx, HAProxy) to distribute traffic across multiple backend instances.

## License
MIT
