# GravityStore

High Performance S3 Compatible Object Storage focused on speed and simplicity.

## Features
- **S3 Compatibility**: Partial support for S3 API (Bucket and Object operations).
- **Go Backend**: High-performance core using Echo framework.
- **NuxtJS Frontend**: Modern dashboard for bucket and object management.
- **Simplicity**: No complex configuration, just start and store.

## Getting Started

### Backend
1. Ensure you have Go installed (compatible with 1.19+).
2. Run the server:
   ```bash
   ./storage-server
   ```
   The server will start on `:8080`.

### Frontend
1. Ensure you have Node.js installed.
2. Navigate to the `frontend` directory.
3. Install dependencies and run in dev mode:
   ```bash
   npm install
   npm run dev
   ```

### S3 CLI Usage
You can use `aws-cli` with GravityStore:
```bash
aws --endpoint-url http://localhost:8080 s3 ls
```

## License
MIT
