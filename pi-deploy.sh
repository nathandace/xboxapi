#!/bin/bash

# pi-deploy.sh - Complete deployment to 'dev' Raspberry Pi

# Configuration for your specific Pi
PI_USER="admin"
PI_HOST="192.168.1.10"
PI_NAME="dev"
PI_PATH="/home/admin/xbox-api"

echo "🚀 Deploying Xbox API to '$PI_NAME' Raspberry Pi..."
echo "📍 Target: $PI_USER@$PI_HOST"
echo "📂 App structure: src/index.ts + src/public/ + tokens.json"
echo ""
echo "⚠️  You will be prompted for the Pi password TWICE:"
echo "   1. When copying files (scp)"
echo "   2. When executing remote commands (ssh)"
echo ""
read -p "Press Enter to continue, or Ctrl+C to cancel..."

# Install dependencies locally to make sure everything is up to date
echo "📦 Installing dependencies locally..."
npm install
if [ $? -ne 0 ]; then
    echo "❌ npm install failed"
    exit 1
fi

# Verify source files exist
if [ ! -f "src/index.ts" ]; then
    echo "❌ src/index.ts not found"
    exit 1
fi

if [ ! -f "src/public/index.html" ]; then
    echo "❌ src/public/index.html not found"
    exit 1
fi

# Check if tokens.json exists locally
if [ -f "tokens.json" ]; then
    echo "✅ Including tokens.json in deployment"
else
    echo "⚠️  No tokens.json found locally (users will need to re-authenticate)"
fi

echo "✅ Source files verified"

# Create deployment package with source files INCLUDING tokens.json
echo "📋 Creating deployment package (including tokens.json)..."
tar --exclude='node_modules' \
    --exclude='.git' \
    --exclude='*.log' \
    --exclude='.env' \
    --exclude='deploy*.sh' \
    --exclude='.vs' \
    --exclude='dist' \
    -czf xbox-api-deploy.tar.gz .

# Copy to Pi
echo ""
echo "📤 Copying to $PI_NAME Pi..."
echo "🔐 Enter password when prompted:"
scp xbox-api-deploy.tar.gz $PI_USER@$PI_HOST:/tmp/

# Deploy and setup on Pi
echo ""
echo "🔧 Setting up on $PI_NAME Pi..."
echo "🔐 Enter password again when prompted:"
ssh $PI_USER@$PI_HOST << 'ENDSSH'

# Stop any existing PM2 processes
pm2 stop xbox-api 2>/dev/null || true
pm2 delete xbox-api 2>/dev/null || true

# Create and setup app directory
mkdir -p /home/admin/xbox-api
mkdir -p /home/admin/logs
cd /home/admin/xbox-api

# Extract files (this will overwrite everything including tokens.json)
echo "📦 Extracting deployment package..."
tar -xzf /tmp/xbox-api-deploy.tar.gz
rm /tmp/xbox-api-deploy.tar.gz

# Install dependencies including TypeScript (needed for ts-node)
echo "📦 Installing dependencies (including TypeScript)..."
npm install
if [ $? -ne 0 ]; then
    echo "❌ npm install failed on Pi"
    exit 1
fi

# Verify source files exist after extraction
if [ ! -f "src/index.ts" ]; then
    echo "❌ src/index.ts not found after extraction!"
    ls -la
    exit 1
fi

if [ ! -f "src/public/index.html" ]; then
    echo "❌ src/public/index.html not found after extraction!"
    ls -la src/
    exit 1
fi

# Check tokens.json status
if [ -f "tokens.json" ]; then
    echo "✅ tokens.json deployed successfully"
    # Show how many users are in tokens.json (without showing sensitive data)
    if command -v jq >/dev/null 2>&1; then
        TOKEN_COUNT=$(jq 'keys | length' tokens.json 2>/dev/null || echo "unknown")
        echo "📊 Found tokens for $TOKEN_COUNT users"
    else
        echo "📊 tokens.json file is present"
    fi
