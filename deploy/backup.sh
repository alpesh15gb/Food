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

# Cleanup old daily backups
echo "[Backup] Cleaning old backups..."
cd "${BACKUP_DIR}/daily"
ls -t ${DB_NAME}_*.sql.gz 2>/dev/null | tail -n +$((DAILY_KEEP + 1)) | xargs -r rm -f
echo "[Backup] Retained last ${DAILY_KEEP} daily backups"

# Cleanup old weekly backups
cd "${BACKUP_DIR}/weekly"
ls -t ${DB_NAME}_*.sql.gz 2>/dev/null | tail -n +$((WEEKLY_KEEP + 1)) | xargs -r rm -f
echo "[Backup] Retained last ${WEEKLY_KEEP} weekly backups"

# Cleanup old monthly backups
cd "${BACKUP_DIR}/monthly"
ls -t ${DB_NAME}_*.sql.gz 2>/dev/null | tail -n +$((MONTHLY_KEEP + 1)) | xargs -r rm -f
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
