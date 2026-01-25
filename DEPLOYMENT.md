# GravSpace - Docker Production Deployment Guide

This guide provides detailed instructions for deploying GravSpace in production using Docker and Docker Compose.

## Prerequisites

- Docker Engine 20.10+ installed
- Docker Compose 2.0+ installed
- At least 2GB RAM available
- 10GB+ disk space for storage

## Quick Start

### 1. Initial Setup

```bash
# Clone the repository
git clone <repository-url>
cd storage-object

# Copy environment template
cp .env.example .env

# Generate secure JWT secret
JWT_SECRET=$(openssl rand -base64 32)
echo "JWT_SECRET=$JWT_SECRET" >> .env
```

### 2. Configure Environment

Edit `.env` file with your settings:

```bash
# Backend Configuration
JWT_SECRET=<generated-secret-from-above>
CORS_ORIGINS=http://localhost:3000,https://yourdomain.com
BACKEND_PORT=8080

# Frontend Configuration
NUXT_PUBLIC_API_BASE=http://localhost:8080
FRONTEND_PORT=3000
```

### 3. Start Services

```bash
# Build and start all services
docker-compose up -d

# Check service status
docker-compose ps

# View logs
docker-compose logs -f
```

### 4. Access Application

- **Frontend Dashboard**: http://localhost:3000
- **Backend API**: http://localhost:8080
- **Health Check**: http://localhost:8080/health/live
- **Metrics**: http://localhost:8080/metrics

## Production Deployment

### Using Reverse Proxy (Recommended)

#### Option 1: Nginx

1. **Install Nginx**:
```bash
sudo apt update
sudo apt install nginx certbot python3-certbot-nginx
```

2. **Configure Nginx** (`/etc/nginx/sites-available/gravspace`):
```nginx
# Frontend
server {
    listen 80;
    server_name yourdomain.com;
    
    # Redirect to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name yourdomain.com;
    
    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;
    
    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}

# Backend API
server {
    listen 80;
    server_name api.yourdomain.com;
    
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name api.yourdomain.com;
    
    ssl_certificate /etc/letsencrypt/live/api.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.yourdomain.com/privkey.pem;
    
    # Increase upload size for large files
    client_max_body_size 1G;
    client_body_timeout 300s;
    
    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    
    location / {
        proxy_pass http://localhost:8080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Timeouts for large uploads
        proxy_connect_timeout 300s;
        proxy_send_timeout 300s;
        proxy_read_timeout 300s;
    }
}
```

3. **Enable site and get SSL certificate**:
```bash
# Enable site
sudo ln -s /etc/nginx/sites-available/gravspace /etc/nginx/sites-enabled/

# Test configuration
sudo nginx -t

# Get SSL certificates
sudo certbot --nginx -d yourdomain.com -d api.yourdomain.com

# Restart Nginx
sudo systemctl restart nginx
```

4. **Update `.env` for production**:
```bash
JWT_SECRET=$(openssl rand -base64 32)
CORS_ORIGINS=https://yourdomain.com
NUXT_PUBLIC_API_BASE=https://api.yourdomain.com
BACKEND_PORT=8080
FRONTEND_PORT=3000
```

#### Option 2: Traefik (with automatic SSL)

1. **Create `docker-compose.prod.yml`**:
```yaml
version: '3.8'

services:
  traefik:
    image: traefik:v2.10
    container_name: traefik
    restart: unless-stopped
    command:
      - "--api.dashboard=true"
      - "--providers.docker=true"
      - "--providers.docker.exposedbydefault=false"
      - "--entrypoints.web.address=:80"
      - "--entrypoints.websecure.address=:443"
      - "--certificatesresolvers.letsencrypt.acme.httpchallenge=true"
      - "--certificatesresolvers.letsencrypt.acme.httpchallenge.entrypoint=web"
      - "--certificatesresolvers.letsencrypt.acme.email=your-email@example.com"
      - "--certificatesresolvers.letsencrypt.acme.storage=/letsencrypt/acme.json"
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - "/var/run/docker.sock:/var/run/docker.sock:ro"
      - "traefik_letsencrypt:/letsencrypt"
    networks:
      - gravspace-network

  backend:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: gravspace-backend
    restart: unless-stopped
    environment:
      - JWT_SECRET=${JWT_SECRET}
      - CORS_ORIGINS=${CORS_ORIGINS}
    volumes:
      - storage_data:/app/data
    networks:
      - gravspace-network
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.backend.rule=Host(`api.yourdomain.com`)"
      - "traefik.http.routers.backend.entrypoints=websecure"
      - "traefik.http.routers.backend.tls.certresolver=letsencrypt"
      - "traefik.http.services.backend.loadbalancer.server.port=8080"

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    container_name: gravspace-frontend
    restart: unless-stopped
    environment:
      - NUXT_PUBLIC_API_BASE=https://api.yourdomain.com
      - NODE_ENV=production
    depends_on:
      - backend
    networks:
      - gravspace-network
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.frontend.rule=Host(`yourdomain.com`)"
      - "traefik.http.routers.frontend.entrypoints=websecure"
      - "traefik.http.routers.frontend.tls.certresolver=letsencrypt"
      - "traefik.http.services.frontend.loadbalancer.server.port=3000"

networks:
  gravspace-network:
    driver: bridge

volumes:
  storage_data:
    driver: local
  traefik_letsencrypt:
    driver: local
```

