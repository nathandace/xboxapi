#!/bin/bash

# pi-deploy-dotnet.sh - Deploy .NET Xbox API to Raspberry Pi
#
# ===============================================================================
# RASPBERRY PI INITIAL SETUP (run these commands on your Pi BEFORE deployment):
# ===============================================================================
#
# 1. Update system
# sudo apt update && sudo apt upgrade -y
#
# 2. Install essentials
# sudo apt install -y curl wget git htop nano build-essential
#
# 3. Install .NET 9 Runtime (ARM64)
# curl -sSL https://dot.net/v1/dotnet-install.sh | bash /dev/stdin --channel 9.0 --runtime aspnetcore
# echo 'export PATH=$PATH:$HOME/.dotnet' >> ~/.bashrc
# source ~/.bashrc
#
# 4. Install systemd service helper
# sudo apt install -y systemd
#
# 5. Create directories
# mkdir -p /home/admin/xbox-api-dotnet
# mkdir -p /home/admin/logs
#
# 6. Verify .NET installation
# dotnet --info
#
# 7. Optional but recommended: Set up SSH keys for passwordless deployment
#    On your local machine, run: ssh-copy-id admin@YOUR_PI_IP
#
# ===============================================================================
# DEPLOYMENT SCRIPT CONFIGURATION:
# ===============================================================================

# Configuration for your specific Pi
PI_USER="admin"                    # Default Pi username (change if different)
PI_HOST="localhost"          # Replace with your Pi's IP (e.g., 192.168.1.100)
PI_NAME="dev"             # Friendly name for your Pi (e.g., "living-room-pi")
PI_PATH="/home/admin/xbox-api-dotnet"     # Path where app will be deployed

# Validate configuration
if [ "$PI_HOST" = "YOUR_PI_IP_HERE" ]; then
    echo "❌ Please update PI_HOST with your Pi's IP address before running!"
    echo "   Edit this script and change PI_HOST=\"YOUR_PI_IP_HERE\" to your actual IP"
    echo "   Example: PI_HOST=\"192.168.1.100\""
    exit 1
fi

if [ "$PI_NAME" = "YOUR_PI_NAME" ]; then
    echo "❌ Please update PI_NAME with a friendly name for your Pi!"
    echo "   Edit this script and change PI_NAME=\"YOUR_PI_NAME\" to something descriptive"
    echo "   Example: PI_NAME=\"kitchen-pi\" or PI_NAME=\"dev\""
    exit 1
fi

echo "🚀 Deploying .NET Xbox API to '$PI_NAME' Raspberry Pi..."
echo "📍 Target: $PI_USER@$PI_HOST"
echo "📂 App structure: .NET 9 self-contained deployment"
echo ""
echo "⚠️  You will be prompted for the Pi password TWICE:"
echo "   1. When copying files (scp)"
echo "   2. When executing remote commands (ssh)"
echo ""
read -p "Press Enter to continue, or Ctrl+C to cancel..."

# Build and publish the .NET application
echo "🔨 Building .NET application for linux-arm64..."
cd XboxApi

# Clean previous builds
dotnet clean

# Publish self-contained for ARM64
dotnet publish -c Release -r linux-arm64 --self-contained true -p:PublishSingleFile=true -p:PublishTrimmed=false -o ./publish

if [ $? -ne 0 ]; then
    echo "❌ .NET publish failed"
    exit 1
fi

echo "✅ .NET application built successfully"

# Copy existing tokens.json and config.json if they exist
TOKENS_FOUND=false
CONFIG_FOUND=false

if [ -f "tokens.json" ]; then
    echo "✅ Including existing tokens.json"
    cp tokens.json ./publish/
    TOKENS_FOUND=true
elif [ -f "../../src/tokens.json" ]; then
    echo "✅ Including existing tokens.json from old location"
    cp ../../src/tokens.json ./publish/
    TOKENS_FOUND=true
fi

# Copy existing config.json if it exists
if [ -f "config.json" ]; then
    echo "✅ Including existing config.json"
    cp config.json ./publish/
    CONFIG_FOUND=true
