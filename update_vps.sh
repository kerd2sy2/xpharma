#!/bin/bash
set -e

echo "=========================================="
echo "🚀 Updating XPharma Admin & Backend on VPS"
echo "=========================================="

cd /var/www/xpharma/repo || cd "$(dirname "$0")"

echo "📥 Pulling latest updates from GitHub..."
git pull origin main

echo "📦 Building web-admin Next.js frontend..."
cd web-admin
npm install --production=false
npm run build

echo "🔄 Restarting web-admin service..."
if command -v pm2 &> /dev/null; then
    pm2 restart all || pm2 start npm --name "xpharma-web" -- start
elif systemctl is-active --quiet xpharma-web; then
    systemctl restart xpharma-web
fi

echo "✅ Update completed successfully!"
