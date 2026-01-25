# Build stage
FROM golang:1.24-bookworm AS builder

# Set working directory
WORKDIR /app

# Copy go mod files
COPY go.mod go.sum ./

# Download dependencies
RUN go mod download

# Copy source code
COPY . .

# Build the application
RUN CGO_ENABLED=1 GOOS=linux go build -a -installsuffix cgo -o storage-server .

# Build a tiny static healthcheck utility
RUN echo 'package main\nimport "net/http"\nimport "os"\nfunc main() {\n  res, err := http.Get("http://localhost:8080/health/live")\n  if err != nil || res.StatusCode != 200 {\n    os.Exit(1)\n  }\n}' > healthcheck.go && \
    CGO_ENABLED=0 go build -o healthcheck healthcheck.go

# Trigger pre-extraction of libturso_go.so
RUN (./storage-server & sleep 2 && kill $!) || true
RUN find /root/.cache/turso-go -name "libturso_go.so" -exec cp {} /app/libturso_go.so \;

# Runtime stage
FROM debian:bookworm-slim

# Copy certificates and timezone data from builder
COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/
COPY --from=builder /usr/share/zoneinfo /usr/share/zoneinfo

# Set working directory
WORKDIR /app

# Copy binaries and library from builder
COPY --from=builder /app/storage-server .
COPY --from=builder /app/healthcheck /usr/local/bin/healthcheck
COPY --from=builder /app/libturso_go.so /usr/lib/

# Register the library
RUN chmod 755 /usr/lib/libturso_go.so && ldconfig

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

# Expose port
EXPOSE 8080

# Run the application
CMD ["./storage-server"]
