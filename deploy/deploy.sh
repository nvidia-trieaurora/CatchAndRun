#!/bin/bash
# CatchAndRun Deploy Script
# Run this ON the VPS to build and deploy

set -e

VPS_IP="14.225.205.84"
APP_DIR="/opt/catchandrun"
CLIENT_DIR="/var/www/catchandrun"

echo "=== CatchAndRun Deploy ==="

cd "$APP_DIR"

# Pull latest code
echo "[1/5] Pulling latest code..."
git pull origin main

# Install dependencies
echo "[2/5] Installing dependencies..."
npm ci

# Build everything (shared -> server -> client)
echo "[3/5] Building..."
VITE_SERVER_URL="ws://${VPS_IP}:2567" npm run build

# Copy client files to Nginx web root
echo "[4/5] Deploying client..."
rm -rf "$CLIENT_DIR"
mkdir -p "$CLIENT_DIR"
cp -r client/dist/* "$CLIENT_DIR/"

# Restart server with PM2
echo "[5/5] Restarting server..."
cd server
pm2 stop catchandrun 2>/dev/null || true
pm2 start dist/index.js --name catchandrun --env production
pm2 save
cd ..

# Reload Nginx
nginx -t && systemctl reload nginx

echo ""
echo "=== Deploy Complete ==="
echo "Game URL: http://${VPS_IP}"
echo "Server:   ws://${VPS_IP}:2567"
echo "Health:   http://${VPS_IP}/health"
echo ""
