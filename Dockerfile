# Build stage
FROM golang:1.25-bookworm AS builder

# Set working directory
WORKDIR /app

# Copy go mod files
COPY go.mod go.sum ./

# Download dependencies
RUN go mod download

# Download and install Turso CLI
RUN apt-get update && apt-get install -y curl xz-utils && \
    curl --proto '=https' --tlsv1.2 -LsSf https://github.com/tursodatabase/turso/releases/latest/download/turso_cli-installer.sh | sh

# Copy source code
COPY . .

# Build the application
# CGO_ENABLED=0: tursogo v0.6.1 uses purego (no CGO) — the native library is
# embedded into the binary via go:embed and extracted to ~/.cache/turso-go/ at runtime.
RUN CGO_ENABLED=0 GOOS=linux go build -a -o storage-server .

# Build a tiny static healthcheck utility
RUN printf 'package main\nimport "net/http"\nimport "os"\nfunc main() {\n  res, err := http.Get("http://localhost:8080/health/live")\n  if err != nil || res.StatusCode != 200 {\n    os.Exit(1)\n  }\n}\n' > healthcheck.go && \
    CGO_ENABLED=0 go build -o healthcheck healthcheck.go

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
# Note: No .so files needed — libturso_sync_sdk_kit.so is embedded in the binary
# via go:embed (turso-go-platform-libs) and extracted to ~/.cache/turso-go/ at runtime.
COPY --from=builder /app/storage-server .
COPY --from=builder /app/healthcheck /usr/local/bin/healthcheck
COPY --from=builder /app/entrypoint.sh /app/entrypoint.sh
COPY --from=builder /root/.turso/tursodb /usr/local/bin/tursodb

# Ensure executables are runnable
RUN chmod +x /usr/local/bin/tursodb /app/entrypoint.sh

# Create non-root user and home directory
RUN groupadd -g 1000 appuser && \
    useradd -m -u 1000 -g appuser appuser

# Pre-create the cache path so the library can be extracted at runtime
RUN mkdir -p /home/appuser/.cache/turso-go && \
    chown -R appuser:appuser /home/appuser/.cache

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
