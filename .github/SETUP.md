# GitHub Actions Setup for Docker Images

## Quick Setup

### 1. Enable GitHub Actions Permissions

1. Go to your repository **Settings**
2. Navigate to **Actions** → **General**
3. Under **Workflow permissions**, select:
   - ✅ **Read and write permissions**
   - ✅ **Allow GitHub Actions to create and approve pull requests**
4. Click **Save**

### 2. Push Your Code

```bash
git add .
git commit -m "Add Docker CI/CD workflows"
git push origin main
```

The workflows will automatically run and build your Docker images!

### 3. Make Images Public (Optional)

By default, images are private. To make them public:

1. Go to your GitHub profile → **Packages**
2. Find `gravspace-backend` and `gravspace-frontend`
3. For each package:
   - Click **Package settings**
   - Scroll to **Danger Zone**
   - Click **Change visibility** → **Public**

### 4. Create a Release (Optional)

To create versioned images:

```bash
# Create and push a tag
git tag -a v1.0.0 -m "Release v1.0.0"
git push origin v1.0.0
```

Or use GitHub UI:
1. Go to **Releases** → **Create a new release**
2. Choose tag: `v1.0.0`
3. Click **Publish release**

This will create images with tags:
- `latest`
- `1.0.0`
- `1.0`
- `1`

## What Gets Built

### Automatic Builds

- ✅ Every push to `main` → `latest` tag
- ✅ Every tag push (e.g., `v1.0.0`) → version tags
- ✅ Every PR → build only (no push)
- ✅ Multi-platform: `linux/amd64`, `linux/arm64`

### Image Locations

- Backend: `ghcr.io/YOUR_USERNAME/YOUR_REPO-backend:latest`
- Frontend: `ghcr.io/YOUR_USERNAME/YOUR_REPO-frontend:latest`

Replace `YOUR_USERNAME/YOUR_REPO` with your actual GitHub username and repository name.

## Using the Images

### Pull Images

```bash
docker pull ghcr.io/YOUR_USERNAME/YOUR_REPO-backend:latest
docker pull ghcr.io/YOUR_USERNAME/YOUR_REPO-frontend:latest
```

### Deploy

```bash
# Update image names in docker-compose.ghcr.yml if needed
docker-compose -f docker-compose.ghcr.yml up -d
```

## Troubleshooting

### Build Failed

1. Go to **Actions** tab
2. Click on the failed workflow
3. Check the error logs

### Cannot Pull Image

If images are private, login first:

```bash
echo $GITHUB_TOKEN | docker login ghcr.io -u YOUR_USERNAME --password-stdin
```

Create a Personal Access Token:
1. GitHub Settings → Developer settings → Personal access tokens
2. Generate new token with `read:packages` scope
3. Use it as `GITHUB_TOKEN`

## Next Steps

- 📖 Read [DOCKER_REGISTRY.md](DOCKER_REGISTRY.md) for detailed documentation
- 🚀 See [../DEPLOYMENT.md](../DEPLOYMENT.md) for production deployment guide
- 🔧 Check [../README.md](../README.md) for environment variables

## Workflows

- **`.github/workflows/docker-publish.yml`** - CI builds on every push
- **`.github/workflows/docker-release.yml`** - Release builds with version tags
