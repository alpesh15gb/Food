#!/usr/bin/env sh
# Non-destructive VPS release check. Run on the host after a Supperclub deployment.
set -eu

DOMAIN="${1:-9housekitchen.in}"
APP="deploy-app-1"
DB="deploy-db-1"
BACKUP="/root/legacy-9house-backup-20260826-1050"

request() {
  path="$1"
  expected="$2"
  actual="$(curl -k -sS -o /dev/null -w '%{http_code}' --resolve "${DOMAIN}:443:127.0.0.1" "https://${DOMAIN}${path}")"
  [ "$actual" = "$expected" ] || { echo "FAIL ${path}: expected ${expected}, received ${actual}" >&2; exit 1; }
  echo "PASS ${path} ${actual}"
}

request / 200
request /9house 200
request /admin 200
request /assets/supperclub-mark.png 200
request /assets/supperclub-hero-burger.jpg 200

payment="$(curl -k -sS --resolve "${DOMAIN}:443:127.0.0.1" "https://${DOMAIN}/api/trpc/storefront.paymentConfig?batch=1&input=%7B%220%22%3A%7B%22json%22%3Anull%7D%7D")"
echo "$payment" | grep -q '"enabled":false' && echo "PASS payment remains safely disabled without provider credentials"

docker inspect -f '{{.State.Running}}' "$APP" | grep -qx true
docker inspect -f '{{.State.Health.Status}}' "$DB" | grep -qx healthy
echo "PASS isolated application and database are healthy"

sha256sum -c "$BACKUP/SHA256SUMS"
echo "PASS legacy rollback artifacts are intact"
