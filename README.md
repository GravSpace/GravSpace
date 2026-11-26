# GravSpace

High-performance, S3-compatible Enterprise Object Storage, Cross-Server Federation Mesh, and Zero-Disk Secrets Vault powered by **Rust (Axum + Embedded Multi-DB Turso)** and **React 19 (TanStack Start + Nitro + `@ui-sdk/react`)**.

---

## Core Capabilities

- **S3-Compatible Object Storage (`:9000`)**:
  - Buckets, direct streaming I/O (`PutObject` / streaming `GetObject`), Multipart Upload, Object Versioning, Object Lock (`GOVERNANCE` / `COMPLIANCE`, Legal Hold), Bucket Quota, CORS, Lifecycle rules, and Recycle Bin (soft-delete + restore).
  - Presigned URLs (SigV4 + custom CDN host aliases via `CDN_HOSTS`), one-click Public buckets/folders, Bucket Webhooks (with DLQ), and intra-node Bucket Replication.
  - Optional Server-Side Encryption (SSE-S3 AES-256-GCM) via `SSE_MASTER_KEY`.
  - Embedded **16-shard** metadata architecture (`db/turso.db`) for high-throughput object indexing without an external database daemon.
- **Cross-Server Federation & Resilient Sync Mesh**:
  - Manage remote peer nodes (`endpoint` + `s3_endpoint`), configure **1-Way Outbound** or **2-Way Bidirectional** continuous folder/bucket shares, and reconcile drift automatically.
  - Persistent outbox queue (`db/federation.db`) with exponential retry backoff and real-time WebSocket updates.
  - **Bidirectional Provenance Badges**: Propagates `x-gravspace-*` replication headers on `PUT`/`DELETE`/`HEAD` so both **Source** (`1-Way Outbound`, `Sync: <Peer>`, `2-Way Sync`) and **Target** (`1-Way Inbound`, `Inbound: <Source>`, `2-Way Target`) display live badges at bucket, header, and folder levels.
- **Secrets & Agent Vault + PAM (`db/vault.db`)**:
  - Multi-project & multi-environment vault encrypted with **AES-256-GCM AEAD**.
  - Supports KV secrets, Agent Tokens, **Secret Files** (`.txt`, `.md`, `.json` with live validation/formatter, `.pem`, `.key`, `.pub`, `.env`, `.yaml`, `.toml`, `.conf`, `.asc` up to `2 MiB` + Base64 binary fallback), KeyStores (`.jks`/`.p12` with `.zip` bundle download), and PEM Certificates.
  - Full version history + rollback, `.env`/`JSON`/`CSV` import & export, per-file download API (`/api/admin/vault/secrets/{id}/download`), and **Just-In-Time PAM Four-Eyes Approval**.
- **Security, IAM & Observability**:
  - HttpOnly Cookie JWT session auth + CSRF `Origin` validation, IAM users, access keys, JSON policy editor, and an interactive **S3 API Explorer & SDK Tester**.
  - SSRF guardrails blocking metadata IPs (`169.254.0.0/16`), non-HTTP schemes, and internal ports.
  - Real-time Audit Logs (WebSocket stream), health probes (`/health/live`, `/health/ready`, `/health/startup`), and Prometheus metrics (`/metrics`).
- **Companion `grav` CLI (`crates/grav`)**:
  - Inject decrypted Vault secrets directly into child process RAM without writing `.env` files to disk (`grav vault run -- ...`), pull secrets, check cluster health, or run S3 commands.
- **Responsive Admin UI**:
  - Desktop collapsible sidebar and mobile top bar + drawer navigation (`360px`+ ready across dashboard, explorer, vault, federation, policies, and modals).

---

## Architecture Overview

| Component                 | Stack                                                                        | Default Port / Path                                    |
| ------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------ |
| **Storage & Admin Core**  | Rust 2021, Axum 0.8, Tokio, Turso (`turso` 0.4)                              | Admin `:8080`, S3 `:9000`                              |
| **Web Dashboard**         | React 19, TanStack Start/Router, Vite 8, Tailwind v4, `@ui-sdk/react`, Nitro | `:3000` (`/api` & `/s3` proxied)                       |
| **CLI Binary**            | Rust workspace crate `crates/grav`                                           | `grav`                                                 |
| **Metadata Domains**      | Embedded Turso (libSQL WAL, flushed cleanly on shutdown)                     | `./db/turso.db`, `./db/vault.db`, `./db/federation.db` |
| **Object Payload Store**  | Direct filesystem streaming storage                                          | `./data`                                               |
| **Optional Shared Cache** | Moka in-memory (default) or Redis (`--features redis-cache`)                 | `:6379`                                                |

---

## Table of Contents

