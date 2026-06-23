#!/bin/bash
set -e

echo "=== GravSpace Startup ==="
echo "Preparing database directory..."
mkdir -p /app/db

echo "Starting Turso database engine (tursodb sync server)..."
# tursodb --sync-server starts it as an HTTP sync server at the given address
# DATABASE is a positional argument (no --db-path flag)
tursodb --sync-server 127.0.0.1:8085 /app/db/turso.db &
TURSO_PID=$!
echo "tursodb started with PID: $TURSO_PID"

# Wait for tursodb to start listening on :8085 (up to 30 seconds)
echo "Waiting for Turso sync server to bind to :8085..."
MAX_WAIT=60
COUNT=0
HEALTHY=0
while [ $COUNT -lt $MAX_WAIT ]; do
  # Check if tursodb died early
  if ! kill -0 $TURSO_PID 2>/dev/null; then
    echo "✗ tursodb process died unexpectedly (after ${COUNT} attempts)!"
    exit 1
  fi

  # Try to connect to the port
  if nc -z 127.0.0.1 8085 > /dev/null 2>&1; then
    HEALTHY=1
    echo "✓ Turso sync server is listening on :8085!"
    break
  fi

  COUNT=$((COUNT + 1))
  echo "  [${COUNT}/${MAX_WAIT}] Waiting for tursodb..."
  sleep 0.5
done

if [ $HEALTHY -eq 0 ]; then
  echo "✗ Timed out waiting for tursodb after ${MAX_WAIT} attempts."
  kill $TURSO_PID 2>/dev/null || true
  exit 1
fi

echo ""
echo "Starting core storage-server..."
exec ./storage-server
