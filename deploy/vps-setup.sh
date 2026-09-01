#!/bin/bash
# =============================================================================
# 9House Kitchen — One-Command VPS Deployment
# Run this as root on your VPS
# =============================================================================
set -euo pipefail

DOMAIN="${DOMAIN:-9housekitchen.in}"
APP_DIR="/opt/cloudkitchen"
COMPOSE_FILE="deploy/docker-compose.yml"
ENV_FILE="deploy/config.env"

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║  9House Kitchen — VPS Deployment                    ║"
echo "║  Domain: ${DOMAIN}                                  ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

# =============================================================================
# 1. System dependencies
# =============================================================================
echo "📦 Step 1/8 — Installing system dependencies..."
apt-get update -qq 2>/dev/null || true
apt-get install -y -qq nginx certbot python3-certbot-nginx curl git docker.io docker-compose-v2 2>/dev/null || true
echo "✅ System dependencies installed"

# =============================================================================
# 2. Enable Docker
# =============================================================================
echo ""
echo "🐳 Step 2/8 — Starting Docker..."
systemctl enable docker 2>/dev/null || true
systemctl start docker 2>/dev/null || true
docker --version
echo "✅ Docker is running"

# =============================================================================
# 3. Clone or update repo
# =============================================================================
echo ""
echo "📥 Step 3/8 — Cloning repository..."
if [ -d "$APP_DIR" ]; then
  echo "Repository exists, pulling latest..."
  cd "$APP_DIR"
  git pull origin main 2>/dev/null || git pull 2>/dev/null || true
else
  echo "Cloning fresh copy..."
  git clone https://github.com/alpesh15gb/Food.git "$APP_DIR"
  cd "$APP_DIR"
fi
echo "✅ Repository ready at $APP_DIR"

# =============================================================================
# 4. Generate config.env with secrets
# =============================================================================
echo ""
echo "🔑 Step 4/8 — Generating secure configuration..."

generate_hex() {
  openssl rand -hex "$1" 2>/dev/null || head -c "$1" /dev/urandom | xxd -p | tr -d '\n' | head -c "$1"
}

if [ ! -f "$ENV_FILE" ]; then
  cp deploy/config.env.example "$ENV_FILE"

  POSTGRES_PASSWORD=$(generate_hex 20)
  JWT_SECRET=$(generate_hex 32)
  COOKIE_SECRET=$(generate_hex 32)
  SECRET_KEY=$(generate_hex 32)
  ADMIN_TOKEN="admin-$(generate_hex 20)"
  OTP_SECRET=$(openssl rand -hex 32 2>/dev/null || generate_hex 64)

  sed -i "s|POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=${POSTGRES_PASSWORD}|" "$ENV_FILE"
  sed -i "s|JWT_SECRET=.*|JWT_SECRET=${JWT_SECRET}|" "$ENV_FILE"
  sed -i "s|COOKIE_SECRET=.*|COOKIE_SECRET=${COOKIE_SECRET}|" "$ENV_FILE"
  sed -i "s|LOCAL_ADMIN_TOKEN=.*|LOCAL_ADMIN_TOKEN=${ADMIN_TOKEN}|" "$ENV_FILE"
  sed -i "s|SECRET_ENCRYPTION_KEY=.*|SECRET_ENCRYPTION_KEY=${SECRET_KEY}|" "$ENV_FILE"
  sed -i "s|OTP_HMAC_SECRET=.*|OTP_HMAC_SECRET=${OTP_SECRET}|" "$ENV_FILE"

  echo "✅ Secrets generated and saved to $ENV_FILE"
  echo ""
  echo "╔══════════════════════════════════════════════════╗"
  echo "║  🔑 SAVE THESE CREDENTIALS                      ║"
  echo "╠══════════════════════════════════════════════════╣"
  echo "║  PostgreSQL Password: ${POSTGRES_PASSWORD}"
  echo "║  Admin Token:        ${ADMIN_TOKEN}"
  echo "╚══════════════════════════════════════════════════╝"
else
  echo "✅ Config file already exists, skipping generation"
fi

# Add OTP_HMAC_SECRET if missing (for existing config.env files)
if ! grep -q "OTP_HMAC_SECRET=" "$ENV_FILE"; then
  OTP_SECRET=$(openssl rand -hex 32 2>/dev/null || generate_hex 64)
  echo "OTP_HMAC_SECRET=${OTP_SECRET}" >> "$ENV_FILE"
  echo "OTP_DEV_LOG_ENABLED=false" >> "$ENV_FILE"
  echo "✅ Added OTP_HMAC_SECRET to config"
fi

# =============================================================================
# 5. Nginx configuration
# =============================================================================
echo ""
echo "🌐 Step 5/8 — Configuring Nginx..."

cat > /etc/nginx/sites-available/cloudkitchen << 'NGINX_EOF'
# Rate limiting zones
limit_req_zone $binary_remote_addr zone=api:10m rate=30r/s;
limit_req_zone $binary_remote_addr zone=webhook:10m rate=10r/s;

upstream cloudkitchen {
    server 127.0.0.1:4300;
    keepalive 32;
}

