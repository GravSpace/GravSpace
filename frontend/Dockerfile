# Build stage
FROM node:20-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies with QEMU/ARM64 compatibility fixes
# - Increase Node.js memory limit for ARM64 emulation
# - Use single socket to avoid race conditions
# - Disable strict SSL for potential certificate issues in QEMU
# - Use legacy peer deps to avoid dependency conflicts
ENV NODE_OPTIONS="--max-old-space-size=4096"
ENV npm_config_fetch_retries=5
ENV npm_config_fetch_retry_mintimeout=20000
ENV npm_config_fetch_retry_maxtimeout=120000

RUN npm ci --prefer-offline --no-audit --legacy-peer-deps --maxsockets=1 2>&1 || \
    (echo "First attempt failed, retrying with cache clean..." && \
     npm cache clean --force && \
     npm ci --prefer-offline --no-audit --legacy-peer-deps --maxsockets=1)

# Copy source code
COPY . .

# Build the application with increased memory
RUN NODE_OPTIONS="--max-old-space-size=4096" npm run build

# Runtime stage
FROM node:20-alpine

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create non-root user
RUN adduser -D -h /app -s /bin/sh appuser

# Set working directory
WORKDIR /app

# Copy built application from builder
COPY --from=builder --chown=appuser:appuser /app/.output ./.output
COPY --from=builder --chown=appuser:appuser /app/package*.json ./

# Switch to non-root user
USER appuser

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})" || exit 1

# Run the application with dumb-init
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", ".output/server/index.mjs"]
