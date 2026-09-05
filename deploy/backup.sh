#!/bin/bash
# =============================================================================
# PostgreSQL Backup Script for 9House Kitchen
# Issue 10: Production backup protection before LIVE mode
#
# Usage: Run daily via cron:
#   0 2 * * * /opt/cloudkitchen/deploy/backup.sh >> /var/log/cloudkitchen-backup.log 2>&1
#
# Retention: Keep last 7 daily backups, 4 weekly backups, 3 monthly backups.
# =============================================================================

set -euo pipefail

# Configuration
BACKUP_DIR="/opt/cloudkitchen/backups"
CONTAINER_NAME="deploy-db-1"
DB_NAME="cloudkitchen"
DB_USER="cloudkitchen"
DATE=$(date +%Y-%m-%d_%H-%M)
DAILY_KEEP=7
WEEKLY_KEEP=4
MONTHLY_KEEP=3

# Ensure backup directory exists (outside ephemeral container filesystem)
mkdir -p "${BACKUP_DIR}/daily" "${BACKUP_DIR}/weekly" "${BACKUP_DIR}/monthly"

echo "[Backup] Starting backup at ${DATE}"

# Create daily backup
BACKUP_FILE="${BACKUP_DIR}/daily/${DB_NAME}_${DATE}.sql.gz"
docker exec "${CONTAINER_NAME}" pg_dump -U "${DB_USER}" -d "${DB_NAME}" --no-owner --no-privileges \
  | gzip > "${BACKUP_FILE}"

FILESIZE=$(stat -f%z "${BACKUP_FILE}" 2>/dev/null || stat -c%s "${BACKUP_FILE}" 2>/dev/null || echo "0")
echo "[Backup] Daily backup created: ${BACKUP_FILE} (${FILESIZE} bytes)"

# Uploaded brand/menu images live in a named volume (not the database) —
# snapshot it alongside, resolving the project-prefixed volume name live.
IMAGES_VOLUME="$(docker volume ls -q 2>/dev/null | grep -E '(^|_)cloudkitchen_images$' | head -n 1 || true)"
if [ -n "${IMAGES_VOLUME:-}" ]; then
  IMAGES_FILE="${BACKUP_DIR}/daily/${DB_NAME}_images_${DATE}.tar.gz"
  if docker run --rm -v "${IMAGES_VOLUME}:/data:ro" -v "${BACKUP_DIR}/daily:/backup" alpine tar -czf "/backup/$(basename "${IMAGES_FILE}")" -C /data . 2>/dev/null; then
    echo "[Backup] Images snapshot created: ${IMAGES_FILE}"
  else
    echo "[Backup] ⚠️ WARNING: images snapshot failed (uploads not backed up)"
  fi
else
  echo "[Backup] ⚠️ WARNING: images volume not found (uploads not backed up)"
fi

# Secrets live only in deploy/config.env — without it a restore cannot boot.
CONFIG_SRC="${CONFIG_SRC:-/opt/cloudkitchen/deploy/config.env}"
if [ -f "${CONFIG_SRC}" ]; then
  cp "${CONFIG_SRC}" "${BACKUP_DIR}/daily/config_${DATE}.env"
  chmod 600 "${BACKUP_DIR}/daily/config_${DATE}.env"
  echo "[Backup] Config snapshot saved (mode 600)"
else
  echo "[Backup] ⚠️ WARNING: ${CONFIG_SRC} not found (secrets not backed up)"
fi

# Weekly backup (every Sunday)
if [ $(date +%u) -eq 7 ]; then
  WEEKLY_FILE="${BACKUP_DIR}/weekly/${DB_NAME}_${DATE}.sql.gz"
  cp "${BACKUP_FILE}" "${WEEKLY_FILE}"
  echo "[Backup] Weekly backup created: ${WEEKLY_FILE}"
fi

# Monthly backup (1st of month)
if [ $(date +%d) -eq 1 ]; then
  MONTHLY_FILE="${BACKUP_DIR}/monthly/${DB_NAME}_${DATE}.sql.gz"
  cp "${BACKUP_FILE}" "${MONTHLY_FILE}"
  echo "[Backup] Monthly backup created: ${MONTHLY_FILE}"
fi

# Cleanup old daily backups (|| true: empty globs fail ls under pipefail+set -e)
echo "[Backup] Cleaning old backups..."
cd "${BACKUP_DIR}/daily"
ls -t ${DB_NAME}_*.sql.gz 2>/dev/null | tail -n +$((DAILY_KEEP + 1)) | xargs -r rm -f || true
ls -t ${DB_NAME}_images_*.tar.gz 2>/dev/null | tail -n +$((DAILY_KEEP + 1)) | xargs -r rm -f || true
ls -t config_*.env 2>/dev/null | tail -n +$((DAILY_KEEP + 1)) | xargs -r rm -f || true
echo "[Backup] Retained last ${DAILY_KEEP} daily backups"

# Cleanup old weekly backups
cd "${BACKUP_DIR}/weekly"
ls -t ${DB_NAME}_*.sql.gz 2>/dev/null | tail -n +$((WEEKLY_KEEP + 1)) | xargs -r rm -f || true
echo "[Backup] Retained last ${WEEKLY_KEEP} weekly backups"

# Cleanup old monthly backups
cd "${BACKUP_DIR}/monthly"
ls -t ${DB_NAME}_*.sql.gz 2>/dev/null | tail -n +$((MONTHLY_KEEP + 1)) | xargs -r rm -f || true
echo "[Backup] Retained last ${MONTHLY_KEEP} monthly backups"

# Verify backup integrity
if [ -f "${BACKUP_FILE}" ] && [ -s "${BACKUP_FILE}" ]; then
  echo "[Backup] ✅ Backup completed successfully"
else
  echo "[Backup] ❌ Backup may be empty or missing!"
  exit 1
fi

# Disk space check
DISK_USAGE=$(df -h "${BACKUP_DIR}" | awk 'NR==2 {print $5}' | tr -d '%')
if [ "${DISK_USAGE}" -gt 85 ]; then
  echo "[Backup] ⚠️ WARNING: Disk usage at ${DISK_USAGE}%!"
fi