else
    echo "⚠️  No tokens.json found - users will need to authenticate"
fi

echo "✅ Source files verified on Pi"

# Create PM2 ecosystem file to run TypeScript directly
cat > ecosystem.config.js << 'EOF'
module.exports = {
  apps: [{
    name: 'xbox-api',
    script: 'src/index.ts',
    interpreter: 'node',
    interpreter_args: '--loader=ts-node/esm',
    cwd: '/home/admin/xbox-api',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '200M',
    env: {
      NODE_ENV: 'production',
      PORT: 3000,
      HOST: '0.0.0.0',
      TS_NODE_PROJECT: 'tsconfig.json'
    },
    error_file: '/home/admin/logs/xbox-api-error.log',
    out_file: '/home/admin/logs/xbox-api-out.log',
    log_file: '/home/admin/logs/xbox-api-combined.log',
    time: true,
    // Restart policy
    exp_backoff_restart_delay: 100,
    max_restarts: 10,
    min_uptime: '10s'
  }]
};
EOF

# Alternative: Try ts-node directly if the above doesn't work
cat > ecosystem-fallback.config.js << 'EOF'
module.exports = {
  apps: [{
    name: 'xbox-api',
    script: './node_modules/.bin/ts-node',
    args: 'src/index.ts',
    cwd: '/home/admin/xbox-api',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '200M',
    env: {
      NODE_ENV: 'production',
      PORT: 3000,
      HOST: '0.0.0.0'
    },
    error_file: '/home/admin/logs/xbox-api-error.log',
    out_file: '/home/admin/logs/xbox-api-out.log',
    log_file: '/home/admin/logs/xbox-api-combined.log',
    time: true,
    exp_backoff_restart_delay: 100,
    max_restarts: 10,
    min_uptime: '10s'
  }]
};
EOF

# Try to start with the main config first
echo "🚀 Starting Xbox API with PM2 (TypeScript)..."
pm2 start ecosystem.config.js

# Check if it started successfully
sleep 3
if pm2 list | grep -q "xbox-api.*online"; then
    echo "✅ Started successfully with main config"
else
    echo "⚠️ Main config failed, trying fallback..."
    pm2 delete xbox-api 2>/dev/null || true
    pm2 start ecosystem-fallback.config.js
    sleep 3
    if pm2 list | grep -q "xbox-api.*online"; then
        echo "✅ Started successfully with fallback config"
    else
        echo "❌ Both configs failed. Checking logs..."
        pm2 logs xbox-api --lines 10
        exit 1
    fi
fi

pm2 save

# Show status
echo ""
echo "📊 PM2 Status:"
pm2 status

echo ""
echo "📋 Recent logs:"
pm2 logs xbox-api --lines 5

echo ""
echo "✅ Deployment complete on '$PI_NAME' Pi!"
echo "🌐 Xbox API is running at: http://192.168.1.10:3000"
echo "🏠 Hostname: dev"
echo "👤 User: admin"
echo ""
if [ -f "tokens.json" ]; then
    echo "🔐 Authentication tokens deployed - existing users should work immediately"
else
    echo "⚠️  No tokens deployed - users will need to authenticate via web interface"
fi
echo ""
echo "📋 Management commands:"
echo "   pm2 status           - Check app status"
echo "   pm2 logs xbox-api    - View logs"
echo "   pm2 restart xbox-api - Restart app"
echo "   pm2 stop xbox-api    - Stop app"
echo "   pm2 monit           - Real-time monitoring"

ENDSSH

# Clean up local temp file
rm xbox-api-deploy.tar.gz