- [Quick Start (Docker Compose)](#quick-start-docker-compose)
- [Local Development](#local-development)
- [Using `grav` CLI](#using-grav-cli)
- [Environment Variables](#environment-variables)
- [S3 CLI Usage (`aws-cli`)](#s3-cli-usage-aws-cli)
- [Testing & Verification](#testing--verification)
- [Production Deployment & Backups](#production-deployment--backups)

---

## Quick Start (Docker Compose)

1. **Create your `.env` file**:

   ```bash
   cp .env.example .env
   ```

   Set strong random secrets for production:

   ```bash
   openssl rand -base64 32
   ```

2. **Start with pre-built GHCR images or build locally**:

   ```bash
   # Pre-built images
   docker compose -f docker-compose.ghcr.yml up -d

   # Or build from source (backend + grav CLI + frontend + redis)
   docker compose up -d --build
   ```

3. **Access GravSpace**:
   - **Web Dashboard**: `http://localhost:3000`
   - **Admin API**: `http://localhost:8080`
   - **S3 API**: `http://localhost:9000`
   - **Health / Metrics**: `http://localhost:8080/health/live` · `http://localhost:8080/metrics`

4. **Default First-Boot Credentials** (override via `.env` before first boot):
   - Admin username: `admin`
   - Default password: `admin` (you will be prompted to rotate it on first login if `INITIAL_ADMIN_PASSWORD` is unset).

---

## Local Development

GravSpace embeds Turso directly inside `storage-server` — **no separate `tursodb` sync server is needed**.

### 1. Backend (`storage-server`)

Prerequisites: Rust toolchain (1.80+ / stable).

```bash
cp .env.example .env
cargo run --bin storage-server
```

- Admin API runs on `http://127.0.0.1:8080` (`ADMIN_PORT`)
- S3 API runs on `http://127.0.0.1:9000` (`S3_PORT`)
- Embedded databases auto-initialize in `./db/turso.db`, `./db/vault.db`, and `./db/federation.db`.

To enable Redis distributed cache support at compile time:

```bash
cargo run --bin storage-server --features redis-cache
```

### 2. Frontend (`TanStack Start + Vite`)

Prerequisites: [Bun](https://bun.sh) (or Node.js 22+).

```bash
cd frontend
bun install
bun run dev
```

The dashboard starts at `http://localhost:3000` and proxies `/api` → `http://localhost:8080` and `/s3` → `http://localhost:9001` (override via `SERVER_URL` and `S3_URL`).
When running both backend (`S3_PORT=9000`) and Vite proxy locally, set `S3_URL=http://localhost:9000` in your shell or `.env` if your backend listens on `9000`.

### 3. Build Individual Docker Images

```bash
# Backend + grav CLI
docker build -t gravspace-core:latest .

# Frontend SSR/UI
docker build -t gravspace-frontend:latest ./frontend
```

---

## Using `grav` CLI

Build or run the workspace CLI directly:

```bash
cargo build --release -p grav
# Binary available at ./target/release/grav
```

Common commands:

```bash
# Check server health & database stats
grav status

# Zero-Disk secret injection into memory for any command
grav vault run --project default --env production -- node server.js

# Export environment variables to stdout
grav vault pull --project default --env development

# List buckets or upload objects via S3
grav s3 ls
grav s3 cp ./backup.tar.gz s3://my-bucket/backups/backup.tar.gz
```

Environment overrides for `grav`:

- `GRAV_ENDPOINT` (default: `http://127.0.0.1:8080`)
- `GRAV_TOKEN` (admin JWT, or auto-read from `.env`)

---

## Environment Variables

### Backend Configuration

| Variable                    | Description                                                                                                        | Default               |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------ | --------------------- |
| `JWT_SECRET`                | Secret key for signing Admin JWT tokens (**Required in prod**)                                                     | `secret`              |
| `VAULT_MASTER_KEY`          | Dedicated master key for Vault AEAD encryption (falls back to `JWT_SECRET` if unset)                               | -                     |
| `SSE_MASTER_KEY`            | 32-byte master key for SSE-S3 encryption                                                                           | dev fallback          |
| `GRAVSPACE_STRICT_SECRETS`  | Panic on startup if default `JWT_SECRET`, `SSE_MASTER_KEY`, or missing `VAULT_MASTER_KEY` is detected (`true`/`1`) | `false`               |
| `ADMIN_PORT`                | HTTP port for Admin API, WebSockets & metrics                                                                      | `8080`                |
| `S3_PORT`                   | HTTP port for S3 REST API                                                                                          | `9000`                |
| `CORS_ORIGINS`              | Comma-separated allowed origins for CORS                                                                           | `*`                   |
| `SERVER_HOST`               | Host/domain embedded in generated presigned URLs                                                                   | `localhost:<S3_PORT>` |
| `CDN_HOSTS`                 | Comma-separated CDN alias domains allowed to verify presigned URLs                                                 | -                     |
| `DATABASE_URL`              | Path/URL for primary S3 metadata DB (or `TURSO_DATABASE_URL`)                                                      | `./db/turso.db`       |
| `VAULT_DATABASE_URL`        | Path/URL for Vault DB                                                                                              | `./db/vault.db`       |
| `FEDERATION_DATABASE_URL`   | Path/URL for Federation DB                                                                                         | `./db/federation.db`  |
| `DATABASE_AUTH_TOKEN`       | Auth token if connecting to remote Turso Cloud (or `TURSO_AUTH_TOKEN`)                                             | -                     |
| `GRAVSPACE_NODE_NAME`       | Custom node name announced in federation provenance headers                                                        | system `HOSTNAME`     |
| `SYNC_WORKER_INTERVAL`      | Background reconcile worker interval (`30s`, `5m`, `1h`)                                                           | `5m`                  |
| `LIFECYCLE_WORKER_INTERVAL` | Bucket lifecycle expiration interval                                                                               | `1h`                  |
| `REDIS_URL`                 | Optional Redis connection URL (when built with `--features redis-cache`)                                           | -                     |
| `INITIAL_ADMIN_PASSWORD`    | Initial `admin` password seeded on first startup                                                                   | `admin`               |
| `INITIAL_ADMIN_ACCESS_KEY`  | Initial S3 access key seeded on first startup                                                                      | random/default        |
| `INITIAL_ADMIN_SECRET_KEY`  | Initial S3 secret key seeded on first startup                                                                      | random/default        |

### Frontend Configuration

| Variable        | Description                                                           | Default                 |
| --------------- | --------------------------------------------------------------------- | ----------------------- |
| `VITE_API_BASE` | Client-side API base path                                             | `/api`                  |
| `VITE_WS_BASE`  | Optional explicit WebSocket base URL (e.g. `wss://space.example.com`) | inferred from host      |
| `SERVER_URL`    | Backend Admin proxy target (`vite dev` / Nitro SSR)                   | `http://localhost:8080` |
| `S3_URL`        | Backend S3 proxy target for `/s3` rewrite in Vite dev                 | `http://localhost:9001` |
| `FRONTEND_PORT` | Exposed frontend port in Docker Compose                               | `3000`                  |

> [!WARNING]
> **Always set `JWT_SECRET`, `VAULT_MASTER_KEY`, `SSE_MASTER_KEY`, and `GRAVSPACE_STRICT_SECRETS=true` in production**, and restrict `CORS_ORIGINS` to your exact dashboard origins.

---

## S3 CLI Usage (`aws-cli`)

```bash
aws configure set aws_access_key_id <your-access-key>
aws configure set aws_secret_access_key <your-secret-key>

# List buckets
aws --endpoint-url http://localhost:9000 s3 ls

# Create bucket
aws --endpoint-url http://localhost:9000 s3 mb s3://my-bucket

# Upload & download objects
aws --endpoint-url http://localhost:9000 s3 cp file.txt s3://my-bucket/
aws --endpoint-url http://localhost:9000 s3 cp s3://my-bucket/file.txt ./downloaded.txt
```

---

## Testing & Verification

```bash
# Rust tests, linter, and workspace build
cargo test --workspace
cargo clippy --workspace -- -W clippy::all
cargo build --workspace

# Frontend typecheck, Vitest suite, and Nitro/Vite build
cd frontend
bunx tsc --noEmit
bun run test
bun run build
```

---

## Production Deployment & Backups

### Reverse Proxy (Nginx Example)

- Route dashboard & `/api` traffic (`/` → `http://localhost:3000`, `/api/` & WebSockets → `http://localhost:8080`).
- Route S3 SDK / CLI traffic (`https://s3.yourdomain.com` → `http://localhost:9000`). Set `SERVER_HOST=s3.yourdomain.com` and configure TLS termination at Nginx/Caddy/Traefik.

### Data Persistence & Backups

Docker Compose stores persistent state in three volumes: `storage_data` (`/app/data`), `storage_db` (`/app/db`), and `storage_logs` (`/app/logs`).

```bash
# Backup payload & Turso DB volumes
docker run --rm \
  -v storage-object_storage_data:/data \
  -v storage-object_storage_db:/db \
  -v $(pwd):/backup alpine \
  tar czf /backup/gravspace-backup.tar.gz -C / data db

# Restore backup
docker run --rm \
  -v storage-object_storage_data:/data \
  -v storage-object_storage_db:/db \
  -v $(pwd):/backup alpine \
  tar xzf /backup/gravspace-backup.tar.gz -C /
```

## License

MIT
