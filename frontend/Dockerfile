# Build stage
FROM oven/bun:1.3.14-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json bun.lock ./

# Install dependencies using Bun
RUN bun install --no-audit

# Copy source code
COPY . .

# Generate routes first
RUN bun run generate-routes

# Build the application
RUN bun run build

# Runtime stage
FROM oven/bun:1.3.14-alpine

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create non-root user
RUN adduser -D -h /app -s /bin/sh appuser

# Set working directory
WORKDIR /app

# Copy built application and package.json
COPY --from=builder --chown=appuser:appuser /app/.output ./.output
COPY --from=builder --chown=appuser:appuser /app/package.json ./

# Switch to non-root user
USER appuser

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD bun -e "fetch('http://localhost:3000/health').then(r => process.exit(r.status === 200 ? 0 : 1)).catch(() => process.exit(1))" || exit 1

# Run the application using Bun
ENTRYPOINT ["dumb-init", "--"]
CMD ["bun", ".output/server/index.mjs"]
