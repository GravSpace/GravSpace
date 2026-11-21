# Build stage
FROM rust:bookworm AS builder

# Set working directory
WORKDIR /app

# Download and install Turso CLI
RUN apt-get update && apt-get install -y curl xz-utils pkg-config libssl-dev && \
    curl --proto '=https' --tlsv1.2 -LsSf https://github.com/tursodatabase/turso/releases/latest/download/turso_cli-installer.sh | sh

# Copy Cargo manifests
COPY Cargo.toml Cargo.lock ./

# Pre-build dependencies for Docker layer caching
RUN mkdir src && echo "fn main() {}" > src/main.rs && \
    cargo build --release && \
    rm -rf src

# Copy real source code
COPY src ./src

# Build release binary
RUN touch src/main.rs && cargo build --release

# Runtime stage
FROM debian:bookworm-slim

# Install runtime dependencies including curl and netcat for health checks
RUN apt-get update && apt-get install -y curl ca-certificates netcat-openbsd && rm -rf /var/lib/apt/lists/*

# Copy certificates and timezone data from builder
COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/
COPY --from=builder /usr/share/zoneinfo /usr/share/zoneinfo

# Set working directory
WORKDIR /app

# Copy binaries and entrypoint from builder
COPY --from=builder /app/target/release/storage-server .
COPY --from=builder /root/.turso/tursodb /usr/local/bin/tursodb
COPY entrypoint.sh /app/entrypoint.sh

# Create healthcheck script
RUN echo '#!/bin/sh\ncurl -fsS http://localhost:8080/health/live >/dev/null 2>&1' > /usr/local/bin/healthcheck && \
    chmod +x /usr/local/bin/healthcheck /usr/local/bin/tursodb /app/entrypoint.sh

# Create non-root user and home directory
RUN groupadd -g 1000 appuser && \
    useradd -m -u 1000 -g appuser appuser

# Create app data directories
RUN mkdir -p /app/data /app/db /app/logs && \
    chown -R appuser:appuser /app

# Switch to non-root user
USER appuser

# Expose ports
EXPOSE 8080
EXPOSE 9000

# Run the application using our orchestrating entrypoint script
CMD ["/app/entrypoint.sh"]
