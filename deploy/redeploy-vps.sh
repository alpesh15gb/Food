#!/usr/bin/env sh
# Safe redeploy for the isolated 9House Kitchen stack.
# Run as root from /opt/cloudkitchen. Recreates ONLY the app container;
# the database container and its volume are never touched.
# Usage: bash deploy/redeploy-vps.sh
set -eu

cd "$(dirname "$0")/.."

APP_CONTAINER="${APP_CONTAINER:-deploy-app-1}"
DB_CONTAINER="${DB_CONTAINER:-deploy-db-1}"
COMPOSE_FILE="deploy/docker-compose.yml"
ENV_FILE="deploy/config.env"

# 1. Backfill deploy/config.env from the RUNNING containers so a rebuild can
# never boot with blank secrets. Existing non-empty values in config.env win.
if [ ! -f "$ENV_FILE" ]; then
  echo "Missing $ENV_FILE; aborting without changes." >&2
  exit 1
fi

read_container_value() {
  docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "$1" 2>/dev/null | sed -n "s/^$2=//p" | head -n 1
}

backfill() {
  key="$1"; container="$2"
  if grep -q "^${key}=$" "$ENV_FILE" || ! grep -q "^${key}=" "$ENV_FILE"; then
    val="$(read_container_value "$container" "$key")"
    if [ -n "$val" ]; then
      # escape for sed replacement
      esc_val="$(printf '%s' "$val" | sed 's/[&/\]/\\&/g')"
      if grep -q "^${key}=" "$ENV_FILE"; then
        sed -i.bak "s|^${key}=.*|${key}=${esc_val}|" "$ENV_FILE"
      else
        printf '%s=%s\n' "$key" "$val" >> "$ENV_FILE"
      fi
      rm -f "${ENV_FILE}.bak"
      echo "backfilled $key from $container"
    fi
  fi
}

backfill POSTGRES_PASSWORD "$DB_CONTAINER"
for k in JWT_SECRET COOKIE_SECRET LOCAL_ADMIN_TOKEN SECRET_ENCRYPTION_KEY OTP_HMAC_SECRET; do
  backfill "$k" "$APP_CONTAINER"
done

# 2. Fail closed if required secrets are still empty.
for key in POSTGRES_PASSWORD JWT_SECRET COOKIE_SECRET LOCAL_ADMIN_TOKEN SECRET_ENCRYPTION_KEY OTP_HMAC_SECRET; do
  val="$(sed -n "s/^${key}=//p" "$ENV_FILE" | head -n 1)"
  if [ -z "$val" ]; then
    echo "Missing $key in $ENV_FILE; aborting without changes." >&2
    exit 1
  fi
done

# 3. Rebuild + recreate app only (db volume untouched).
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d --build app

# 4. Apply pending migrations inside the new container.
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T app pnpm drizzle-kit migrate

# 5. Local health check.
curl -fsS "http://127.0.0.1:4300/api/trpc/storefront.get?batch=1&input=%7B%220%22%3A%7B%22json%22%3A%7B%22slug%22%3A%229house-kitchen%22%7D%7D%7D" >/dev/null
echo "Redeploy completed: app rebuilt, migrations applied, local health OK."
echo "Next: bash deploy/acceptance.sh 9housekitchen.in"
