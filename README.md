# GravityStore

High Performance S3 Compatible Object Storage focused on speed and simplicity.

## Features
- **S3 Compatibility**: Support for S3 API (Buckets, Objects, and **Versioning**).
- **IAM Policy Management**: Fine-grained access control with JSON policies.
- **Anonymous/Public Access**: One-click public buckets and folders.
- **Presigned URLs**: Authentication via query-string parameters.
- **High Performance**: Go-powered core with Nuxt 4 dashboard.
- **MIME Type Detection**: Direct in-browser display for images and documents.

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
