#!/bin/bash
set -e

# GravSpace Installer
# Usage: curl -sSL https://raw.githubusercontent.com/gravspace/gravspace/master/install.sh | bash
# Or: VERSION=1.0.0 ./install.sh

VERSION="${VERSION:-latest}"
INSTALL_DIR="${INSTALL_DIR:-/usr/local/bin}"
REPO="gravspace/gravspace"

echo "╔═══════════════════════════════════════╗"
echo "║     GravSpace Binary Installer        ║"
echo "╚═══════════════════════════════════════╝"
echo ""

# Detect OS and architecture
OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
ARCH="$(uname -m)"

case "$OS" in
  linux) OS="linux" ;;
  darwin) OS="darwin" ;;
  *) 
    echo "❌ Unsupported OS: $OS"
    echo "Supported: Linux, macOS"
    exit 1
    ;;
esac

case "$ARCH" in
  x86_64) ARCH="amd64" ;;
  aarch64|arm64) ARCH="arm64" ;;
  *) 
    echo "❌ Unsupported architecture: $ARCH"
    echo "Supported: amd64, arm64"
    echo ""
    echo "Note: ARMv7 is not supported due to SQLite compatibility"
    exit 1
    ;;
esac

PLATFORM="${OS}-${ARCH}"

echo "📦 Detected platform: ${PLATFORM}"
echo ""

# Get latest version if not specified
if [ "$VERSION" = "latest" ]; then
  echo "🔍 Fetching latest version..."
  VERSION=$(curl -s "https://api.github.com/repos/${REPO}/releases/latest" | grep '"tag_name":' | sed -E 's/.*"v([^"]+)".*/\1/')
  
  if [ -z "$VERSION" ]; then
    echo "❌ Failed to fetch latest version"
    exit 1
  fi
fi

echo "📥 Installing GravSpace v${VERSION}..."
echo ""

DOWNLOAD_URL="https://github.com/${REPO}/releases/download/v${VERSION}/gravspace-${VERSION}-${PLATFORM}.tar.gz"
CHECKSUM_URL="${DOWNLOAD_URL}.sha256"

# Create temporary directory
TMP_DIR=$(mktemp -d)
cd "$TMP_DIR"

# Download binary
echo "⬇️  Downloading from GitHub releases..."
if ! curl -fsSL "$DOWNLOAD_URL" -o gravspace.tar.gz; then
  echo "❌ Failed to download binary"
  echo "URL: $DOWNLOAD_URL"
  exit 1
fi

echo "⬇️  Downloading checksum..."
if ! curl -fsSL "$CHECKSUM_URL" -o gravspace.tar.gz.sha256; then
  echo "⚠️  Warning: Could not download checksum file"
else
  # Verify checksum
  echo "🔐 Verifying checksum..."
  if sha256sum -c gravspace.tar.gz.sha256 > /dev/null 2>&1; then
    echo "✓ Checksum verified"
  else
    echo "❌ Checksum verification failed"
    exit 1
  fi
fi

# Extract
echo "📦 Extracting archive..."
tar xzf gravspace.tar.gz

# Install
echo "📂 Installing to ${INSTALL_DIR}..."
if [ -w "$INSTALL_DIR" ]; then
  mv gravspace-${PLATFORM} "${INSTALL_DIR}/gravspace"
  chmod +x "${INSTALL_DIR}/gravspace"
else
  sudo mv gravspace-${PLATFORM} "${INSTALL_DIR}/gravspace"
  sudo chmod +x "${INSTALL_DIR}/gravspace"
fi

# Cleanup
cd - > /dev/null
rm -rf "$TMP_DIR"

echo ""
echo "╔═══════════════════════════════════════╗"
echo "║  ✓ Installation Complete!            ║"
echo "╚═══════════════════════════════════════╝"
echo ""
echo "GravSpace v${VERSION} installed to: ${INSTALL_DIR}/gravspace"
echo ""
echo "Quick start:"
echo "  1. Run server:    gravspace"
echo "  2. Check version: gravspace --version"
echo "  3. Get help:      gravspace --help"
echo ""
echo "Documentation: https://github.com/${REPO}"
echo ""
