#!/bin/bash
set -e

echo "=========================================="
echo "🚀 Updating XPharma Admin & Backend on VPS"
echo "=========================================="

cd /var/www/xpharma/repo || cd "$(dirname "$0")"

echo "📥 Pulling latest updates from GitHub..."
git pull origin main

echo "🗄️ Applying database migrations..."
sudo -u postgres psql -d xpharma_db -f backend/migrations/0012_optimize_invoice_items_indexes.sql || true

echo "⚙️ Building Go backend..."
cd backend
go build -o /var/www/xpharma/xpharma-server cmd/server/main.go || go build -o xpharma-server cmd/server/main.go || true
sudo systemctl restart xpharma-backend 2>/dev/null || systemctl restart xpharma-backend 2>/dev/null || true
cd ..

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