fi

# Clean up any nested publish directory that might have been created during file copying
if [ -d "./publish/publish" ]; then
    echo "🧹 Cleaning up nested publish directory..."
    rm -rf ./publish/publish
fi

# Create deployment package
echo "📋 Creating deployment package..."
cd publish
tar -czf ../xbox-api-dotnet-deploy.tar.gz .
cd ..

if [ "$TOKENS_FOUND" = false ]; then
    echo "⚠️  No existing tokens.json found (users will need to re-authenticate)"
fi

if [ "$CONFIG_FOUND" = false ]; then
    echo "⚠️  No existing config.json found (cover art will be disabled)"
fi

# Copy to Pi
echo ""
echo "📤 Copying to $PI_NAME Pi..."
echo "🔐 Enter password when prompted:"
scp xbox-api-dotnet-deploy.tar.gz $PI_USER@$PI_HOST:/tmp/

# Deploy and setup on Pi
echo ""
echo "🔧 Setting up on $PI_NAME Pi..."
echo "🔐 Enter password again when prompted:"
ssh $PI_USER@$PI_HOST << ENDSSH

# Stop any existing service
sudo systemctl stop xbox-api-dotnet 2>/dev/null || true

# Create and setup app directory
mkdir -p $PI_PATH
mkdir -p /home/$PI_USER/logs
cd $PI_PATH

# Extract files
echo "📦 Extracting deployment package..."
tar -xzf /tmp/xbox-api-dotnet-deploy.tar.gz
rm /tmp/xbox-api-dotnet-deploy.tar.gz

# Debug: List all extracted files
echo "🔍 Files after extraction:"
ls -la

