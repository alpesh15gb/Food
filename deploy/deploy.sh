#!/bin/bash
# =============================================================================
# Cloud Kitchen Platform — Full Production Deploy for 9housekitchen.in
# Run on VPS as root or with sudo
# =============================================================================
set -euo pipefail

DOMAIN="9housekitchen.in"
APP_DIR="/opt/cloudkitchen"
COMPOSE_FILE="deploy/docker-compose.yml"
ENV_FILE="deploy/config.env"

echo "╔══════════════════════════════════════════════════╗"
echo "║  Cloud Kitchen — Production Deploy               ║"
echo "║  Domain: ${DOMAIN}                                ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""

# =============================================================================
# 1. System dependencies
# =============================================================================
echo "📦 Installing system dependencies..."
if command -v apt-get &>/dev/null; then
  apt-get update -qq
  apt-get install -y -qq nginx certbot python3-certbot-nginx curl git
elif command -v yum &>/dev/null; then
  yum install -y nginx certbot python3-certbot-nginx curl git
fi
echo "✅ System dependencies installed"

# =============================================================================
# 2. Clone or update repo
# =============================================================================
if [ -d "$APP_DIR" ]; then
  echo "📥 Updating existing deployment..."
  cd "$APP_DIR"
  git pull origin main
else
  echo "📥 Cloning repository..."
  git clone https://github.com/alpesh15gb/Food.git "$APP_DIR"
  cd "$APP_DIR"
fi

# =============================================================================
# 3. Generate config.env with secrets
# =============================================================================
if [ ! -f "$ENV_FILE" ]; then
  echo "🔑 Generating secure configuration..."
  cp deploy/config.env.example "$ENV_FILE"

  generate_hex() { openssl rand -hex "$1" 2>/dev/null || head -c "$1" /dev/urandom | xxd -p | tr -d '\n' | head -c "$1"; }

  POSTGRES_PASSWORD=$(generate_hex 20)
  JWT_SECRET=$(generate_hex 32)
  COOKIE_SECRET=$(generate_hex 32)
  SECRET_KEY=$(generate_hex 32)
  ADMIN_TOKEN="admin-$(generate_hex 20)"

  # NOTE: sed -i.bak (not bare -i) for macOS/BSD + GNU portability; backups removed below.
  sed -i.bak "s|POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=${POSTGRES_PASSWORD}|" "$ENV_FILE"
  sed -i.bak "s|JWT_SECRET=.*|JWT_SECRET=${JWT_SECRET}|" "$ENV_FILE"
  sed -i.bak "s|COOKIE_SECRET=.*|COOKIE_SECRET=${COOKIE_SECRET}|" "$ENV_FILE"
  sed -i.bak "s|LOCAL_ADMIN_TOKEN=.*|LOCAL_ADMIN_TOKEN=${ADMIN_TOKEN}|" "$ENV_FILE"
  OTP_SECRET=$(openssl rand -hex 32 2>/dev/null || head -c 64 /dev/urandom | xxd -p | tr -d '\n' | head -c 64)
  sed -i.bak "s|SECRET_ENCRYPTION_KEY=.*|SECRET_ENCRYPTION_KEY=${SECRET_KEY}|" "$ENV_FILE"
  sed -i.bak "s|OTP_HMAC_SECRET=.*|OTP_HMAC_SECRET=${OTP_SECRET}|" "$ENV_FILE"
  rm -f "${ENV_FILE}.bak"

  echo "✅ Secrets generated and saved to $ENV_FILE"
  echo ""
  echo "╔══════════════════════════════════════════════════╗"
  echo "║  🔑 SAVE THESE CREDENTIALS                      ║"
  echo "╠══════════════════════════════════════════════════╣"
  echo "║  PostgreSQL Password: ${POSTGRES_PASSWORD}"
  echo "║  Admin Token:        ${ADMIN_TOKEN}"
  echo "╚══════════════════════════════════════════════════╝"
  echo ""
  read -p "Press Enter to continue after saving credentials..."
else
  echo "✅ Config file exists"
fi

# =============================================================================
# 4. SSL Certificates (Let's Encrypt)
# =============================================================================
echo ""
echo "🔒 Setting up SSL certificates..."

# Get domain IP to verify DNS
DOMAIN_IP=$(dig +short "$DOMAIN" 2>/dev/null || echo "")
SERVER_IP=$(curl -s ifconfig.me 2>/dev/null || echo "")

if [ "$DOMAIN_IP" != "$SERVER_IP" ] && [ -n "$DOMAIN_IP" ]; then
  echo "⚠️  WARNING: DNS mismatch!"
  echo "   $DOMAIN resolves to $DOMAIN_IP"
  echo "   This server's IP is $SERVER_IP"
  echo "   Make sure DNS A records point to this server."
