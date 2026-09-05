#!/usr/bin/env sh
# Non-destructive VPS release check. Run on the host after a Supperclub deployment.
set -eu

DOMAIN="${1:-9housekitchen.in}"
BACKUP="/root/legacy-9house-backup-20260826-1050"

# Container names vary with the compose project name: accept overrides,
# verify the name exists, else fall back to live discovery by pattern.
resolve_container() {
  candidate="$1"; pattern="$2"
  if docker inspect "$candidate" >/dev/null 2>&1; then
    printf '%s' "$candidate"
    return 0
  fi
  docker ps --format '{{.Names}}' 2>/dev/null | grep -E "$pattern" | head -n 1 || true
}

APP="$(resolve_container "${APP_CONTAINER:-deploy-app-1}" '\-app\-1$')"
DB="$(resolve_container "${DB_CONTAINER:-deploy-db-1}" '\-db\-1$')"
[ -n "$APP" ] && [ -n "$DB" ] || { echo "FAIL could not resolve app/db containers" >&2; exit 1; }

request() {
  path="$1"
  expected="$2"
  # curl connection failures must report 000, not trip `set -eu` via substitution.
  actual="$(curl -k -sS -o /dev/null -w '%{http_code}' --resolve "${DOMAIN}:443:127.0.0.1" "https://${DOMAIN}${path}" || true)"
  [ -n "$actual" ] || actual="000"
  [ "$actual" = "$expected" ] || { echo "FAIL ${path}: expected ${expected}, received ${actual}" >&2; exit 1; }
  echo "PASS ${path} ${actual}"
}

request / 200
request /9house 200
request /admin 200

# Brand assets ship from client/public and may legitimately lag VPS content
# (or be renamed) — warn without failing the release gate.
for asset in /assets/supperclub-mark.png /assets/supperclub-hero-burger.jpg; do
  code="$(curl -k -sS -o /dev/null -w '%{http_code}' --resolve "${DOMAIN}:443:127.0.0.1" "https://${DOMAIN}${asset}" || true)"
  [ -n "$code" ] || code="000"
  if [ "$code" = "200" ]; then
    echo "PASS ${asset} ${code}"
  else
    echo "WARN ${asset}: received ${code} (brand content drift, not a release blocker)"
  fi
done

payment="$(curl -k -sS --resolve "${DOMAIN}:443:127.0.0.1" "https://${DOMAIN}/api/trpc/storefront.paymentConfig?batch=1&input=%7B%220%22%3A%7B%22json%22%3Anull%7D%7D" || true)"
if echo "$payment" | grep -q '"enabled":false'; then
  echo "PASS payment remains safely disabled without provider credentials"
else
  # With live Razorpay credentials enabled:true is correct — never false-PASS.
  echo "SKIP payment-disabled check (provider appears enabled; verify credentials deliberately)"
fi

docker inspect -f '{{.State.Running}}' "$APP" | grep -qx true
docker inspect -f '{{.State.Health.Status}}' "$DB" | grep -qx healthy
echo "PASS isolated application and database are healthy"

if [ -f "$BACKUP/SHA256SUMS" ]; then
  sha256sum -c "$BACKUP/SHA256SUMS"
  echo "PASS legacy rollback artifacts are intact"
else
  echo "SKIP legacy rollback artifacts not present at $BACKUP"
fi
