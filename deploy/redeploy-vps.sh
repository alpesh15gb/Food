#!/usr/bin/env sh
# Run as root on the VPS from /opt/supperclub-direct. It preserves secrets from the active isolated app container before recreation.
set -eu

APP_CONTAINER="${APP_CONTAINER:-deploy-app-1}"
DB_CONTAINER="${DB_CONTAINER:-deploy-db-1}"

read_container_value() {
  docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "$1" | sed -n "s/^$2=//p" | head -n 1
}

export MYSQL_PASSWORD="$(read_container_value "$DB_CONTAINER" MYSQL_PASSWORD)"
export MYSQL_ROOT_PASSWORD="$(read_container_value "$DB_CONTAINER" MYSQL_ROOT_PASSWORD)"
export JWT_SECRET="$(read_container_value "$APP_CONTAINER" JWT_SECRET)"
export LOCAL_ADMIN_TOKEN="$(read_container_value "$APP_CONTAINER" LOCAL_ADMIN_TOKEN)"
export SECRET_ENCRYPTION_KEY="$(read_container_value "$APP_CONTAINER" SECRET_ENCRYPTION_KEY)"

for key in MYSQL_PASSWORD MYSQL_ROOT_PASSWORD JWT_SECRET LOCAL_ADMIN_TOKEN SECRET_ENCRYPTION_KEY; do
  eval "value=\${$key}"
  [ -n "$value" ] || { echo "Missing $key in the active isolated containers; aborting without changes." >&2; exit 1; }
done

docker compose -f deploy/docker-compose.yml up -d --build app
docker compose -f deploy/docker-compose.yml exec -T app pnpm drizzle-kit migrate
docker compose -f deploy/docker-compose.yml up -d --force-recreate app
curl -fsS "http://127.0.0.1:4300/api/trpc/storefront.get?batch=1&input=%7B%220%22%3A%7B%22json%22%3A%7B%22slug%22%3A%229house-kitchen%22%7D%7D%7D" >/dev/null
echo "Supperclub redeploy completed with prior isolated runtime values preserved."