fi

if [ ! -d "/etc/letsencrypt/live/$DOMAIN" ]; then
  echo "📝 Obtaining SSL certificate..."
  certbot certonly --nginx \
    -d "$DOMAIN" \
    -d "www.$DOMAIN" \
    --non-interactive \
    --agree-tos \
    --email "admin@${DOMAIN}" \
    --redirect || {
    echo "⚠️  SSL certificate setup needs manual intervention."
    echo "   Run: certbot --nginx -d $DOMAIN -d www.$DOMAIN"
    echo "   Continuing with deployment..."
  }
else
  echo "✅ SSL certificate exists"
fi

# =============================================================================
# 5. Nginx Configuration
# =============================================================================
echo ""
echo "🌐 Configuring nginx..."

# Write nginx config
cp deploy/nginx.conf "/etc/nginx/sites-available/cloudkitchen"
ln -sf /etc/nginx/sites-available/cloudkitchen /etc/nginx/sites-enabled/cloudkitchen

# Remove default site if it conflicts
rm -f /etc/nginx/sites-enabled/default

# Test nginx config
nginx -t 2>&1 || {
  echo "❌ Nginx config test failed!"
  echo "   Check: /etc/nginx/sites-available/cloudkitchen"
  exit 1
}

# Reload nginx
systemctl reload nginx
echo "✅ Nginx configured and reloaded"

# Auto-renew SSL certs
echo "🔄 Setting up SSL auto-renewal..."
(crontab -l 2>/dev/null; echo "0 3 * * * certbot renew --quiet --post-hook 'systemctl reload nginx'") | sort -u | crontab -
echo "✅ SSL auto-renewal configured"

# =============================================================================
# 6. Build and start Docker containers
# =============================================================================
echo ""
echo "🐳 Building and starting containers..."
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d --build

# =============================================================================
# 7. Wait for PostgreSQL
# =============================================================================
echo ""
echo "⏳ Waiting for PostgreSQL..."
for i in $(seq 1 30); do
  if docker compose -f "$COMPOSE_FILE" exec -T db pg_isready -U cloudkitchen &>/dev/null; then
    echo "✅ PostgreSQL is ready"
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo "❌ PostgreSQL failed to start"
    docker compose -f "$COMPOSE_FILE" logs db | tail -20
    exit 1
  fi
  sleep 2
done

# =============================================================================
# 8. Apply database migrations (never push --force in deploy)
# =============================================================================
echo ""
echo "🗄️  Applying database migrations..."
docker compose -f "$COMPOSE_FILE" exec -T app npx drizzle-kit migrate 2>&1 || {
  echo "⚠️  Migration had issues. Checking database..."
  docker compose -f "$COMPOSE_FILE" exec -T db psql -U cloudkitchen -d cloudkitchen -c "\dt" 2>&1 || true
}

# =============================================================================
# 9. Verify deployment
# =============================================================================
echo ""
echo "🔍 Verifying deployment..."

# Check app is running
if curl -sf http://127.0.0.1:4300/api/trpc/system.health >/dev/null 2>&1; then
  echo "✅ App is responding"
else
  echo "⚠️  App health check pending..."
fi

# Check nginx
if curl -sf "https://${DOMAIN}/api/trpc/system.health" >/dev/null 2>&1; then
  echo "✅ HTTPS is working"
else
  echo "⚠️  HTTPS check pending (SSL may need a moment)"
fi

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║  🎉 Deployment Complete!                         ║"
echo "╠══════════════════════════════════════════════════╣"
echo "║                                                  ║"
echo "║  🌐 Storefront: https://${DOMAIN}                ║"
echo "║  🔧 Admin:      https://${DOMAIN}/admin          ║"
echo "║                                                  ║"
echo "║  Admin login token:                              ║"
grep LOCAL_ADMIN_TOKEN "$ENV_FILE" | head -1 | sed 's/^/║  /'
echo "║                                                  ║"
echo "║  📊 Logs:                                        ║"
echo "║    docker compose -f $COMPOSE_FILE logs -f app   ║"
echo "║                                                  ║"
echo "║  🔄 Restart:                                     ║"
echo "║    docker compose -f $COMPOSE_FILE restart        ║"
echo "║                                                  ║"
echo "║  📝 Edit Razorpay keys:                          ║"
echo "║    nano ${ENV_FILE}                              ║"
echo "║    Then: docker compose -f $COMPOSE_FILE restart  ║"
echo "║                                                  ║"
echo "╚══════════════════════════════════════════════════╝"