2. **Deploy with Traefik**:
```bash
docker-compose -f docker-compose.prod.yml up -d
```

## Data Management

### Backup

```bash
# Create timestamped backup
BACKUP_NAME="gravspace-backup-$(date +%Y%m%d-%H%M%S).tar.gz"
docker run --rm \
  -v storage-object_storage_data:/data \
  -v $(pwd):/backup \
  alpine tar czf /backup/$BACKUP_NAME -C /data .

echo "Backup created: $BACKUP_NAME"
```

### Restore

```bash
# Restore from backup
BACKUP_FILE="gravspace-backup-20260125-120000.tar.gz"
docker run --rm \
  -v storage-object_storage_data:/data \
  -v $(pwd):/backup \
  alpine tar xzf /backup/$BACKUP_FILE -C /data

echo "Backup restored from: $BACKUP_FILE"
```

### Automated Backups

Create a cron job for daily backups:

```bash
# Edit crontab
crontab -e

# Add this line for daily backup at 2 AM
0 2 * * * cd /path/to/storage-object && docker run --rm -v storage-object_storage_data:/data -v $(pwd)/backups:/backup alpine tar czf /backup/backup-$(date +\%Y\%m\%d).tar.gz -C /data . && find /path/to/storage-object/backups -name "backup-*.tar.gz" -mtime +7 -delete
```

## Monitoring

### Health Checks

```bash
# Check backend health
curl http://localhost:8080/health/live

# Check readiness
curl http://localhost:8080/health/ready

# Check startup
curl http://localhost:8080/health/startup
```

### Prometheus Metrics

Access metrics at `http://localhost:8080/metrics`

Example Prometheus configuration:

```yaml
scrape_configs:
  - job_name: 'gravspace'
    static_configs:
      - targets: ['localhost:8080']
```

### Logging

```bash
# View all logs
docker-compose logs -f

# View backend logs only
docker-compose logs -f backend

# View last 100 lines
docker-compose logs --tail=100 backend

# Export logs to file
docker-compose logs --no-color > gravspace.log
```

## Scaling

### Horizontal Scaling (Multiple Backend Instances)

1. **Update `docker-compose.yml`** to remove port mapping from backend:
```yaml
backend:
  # Remove ports section
  # ports:
  #   - "8080:8080"
```

2. **Scale backend**:
```bash
docker-compose up -d --scale backend=3
```

3. **Configure load balancer** (nginx example):
```nginx
upstream backend_servers {
    least_conn;
    server localhost:8080;
    server localhost:8081;
    server localhost:8082;
}

server {
    listen 443 ssl http2;
    server_name api.yourdomain.com;
    
    location / {
        proxy_pass http://backend_servers;
        # ... other proxy settings
    }
}
```

## Security Best Practices

### 1. Environment Variables
- ✅ Never commit `.env` to version control
- ✅ Use strong random JWT secrets (32+ characters)
- ✅ Restrict CORS to specific domains
- ✅ Use HTTPS in production

### 2. Network Security
- ✅ Use Docker networks to isolate services
- ✅ Don't expose backend port directly (use reverse proxy)
- ✅ Configure firewall rules

### 3. Container Security
- ✅ Run containers as non-root user (already configured)
- ✅ Keep images updated
- ✅ Scan images for vulnerabilities

### 4. Data Security
- ✅ Regular backups
- ✅ Encrypt data at rest
- ✅ Use volume encryption if available

## Troubleshooting

### Container won't start

```bash
# Check logs
docker-compose logs backend

# Check container status
docker-compose ps

# Restart services
docker-compose restart
```

### Permission issues

```bash
# Fix data directory permissions
sudo chown -R 1000:1000 ./data
```

### Out of disk space

```bash
# Clean up unused Docker resources
docker system prune -a

# Remove old images
docker image prune -a
```

### High memory usage

```bash
# Check container stats
docker stats

# Limit container memory in docker-compose.yml
services:
  backend:
    deploy:
      resources:
        limits:
          memory: 512M
```

## Maintenance

### Update Application

```bash
# Pull latest changes
git pull

# Rebuild and restart
docker-compose down
docker-compose build --no-cache
docker-compose up -d
```

### Clean Up

```bash
# Remove stopped containers
docker-compose down

# Remove volumes (⚠️ deletes all data)
docker-compose down -v

# Clean up Docker system
docker system prune -a
```

## Support

For issues and questions:
- GitHub Issues: <repository-url>/issues
- Documentation: <repository-url>/wiki

## License

MIT