# Check if there's a nested publish directory
if [ -d "publish" ]; then
    echo "⚠️ Found nested publish directory, moving files up..."
    mv publish/* . 2>/dev/null || true
    mv publish/.* . 2>/dev/null || true
    rm -rf publish
    echo "🔍 Files after cleaning up nested directory:"
    ls -la
fi

# Make the executable actually executable
chmod +x XboxApi

# Verify files exist after extraction
if [ ! -f "XboxApi" ]; then
    echo "❌ XboxApi executable not found after extraction!"
    echo "🔍 Current directory contents:"
    ls -la
    exit 1
fi

# Debug: Check file permissions and type
echo "🔍 Checking XboxApi executable:"
ls -la XboxApi
file XboxApi
echo "🔍 Testing if file is executable:"
if [ -x XboxApi ]; then
    echo "✅ File has execute permissions"
else
    echo "❌ File does NOT have execute permissions"
fi

# Test if we can run the executable (with timeout)
echo "🔍 Testing executable startup (will timeout after 3 seconds):"
timeout 3s ./XboxApi 2>&1 | head -5 || echo "✅ Executable starts correctly (timed out as expected)"

# Check tokens.json status
if [ -f "tokens.json" ]; then
    echo "✅ tokens.json deployed successfully"
    # Show how many users are in tokens.json (without showing sensitive data)
    if command -v jq >/dev/null 2>&1; then
        TOKEN_COUNT=\$(jq 'keys | length' tokens.json 2>/dev/null || echo "unknown")
        echo "📊 Found tokens for \$TOKEN_COUNT users"
    else
        echo "📊 tokens.json file is present"
    fi
else
    echo "⚠️  No tokens.json found - users will need to authenticate"
fi

# Check config.json status
if [ -f "config.json" ]; then
    echo "✅ config.json deployed successfully"
    # Show if cover art is enabled (without showing sensitive data)
    if command -v jq >/dev/null 2>&1; then
        COVER_ART_ENABLED=\$(jq -r '.EnableCoverArt // false' config.json 2>/dev/null || echo "false")
        if [ "\$COVER_ART_ENABLED" = "true" ]; then
            echo "📊 Cover art is enabled"
        else
            echo "📊 Cover art is disabled"
        fi
    else
        echo "📊 config.json file is present"
    fi
else
    echo "⚠️  No config.json found - cover art will be disabled"
fi

echo "✅ Application files verified on Pi"

# Create systemd service
echo "📝 Creating systemd service..."
sudo tee /etc/systemd/system/xbox-api-dotnet.service > /dev/null << 'EOF'
[Unit]
Description=Xbox API .NET Service
After=network.target

[Service]
Type=simple
User=$PI_USER
Group=$PI_USER
WorkingDirectory=$PI_PATH
ExecStart=$PI_PATH/XboxApi
Restart=always
RestartSec=10
SyslogIdentifier=xbox-api-dotnet
Environment=ASPNETCORE_ENVIRONMENT=Production
Environment=DOTNET_PRINT_TELEMETRY_MESSAGE=false

# Resource limits
LimitNOFILE=65536
MemoryMax=200M

[Install]
WantedBy=multi-user.target
EOF

# Fix the service file to use actual variables
sudo sed -i "s|\\$PI_USER|$PI_USER|g" /etc/systemd/system/xbox-api-dotnet.service
sudo sed -i "s|\\$PI_PATH|$PI_PATH|g" /etc/systemd/system/xbox-api-dotnet.service

# Final verification before starting service
echo "🔍 Final verification before service start:"
pwd
ls -la XboxApi
echo "🔍 Full path to executable:"
realpath XboxApi

# Check what the service file actually contains
echo "🔍 Checking systemd service file contents:"
sudo cat /etc/systemd/system/xbox-api-dotnet.service

# Stop any existing service first
echo "🛑 Stopping any existing service..."
sudo systemctl stop xbox-api-dotnet 2>/dev/null || true

# Reload systemd and start service
echo "🚀 Starting Xbox API service..."
sudo systemctl daemon-reload
sudo systemctl enable xbox-api-dotnet
sleep 2
sudo systemctl start xbox-api-dotnet

# Wait for startup
echo "⏳ Waiting for service to start..."
sleep 5

# Check service status
if systemctl is-active --quiet xbox-api-dotnet; then
    echo "✅ Xbox API service is running!"
else
    echo "❌ Service failed to start. Checking logs..."
    sudo systemctl status xbox-api-dotnet --no-pager -l
    sudo journalctl -u xbox-api-dotnet --no-pager -l -n 20
    exit 1
fi

# Show status
echo ""
echo "📊 Service Status:"
sudo systemctl status xbox-api-dotnet --no-pager -l

echo ""
echo "📋 Recent logs:"
sudo journalctl -u xbox-api-dotnet --no-pager -l -n 10

echo ""
echo "✅ Deployment complete on '$PI_NAME' Pi!"
echo "🌐 Xbox API is running at: http://$PI_HOST:5000"
echo "🏠 Hostname: $PI_NAME"
echo "👤 User: $PI_USER"
echo ""
if [ -f "tokens.json" ]; then
    echo "🔐 Authentication tokens deployed - existing users should work immediately"
else
    echo "⚠️  No tokens deployed - users will need to authenticate via web interface"
fi
echo ""
echo "📋 Management commands:"
echo "   sudo systemctl status xbox-api-dotnet    - Check service status"
echo "   sudo journalctl -u xbox-api-dotnet -f    - Follow logs"
echo "   sudo systemctl restart xbox-api-dotnet   - Restart service"
echo "   sudo systemctl stop xbox-api-dotnet      - Stop service"

ENDSSH

# Clean up local temp file
rm xbox-api-dotnet-deploy.tar.gz

echo ""
echo "🎉 .NET Xbox API deployed successfully to '$PI_NAME' Pi!"
echo "🔗 Access your API at: http://$PI_HOST:5000"
echo "📊 Health check: http://$PI_HOST:5000/health"
echo "🎮 Xbox status: http://$PI_HOST:5000/xbox/status"
echo "📖 API Documentation: http://$PI_HOST:5000 (Swagger UI)"
echo ""
echo "📋 SSH to your Pi:"
echo "   ssh $PI_USER@$PI_HOST"
echo ""
echo "💡 Tip: Set up SSH keys to avoid password prompts in future deployments!"
echo ""
