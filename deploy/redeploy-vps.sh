#!/usr/bin/env sh
# Safe redeploy for the isolated 9House Kitchen stack.
# Run as root from /opt/cloudkitchen. Recreates ONLY the app container;
# the database container and its volume are never touched.
# Usage: bash deploy/redeploy-vps.sh
set -eu

cd "$(dirname "$0")/.."

COMPOSE_FILE="deploy/docker-compose.yml"
ENV_FILE="deploy/config.env"

# Container names depend on the compose project name, which varies with how
# the stack was first created. Prefer live discovery via compose; fall back
# to the historic deploy-* names (overridable via APP_CONTAINER/DB_CONTAINER).
# Never `down` the db service or rename the project: named volumes are
# project-prefixed, so a rename would orphan the database volume.
resolve_container() {
  found="$(docker compose -f "$COMPOSE_FILE" ps -q "$1" 2>/dev/null | head -n 1 || true)"
  if [ -n "$found" ]; then
    printf '%s' "$found"
  else
    printf '%s' "$2"
  fi
}

APP_CONTAINER="${APP_CONTAINER:-$(resolve_container app deploy-app-1)}"
DB_CONTAINER="${DB_CONTAINER:-$(resolve_container db deploy-db-1)}"

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

# 5. Local health check (host-resolved slug proves custom-domain wiring).
curl -fsS -H "Host: 9housekitchen.in" "http://127.0.0.1:4300/api/trpc/storefront.defaultSlug?batch=1&input=%7B%220%22%3A%7B%22json%22%3Anull%7D%7D" | grep -q '"slug":"' || {
  echo "Health check failed: defaultSlug did not resolve; check custom_domains." >&2
  exit 1
}
echo "Redeploy completed: app rebuilt, migrations applied, local health OK."
echo "Next: bash deploy/acceptance.sh 9housekitchen.in"
