#!/bin/sh
set -e

echo "=== GravSpace Startup (Embedded Turso Engine) ==="
mkdir -p /app/db /app/data /app/logs

echo "Starting core storage-server..."
exec ./storage-server
