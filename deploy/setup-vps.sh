#!/bin/bash
# CatchAndRun VPS Setup Script
# Run this ON the VPS after first SSH login

set -e

echo "=== CatchAndRun VPS Setup ==="

# Update system
echo "[1/6] Updating system..."
apt update && apt upgrade -y

# Install Node.js 20
echo "[2/6] Installing Node.js 20..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# Install Nginx
echo "[3/6] Installing Nginx..."
apt install -y nginx

# Install Git
echo "[4/6] Installing Git..."
apt install -y git

# Install PM2 (process manager)
echo "[5/6] Installing PM2..."
npm install -g pm2

# Open firewall ports
echo "[6/6] Configuring firewall..."
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 2567/tcp
ufw --force enable

echo ""
echo "=== Setup Complete ==="
echo "Next: clone your repo and run deploy.sh"
echo ""
