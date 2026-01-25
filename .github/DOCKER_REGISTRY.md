# Docker Registry Setup Guide

This guide explains how to use the automated Docker image builds with GitHub Container Registry (GHCR).

## Overview

The repository is configured with GitHub Actions to automatically build and push Docker images to GitHub Container Registry (ghcr.io) on:
- Every push to `main`/`master` branch
- Every tag push (e.g., `v1.0.0`)
- Every pull request (build only, no push)
- Manual workflow dispatch

## Image Names

Images are published to:
- **Backend**: `ghcr.io/gravspace/gravspace-backend`
- **Frontend**: `ghcr.io/gravspace/gravspace-frontend`

## Image Tags

### Automatic Tagging

The workflow automatically creates the following tags:

1. **Branch-based tags**:
   - `main` → `latest`
   - `develop` → `develop`

2. **Version tags** (from git tags):
   - `v1.2.3` → `1.2.3`, `1.2`, `1`, `latest`
   - `v2.0.0-beta.1` → `2.0.0-beta.1`

3. **SHA tags**:
   - `main-abc1234` (branch + short SHA)

4. **PR tags**:
   - `pr-123` (for pull requests)

## Setup Instructions

### 1. Enable GitHub Container Registry

1. Go to your repository settings
2. Navigate to **Actions** → **General**
3. Under **Workflow permissions**, select:
   - ✅ **Read and write permissions**
   - ✅ **Allow GitHub Actions to create and approve pull requests**

### 2. Make Images Public (Optional)

By default, images are private. To make them public:

1. Go to your GitHub profile
2. Click on **Packages**
3. Find your package (e.g., `gravspace-backend`)
4. Click **Package settings**
5. Scroll to **Danger Zone**
6. Click **Change visibility** → **Public**

### 3. Create a Release

To trigger a release build with version tags:

```bash
# Create and push a tag
git tag -a v1.0.0 -m "Release version 1.0.0"
git push origin v1.0.0
```

Or use GitHub's release interface:
1. Go to **Releases** → **Create a new release**
2. Choose a tag (e.g., `v1.0.0`)
3. Fill in release notes
4. Click **Publish release**

## Using Pre-built Images

### Pull Images

```bash
# Pull latest images
docker pull ghcr.io/gravspace/gravspace-backend:latest
docker pull ghcr.io/gravspace/gravspace-frontend:latest

# Pull specific version
docker pull ghcr.io/gravspace/gravspace-backend:1.0.0
docker pull ghcr.io/gravspace/gravspace-frontend:1.0.0
```

### Authentication (for private images)

```bash
# Login to GHCR
echo $GITHUB_TOKEN | docker login ghcr.io -u USERNAME --password-stdin

# Or use Personal Access Token
echo $PAT | docker login ghcr.io -u USERNAME --password-stdin
```

**Creating a Personal Access Token (PAT)**:
1. Go to GitHub Settings → Developer settings → Personal access tokens → Tokens (classic)
2. Click **Generate new token (classic)**
3. Select scopes:
   - ✅ `read:packages` (to download images)
   - ✅ `write:packages` (to upload images)
4. Copy the token and save it securely

### Deploy with Docker Compose

Use the pre-built images with the provided compose file:

```bash
# Copy environment template
cp .env.example .env

# Edit .env with your configuration
nano .env

# Deploy using GHCR images
docker-compose -f docker-compose.ghcr.yml up -d
```

## Workflows

### 1. `docker-publish.yml` - Continuous Integration

**Triggers**:
- Push to `main`/`master`
- Push tags matching `v*.*.*`
- Pull requests
- Manual dispatch

**Actions**:
- Builds both backend and frontend images
- Pushes to GHCR (except for PRs)
- Supports multi-platform builds (amd64, arm64)
- Uses GitHub Actions cache for faster builds

### 2. `docker-release.yml` - Release Builds

**Triggers**:
- GitHub release published

**Actions**:
- Builds production-ready images
- Creates version tags (major, minor, patch)
- Generates SBOM (Software Bill of Materials)
- Uploads SBOM as artifacts

## Multi-Platform Support

Images are built for:
- `linux/amd64` (x86_64)
- `linux/arm64` (ARM64/Apple Silicon)

Docker will automatically pull the correct image for your platform.

## Monitoring Builds

### View Workflow Runs

1. Go to **Actions** tab in your repository
2. Click on a workflow run to see details
3. Check logs for each job

### Check Published Images

1. Go to your repository
2. Click on **Packages** (right sidebar)
3. Click on a package to see all tags and details

## Troubleshooting

### Build Fails

**Check logs**:
1. Go to Actions tab
2. Click on the failed workflow
3. Expand the failed step to see error details

**Common issues**:
- Dockerfile syntax errors
- Missing dependencies
- Build context issues

### Cannot Pull Image

**Error**: `unauthorized: authentication required`

**Solution**:
```bash
# Login to GHCR
echo $GITHUB_TOKEN | docker login ghcr.io -u YOUR_USERNAME --password-stdin
```

### Image Not Found

**Error**: `manifest unknown`

**Solution**:
- Check if the workflow completed successfully
- Verify the image name and tag
- Check if the package is public or you're authenticated

## Advanced Configuration

### Custom Image Names

Edit `.github/workflows/docker-publish.yml`:

```yaml
env:
  REGISTRY: ghcr.io
  BACKEND_IMAGE_NAME: your-org/your-backend-name
  FRONTEND_IMAGE_NAME: your-org/your-frontend-name
```

### Additional Platforms

Add more platforms in the workflow:

```yaml
platforms: linux/amd64,linux/arm64,linux/arm/v7
```

### Build Arguments

Pass build arguments:

```yaml
- name: Build and push Docker image
  uses: docker/build-push-action@v5
  with:
    build-args: |
      VERSION=${{ steps.version.outputs.version }}
      BUILD_DATE=${{ steps.date.outputs.date }}
```

## Security Best Practices

1. **Use specific versions** in production:
   ```yaml
   image: ghcr.io/gravspace/gravspace-backend:1.0.0
   ```

2. **Scan images** for vulnerabilities:
   ```bash
   docker scan ghcr.io/gravspace/gravspace-backend:latest
   ```

3. **Keep images updated**:
   - Regularly rebuild images
   - Update base images
   - Apply security patches

4. **Use secrets** for sensitive data:
   - Never hardcode secrets in Dockerfiles
   - Use environment variables
   - Use Docker secrets in production

## Resources

- [GitHub Container Registry Documentation](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry)
- [Docker Build Push Action](https://github.com/docker/build-push-action)
- [Docker Metadata Action](https://github.com/docker/metadata-action)

## Support

For issues related to:
- **Docker builds**: Check GitHub Actions logs
- **Image usage**: See [DEPLOYMENT.md](../DEPLOYMENT.md)
- **General questions**: Open an issue in the repository
