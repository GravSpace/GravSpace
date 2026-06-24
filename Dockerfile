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

# Print tursodb help to see available flags (diagnostic)
RUN echo '--- tursodb help ---' && $HOME/.turso/tursodb --help 2>&1 || true

# Copy source code
COPY . .

# Build the application
RUN CGO_ENABLED=1 GOOS=linux go build -a -installsuffix cgo -o storage-server .

# Build a tiny static healthcheck utility
RUN echo 'package main\nimport "net/http"\nimport "os"\nfunc main() {\n  res, err := http.Get("http://localhost:8080/health/live")\n  if err != nil || res.StatusCode != 200 {\n    os.Exit(1)\n  }\n}' > healthcheck.go && \
    CGO_ENABLED=0 go build -o healthcheck healthcheck.go

# Copy the pre-compiled Turso libraries from Go module cache matching the target platform
ARG TARGETOS
ARG TARGETARCH
RUN find /go/pkg/mod -path "*/${TARGETOS}_${TARGETARCH}/*" -name "libturso_go.so" -exec cp {} /app/libturso_go.so \; && \
    find /go/pkg/mod -path "*/${TARGETOS}_${TARGETARCH}/*" -name "libturso_sync_sdk_kit.so" -exec cp {} /app/libturso_sync_sdk_kit.so \;

# Runtime stage
FROM debian:bookworm-slim

# Install runtime dependencies including curl and netcat for health checks
RUN apt-get update && apt-get install -y curl ca-certificates netcat-openbsd && rm -rf /var/lib/apt/lists/*

# Copy certificates and timezone data from builder
COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/
COPY --from=builder /usr/share/zoneinfo /usr/share/zoneinfo

# Set working directory
WORKDIR /app

# Copy binaries, entrypoint, and libraries from builder
COPY --from=builder /app/storage-server .
COPY --from=builder /app/healthcheck /usr/local/bin/healthcheck
COPY --from=builder /app/libturso_go.so /usr/lib/
COPY --from=builder /app/libturso_sync_sdk_kit.so /usr/lib/
COPY --from=builder /app/entrypoint.sh /app/entrypoint.sh
COPY --from=builder /root/.turso/tursodb /usr/local/bin/tursodb

# Register the library and ensure executables are runnable
RUN chmod 755 /usr/lib/libturso_go.so /usr/lib/libturso_sync_sdk_kit.so && ldconfig && \
    chmod +x /usr/local/bin/tursodb /app/entrypoint.sh

# Create non-root user and home directory
RUN groupadd -g 1000 appuser && \
    useradd -m -u 1000 -g appuser appuser

# Pre-create the cache path
RUN mkdir -p /home/appuser/.cache/turso-go && \
    chown -R appuser:appuser /home/appuser/.cache

# Create app data directories
RUN mkdir -p /app/data /app/db /app/logs && \
    chown -R appuser:appuser /app

# Set environment variables
ENV LD_LIBRARY_PATH=/usr/lib:/usr/local/lib

# Switch to non-root user
USER appuser

# Expose ports
EXPOSE 8080
EXPOSE 9000

# Run the application using our orchestrating entrypoint script
CMD ["/app/entrypoint.sh"]