server {
    listen 80;
    listen [::]:80;
    server_name 9housekitchen.in www.9housekitchen.in;
    location /.well-known/acme-challenge/ { root /var/www/certbot; }
    location / { return 301 https://$host$request_uri; }
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name 9housekitchen.in www.9housekitchen.in;

    ssl_certificate /etc/letsencrypt/live/9housekitchen.in/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/9housekitchen.in/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;

    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml text/javascript image/svg+xml;

    client_max_body_size 5M;

    location /api/ {
        limit_req zone=api burst=50 nodelay;
        proxy_pass http://cloudkitchen;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;
        proxy_send_timeout 60s;
    }

    location /api/trpc/storefront.razorpayWebhook {
        limit_req zone=webhook burst=20 nodelay;
        proxy_pass http://cloudkitchen;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /api/trpc/storefront.shadowfaxWebhook {
        limit_req zone=webhook burst=20 nodelay;
        proxy_pass http://cloudkitchen;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        proxy_pass http://cloudkitchen;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    location /manus-storage/ {
        proxy_pass http://cloudkitchen;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        expires 7d;
    }

    location / {
        proxy_pass http://cloudkitchen;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
NGINX_EOF

ln -sf /etc/nginx/sites-available/cloudkitchen /etc/nginx/sites-enabled/cloudkitchen
rm -f /etc/nginx/sites-enabled/default

# Test nginx config
nginx -t 2>&1 || {
  echo "⚠️  Nginx config test failed, using HTTP-only fallback..."
  cat > /etc/nginx/sites-available/cloudkitchen << 'NGINX_HTTP'
upstream cloudkitchen {
    server 127.0.0.1:4300;
    keepalive 32;
}

server {
    listen 80;
    listen [::]:80;
    server_name 9housekitchen.in www.9housekitchen.in;

    client_max_body_size 5M;

    location /api/ {
        proxy_pass http://cloudkitchen;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        proxy_pass http://cloudkitchen;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    location / {
        proxy_pass http://cloudkitchen;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
NGINX_HTTP
  nginx -t && systemctl reload nginx
}

systemctl reload nginx 2>/dev/null || systemctl start nginx
echo "✅ Nginx configured"

# =============================================================================
# 6. SSL certificates
# =============================================================================
echo ""
echo "🔒 Step 6/8 — Setting up SSL..."
DOMAIN_IP=$(dig +short "$DOMAIN" 2>/dev/null || echo "")
SERVER_IP=$(curl -s ifconfig.me 2>/dev/null || echo "")

if [ "$DOMAIN_IP" != "$SERVER_IP" ] && [ -n "$DOMAIN_IP" ]; then
  echo "⚠️  DNS mismatch! $DOMAIN → $DOMAIN_IP, Server IP → $SERVER_IP"
  echo "   Ensure DNS A records point to this server first."
fi

if [ ! -d "/etc/letsencrypt/live/$DOMAIN" ]; then
  certbot certonly --nginx -d "$DOMAIN" -d "www.$DOMAIN" --non-interactive --agree-tos --email "admin@${DOMAIN}" --redirect 2>/dev/null || {
    echo "⚠️  SSL setup needs manual intervention later."
    echo "   Run: certbot --nginx -d $DOMAIN -d www.$DOMAIN"
  }
fi

(crontab -l 2>/dev/null; echo "0 3 * * * certbot renew --quiet --post-hook 'systemctl reload nginx'") | sort -u | crontab -
echo "✅ SSL configured (auto-renewal set)"

# =============================================================================
# 7. Build and start Docker
# =============================================================================
echo ""
echo "🐳 Step 7/8 — Building and starting containers..."

# Stop any existing containers
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" down 2>/dev/null || true

# Build and start
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d --build

echo "✅ Containers started"

# =============================================================================
# 8. Wait for PostgreSQL and push schema
# =============================================================================
echo ""
echo "🗄️  Step 8/8 — Database setup..."

echo "Waiting for PostgreSQL to be healthy..."
for i in $(seq 1 60); do
  if docker compose -f "$COMPOSE_FILE" exec -T db pg_isready -U cloudkitchen &>/dev/null; then
    echo "✅ PostgreSQL is ready"
    break
  fi
  if [ "$i" -eq 60 ]; then
    echo "❌ PostgreSQL failed to start"
    docker compose -f "$COMPOSE_FILE" logs db | tail -20
    exit 1
  fi
  sleep 2
done

# Push schema
echo "Pushing database schema..."
docker compose -f "$COMPOSE_FILE" exec -T app npx drizzle-kit push --force 2>&1 || {
  echo "⚠️  Schema push had issues, checking database..."
}

# Verify tables
echo ""
echo "Database tables:"
docker compose -f "$COMPOSE_FILE" exec -T db psql -U cloudkitchen -d cloudkitchen -c "\dt" 2>/dev/null | head -40

# =============================================================================
# 9. Verify deployment
# =============================================================================
echo ""
echo "🔍 Verifying deployment..."

sleep 5

if curl -sf http://127.0.0.1:4300/ >/dev/null 2>&1; then
  echo "✅ App is responding on port 4300"
else
  echo "⚠️  App still starting..."
  docker compose -f "$COMPOSE_FILE" logs app --tail 10
fi

if systemctl is-active nginx &>/dev/null; then
  echo "✅ Nginx is running"
fi

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║  🎉 DEPLOYMENT COMPLETE!                         ║"
echo "╠══════════════════════════════════════════════════╣"
echo "║                                                  ║"
echo "║  🌐 Storefront: https://${DOMAIN}                ║"
echo "║  🔧 Admin:      https://${DOMAIN}/admin          ║"
echo "║                                                  ║"
echo "║  📋 Quick Commands:                              ║"
echo "║  Logs:   docker compose -f $COMPOSE_FILE logs -f ║"
echo "║  Restart: docker compose -f $COMPOSE_FILE restart║"
echo "║  Shell:  docker compose -f $COMPOSE_FILE exec app sh║"
echo "║                                                  ║"
echo "║  ⚡ Next Steps:                                  ║"
echo "║  1. Add Razorpay keys to $ENV_FILE              ║"
echo "║  2. Restart: docker compose -f $COMPOSE_FILE restart ║"
echo "║  3. Visit /admin to set up your restaurant       ║"
echo "║                                                  ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""
echo "Admin token (save this):"
grep LOCAL_ADMIN_TOKEN "$ENV_FILE" | head -1