echo ""
echo "🎉 Xbox API deployed successfully to 'dev' Pi!"
echo "🔗 Access your API at: http://192.168.1.10:3000"
echo "📊 Health check: http://192.168.1.10:3000/health"
echo "🎮 Xbox status: http://192.168.1.10:3000/xbox/status"
echo ""
echo "📋 SSH to your Pi:"
echo "   ssh admin@192.168.1.10"
echo ""
echo "💡 Tip: Your family's authentication tokens are now deployed!"
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '200M',
    env: {
      NODE_ENV: 'production',
      PORT: 3000,
      HOST: '0.0.0.0'
    },
    error_file: '/home/admin/logs/xbox-api-error.log',
    out_file: '/home/admin/logs/xbox-api-out.log',
    log_file: '/home/admin/logs/xbox-api-combined.log',
    time: true,
    // Restart policy
    exp_backoff_restart_delay: 100,
    max_restarts: 10,
    min_uptime: '10s'
  }]
};
EOF

# Start the application with PM2
echo "🚀 Starting Xbox API with PM2..."
pm2 start ecosystem.config.js
pm2 save

# Show status
echo ""
echo "📊 PM2 Status:"
pm2 status

echo ""
echo "📋 Recent logs:"
pm2 logs xbox-api --lines 5

echo ""
echo "✅ Deployment complete on '$PI_NAME' Pi!"
echo "🌐 Xbox API is running at: http://192.168.1.10:3000"
echo "🏠 Hostname: dev"
echo "👤 User: admin"
echo ""
echo "📋 Management commands:"
echo "   pm2 status           - Check app status"
echo "   pm2 logs xbox-api    - View logs"
echo "   pm2 restart xbox-api - Restart app"
echo "   pm2 stop xbox-api    - Stop app"
echo "   pm2 monit           - Real-time monitoring"

ENDSSH

# Clean up local temp file
rm xbox-api-deploy.tar.gz

echo ""
echo "🎉 Xbox API deployed successfully to 'dev' Pi!"
echo "🔗 Access your API at: http://192.168.1.10:3000"
echo "📊 Health check: http://192.168.1.10:3000/health"
echo "🎮 Xbox status: http://192.168.1.10:3000/xbox/status"
echo ""
echo "📋 SSH to your Pi:"
echo "   ssh admin@192.168.1.10"
echo ""
echo "💡 Tip: Run './setup-ssh-keys.sh' to avoid password prompts in future deployments!"
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '200M',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    error_file: '/home/admin/logs/xbox-api-error.log',
    out_file: '/home/admin/logs/xbox-api-out.log',
    log_file: '/home/admin/logs/xbox-api-combined.log',
    time: true,
    // Restart policy
    exp_backoff_restart_delay: 100,
    max_restarts: 10,
    min_uptime: '10s'
  }]
};
EOF

# Start the application with PM2
echo "🚀 Starting Xbox API with PM2..."
pm2 start ecosystem.config.js
pm2 save

# Show status
echo ""
echo "📊 PM2 Status:"
pm2 status

echo ""
echo "📋 Recent logs:"
pm2 logs xbox-api --lines 5

echo ""
echo "✅ Deployment complete on '$PI_NAME' Pi!"
echo "🌐 Xbox API is running at: http://192.168.1.10:3000"
echo "🏠 Hostname: dev"
echo "👤 User: admin"
echo ""
echo "📋 Management commands:"
echo "   pm2 status           - Check app status"
echo "   pm2 logs xbox-api    - View logs"
echo "   pm2 restart xbox-api - Restart app"
echo "   pm2 stop xbox-api    - Stop app"
echo "   pm2 monit           - Real-time monitoring"

ENDSSH

# Clean up local temp file
rm xbox-api-deploy.tar.gz

echo ""
echo "🎉 Xbox API deployed successfully to 'dev' Pi!"
echo "🔗 Access your API at: http://192.168.1.10:3000"
echo "📊 Health check: http://192.168.1.10:3000/health"
echo "🎮 Xbox status: http://192.168.1.10:3000/xbox/status"
echo ""
echo "📋 SSH to your Pi:"
echo "   ssh admin@192.168.1.10"