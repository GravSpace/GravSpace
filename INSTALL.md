# Binary Installation Guide

This guide explains how to install and use GravSpace binary releases.

## Quick Install

### Automated Installation (Linux/macOS)

The easiest way to install GravSpace is using the install script:

```bash
# Install latest version
curl -sSL https://raw.githubusercontent.com/gravspace/gravspace/master/install.sh | bash

# Install specific version
VERSION=1.0.0 curl -sSL https://raw.githubusercontent.com/gravspace/gravspace/master/install.sh | bash

# Install to custom directory
INSTALL_DIR=$HOME/.local/bin curl -sSL https://raw.githubusercontent.com/gravspace/gravspace/master/install.sh | bash
```

### Manual Installation

#### 1. Download Binary

Visit the [Releases page](https://github.com/gravspace/gravspace/releases) and download the appropriate binary for your platform:

**Linux:**
```bash
# AMD64 (x86_64)
wget https://github.com/gravspace/gravspace/releases/download/v1.0.0/gravspace-1.0.0-linux-amd64.tar.gz

# ARM64 (aarch64)
wget https://github.com/gravspace/gravspace/releases/download/v1.0.0/gravspace-1.0.0-linux-arm64.tar.gz
```

**macOS:**
```bash
# Intel (AMD64)
wget https://github.com/gravspace/gravspace/releases/download/v1.0.0/gravspace-1.0.0-darwin-amd64.tar.gz

# Apple Silicon (ARM64)
wget https://github.com/gravspace/gravspace/releases/download/v1.0.0/gravspace-1.0.0-darwin-arm64.tar.gz
```

**Windows:**
```powershell
# AMD64 only (ARM64 not supported due to SQLite compatibility)
Invoke-WebRequest -Uri "https://github.com/gravspace/gravspace/releases/download/v1.0.0/gravspace-1.0.0-windows-amd64.zip" -OutFile "gravspace.zip"
```

#### 2. Verify Checksum (Optional but Recommended)

```bash
# Download checksum file
wget https://github.com/gravspace/gravspace/releases/download/v1.0.0/gravspace-1.0.0-linux-amd64.tar.gz.sha256

# Verify
sha256sum -c gravspace-1.0.0-linux-amd64.tar.gz.sha256
```

#### 3. Extract and Install

**Linux/macOS:**
```bash
# Extract
tar xzf gravspace-1.0.0-linux-amd64.tar.gz

# Move to PATH
sudo mv gravspace-linux-amd64 /usr/local/bin/gravspace
sudo chmod +x /usr/local/bin/gravspace

# Or install to user directory (no sudo required)
mkdir -p ~/.local/bin
mv gravspace-linux-amd64 ~/.local/bin/gravspace
chmod +x ~/.local/bin/gravspace

# Add to PATH if not already (add to ~/.bashrc or ~/.zshrc)
export PATH="$HOME/.local/bin:$PATH"
```

**Windows:**
```powershell
# Extract
Expand-Archive -Path gravspace.zip -DestinationPath C:\gravspace

# Add to PATH
$env:Path += ";C:\gravspace"

# Make permanent (run as Administrator)
[Environment]::SetEnvironmentVariable("Path", $env:Path + ";C:\gravspace", [System.EnvironmentVariableTarget]::Machine)
```

## Usage

### Basic Commands

```bash
# Check version
gravspace --version
gravspace -v

# Run server with default settings
gravspace

# The server will start on :8080
```

### Configuration

GravSpace uses environment variables for configuration. Create a `.env` file or export variables:

```bash
# Required
export JWT_SECRET="your-secret-key"

# Optional
export CORS_ORIGINS="http://localhost:3000,https://yourdomain.com"
export DATABASE_URL="libsql://your-database.turso.io"
export DATABASE_AUTH_TOKEN="your-token"
export SSE_MASTER_KEY="your-encryption-key"

# Run with configuration
gravspace
```

Or use a systemd service (see below).

## Running as a Service

### Linux (systemd)

Create a systemd service file:

```bash
sudo nano /etc/systemd/system/gravspace.service
```

Add the following content:

```ini
[Unit]
Description=GravSpace S3 Object Storage
After=network.target

[Service]
Type=simple
User=gravspace
Group=gravspace
WorkingDirectory=/var/lib/gravspace
ExecStart=/usr/local/bin/gravspace
Restart=on-failure
RestartSec=5s

# Environment variables
Environment="JWT_SECRET=your-secret-key"
Environment="CORS_ORIGINS=*"
# Add more environment variables as needed

# Security
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/gravspace

[Install]
WantedBy=multi-user.target
```

Create user and directories:

```bash
# Create user
sudo useradd -r -s /bin/false gravspace

# Create directories
sudo mkdir -p /var/lib/gravspace/{data,db,logs}
sudo chown -R gravspace:gravspace /var/lib/gravspace
```

Enable and start service:

```bash
# Reload systemd
sudo systemctl daemon-reload

# Enable service
sudo systemctl enable gravspace

# Start service
sudo systemctl start gravspace

# Check status
sudo systemctl status gravspace

# View logs
sudo journalctl -u gravspace -f
```

### macOS (launchd)

Create a launch agent:

```bash
nano ~/Library/LaunchAgents/com.gravspace.server.plist
```

Add the following content:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.gravspace.server</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/gravspace</string>
    </array>
    <key>EnvironmentVariables</key>
    <dict>
        <key>JWT_SECRET</key>
        <string>your-secret-key</string>
        <key>CORS_ORIGINS</key>
        <string>*</string>
    </dict>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/usr/local/var/log/gravspace.log</string>
    <key>StandardErrorPath</key>
    <string>/usr/local/var/log/gravspace.error.log</string>
</dict>
</plist>
```

Load and start:

```bash
# Load service
launchctl load ~/Library/LaunchAgents/com.gravspace.server.plist

# Start service
launchctl start com.gravspace.server

# Stop service
launchctl stop com.gravspace.server

# Unload service
launchctl unload ~/Library/LaunchAgents/com.gravspace.server.plist
```

### Windows (NSSM)

Use NSSM (Non-Sucking Service Manager) to run as a Windows service:

```powershell
# Download NSSM
Invoke-WebRequest -Uri "https://nssm.cc/release/nssm-2.24.zip" -OutFile "nssm.zip"
Expand-Archive -Path nssm.zip -DestinationPath C:\nssm

# Install service
C:\nssm\nssm-2.24\win64\nssm.exe install GravSpace C:\gravspace\gravspace.exe

# Set environment variables
C:\nssm\nssm-2.24\win64\nssm.exe set GravSpace AppEnvironmentExtra JWT_SECRET=your-secret-key

# Start service
Start-Service GravSpace

# Check status
Get-Service GravSpace
```

## Updating

### Using Install Script

```bash
# Update to latest version
curl -sSL https://raw.githubusercontent.com/gravspace/gravspace/master/install.sh | bash

# Update to specific version
VERSION=1.1.0 curl -sSL https://raw.githubusercontent.com/gravspace/gravspace/master/install.sh | bash
```

### Manual Update

1. Download new version
2. Stop the service
3. Replace the binary
4. Start the service

```bash
# Stop service
sudo systemctl stop gravspace

# Download and install new version
wget https://github.com/gravspace/gravspace/releases/download/v1.1.0/gravspace-1.1.0-linux-amd64.tar.gz
tar xzf gravspace-1.1.0-linux-amd64.tar.gz
sudo mv gravspace-linux-amd64 /usr/local/bin/gravspace
sudo chmod +x /usr/local/bin/gravspace

# Start service
sudo systemctl start gravspace

# Verify version
gravspace --version
```

## Uninstallation

### Remove Binary

```bash
# Linux/macOS
sudo rm /usr/local/bin/gravspace

# Or if installed to user directory
rm ~/.local/bin/gravspace
```

### Remove Service

**Linux:**
```bash
sudo systemctl stop gravspace
sudo systemctl disable gravspace
sudo rm /etc/systemd/system/gravspace.service
sudo systemctl daemon-reload
```

**macOS:**
```bash
launchctl unload ~/Library/LaunchAgents/com.gravspace.server.plist
rm ~/Library/LaunchAgents/com.gravspace.server.plist
```

**Windows:**
```powershell
Stop-Service GravSpace
C:\nssm\nssm-2.24\win64\nssm.exe remove GravSpace confirm
```

### Remove Data

```bash
# Linux
sudo rm -rf /var/lib/gravspace

# macOS
rm -rf ~/Library/Application\ Support/gravspace

# Windows
Remove-Item -Recurse -Force C:\ProgramData\gravspace
```

## Troubleshooting

### Binary Won't Run

**Permission denied:**
```bash
chmod +x /path/to/gravspace
```

**Command not found:**
```bash
# Check if binary is in PATH
which gravspace

# Add to PATH
export PATH="/usr/local/bin:$PATH"
```

### Port Already in Use

```bash
# Find process using port 8080
sudo lsof -i :8080

# Kill process
sudo kill -9 <PID>
```

### Service Won't Start

```bash
# Check logs
sudo journalctl -u gravspace -n 50

# Check service status
sudo systemctl status gravspace

# Check binary permissions
ls -l /usr/local/bin/gravspace
```

## Support

- **Documentation**: [README.md](../README.md)
- **Docker Deployment**: [DEPLOYMENT.md](../DEPLOYMENT.md)
- **Issues**: [GitHub Issues](https://github.com/gravspace/gravspace/issues)
- **Releases**: [GitHub Releases](https://github.com/gravspace/gravspace/releases)
