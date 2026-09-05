#!/bin/bash
# =============================================================================
# Cloud Kitchen Platform — VPS Setup Script
# Run this on a fresh VPS with Docker installed
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

echo "╔══════════════════════════════════════════════╗"
echo "║  Cloud Kitchen Platform — Setup              ║"
echo "╚══════════════════════════════════════════════╝"
echo ""

# 1. Check Docker
if ! command -v docker &>/dev/null; then
  echo "❌ Docker is not installed. Please install Docker first."
  echo "   curl -fsSL https://get.docker.com | sh"
  exit 1
fi
echo "✅ Docker found: $(docker --version)"

# 2. Create config.env if it doesn't exist
if [ ! -f deploy/config.env ]; then
  echo ""
  echo "📝 Creating deploy/config.env from template..."
  cp deploy/config.env.example deploy/config.env

  # Generate secrets automatically
  JWT_SECRET=$(openssl rand -hex 32 2>/dev/null || head -c 64 /dev/urandom | xxd -p | tr -d '\n' | head -c 64)
  COOKIE_SECRET=$(openssl rand -hex 32 2>/dev/null || head -c 64 /dev/urandom | xxd -p | tr -d '\n' | head -c 64)
  POSTGRES_PASSWORD=$(openssl rand -hex 16 2>/dev/null || head -c 32 /dev/urandom | xxd -p | tr -d '\n' | head -c 32)
  SECRET_KEY=$(openssl rand -hex 32 2>/dev/null || head -c 64 /dev/urandom | xxd -p | tr -d '\n' | head -c 64)
  ADMIN_TOKEN="admin-$(openssl rand -hex 16 2>/dev/null || head -c 32 /dev/urandom | xxd -p | tr -d '\n' | head -c 32)"

  # NOTE: sed -i.bak (not bare -i) for macOS/BSD + GNU portability; backups removed below.
  sed -i.bak "s|POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=${POSTGRES_PASSWORD}|" deploy/config.env
  sed -i.bak "s|JWT_SECRET=.*|JWT_SECRET=${JWT_SECRET}|" deploy/config.env
  sed -i.bak "s|COOKIE_SECRET=.*|COOKIE_SECRET=${COOKIE_SECRET}|" deploy/config.env
  sed -i.bak "s|LOCAL_ADMIN_TOKEN=.*|LOCAL_ADMIN_TOKEN=${ADMIN_TOKEN}|" deploy/config.env
  OTP_SECRET=$(openssl rand -hex 32 2>/dev/null || head -c 64 /dev/urandom | xxd -p | tr -d '\n' | head -c 64)
  sed -i.bak "s|SECRET_ENCRYPTION_KEY=.*|SECRET_ENCRYPTION_KEY=${SECRET_KEY}|" deploy/config.env
  sed -i.bak "s|OTP_HMAC_SECRET=.*|OTP_HMAC_SECRET=${OTP_SECRET}|" deploy/config.env
  rm -f deploy/config.env.bak

  echo "✅ Generated secure secrets in deploy/config.env"
  echo ""
  echo "🔑 IMPORTANT — Save these credentials:"
  echo "   PostgreSQL Password: ${POSTGRES_PASSWORD}"
  echo "   Admin Token:        ${ADMIN_TOKEN}"
  echo ""
  echo "   They are saved in deploy/config.env"
else
  echo "✅ deploy/config.env already exists"
fi

# 3. Build and start
echo ""
echo "🚀 Building and starting containers..."
docker compose -f deploy/docker-compose.yml --env-file deploy/config.env up -d --build

# 4. Wait for PostgreSQL to be healthy
echo ""
echo "⏳ Waiting for PostgreSQL to be ready..."
for i in $(seq 1 30); do
  if docker compose -f deploy/docker-compose.yml exec -T db pg_isready -U cloudkitchen &>/dev/null; then
    echo "✅ PostgreSQL is ready"
    break
  fi
  sleep 2
done

# 5. Apply migrations to database (never push --force in deploy)
echo ""
echo "🗄️  Applying database migrations..."
docker compose -f deploy/docker-compose.yml exec -T app pnpm drizzle-kit migrate 2>&1 || echo "⚠️  Migration will complete after first app boot"

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║  ✅ Setup complete!                          ║"
echo "╠══════════════════════════════════════════════╣"
echo "║                                              ║"
echo "║  App:    http://localhost:4300               ║"
echo "║  Admin:  http://localhost:4300/admin         ║"
echo "║                                              ║"
echo "║  Admin token (login to /admin):              ║"
grep LOCAL_ADMIN_TOKEN deploy/config.env | head -1
echo "║                                              ║"
echo "║  Logs: docker compose -f deploy/docker-compose.yml logs -f app  ║"
echo "║                                              ║"
echo "╚══════════════════════════════════════════════╝"
