#!/bin/sh
# Daily backup: Postgres dump + uploaded assets. Rendered images are NOT backed up —
# they are regenerated automatically from the database.
set -eu
KEEP=${BACKUP_KEEP_DAYS:-14}
while true; do
  TS=$(date +%Y%m%d-%H%M)
  echo "[backup] $TS starting"
  if pg_dump -h db -U feedcraft -d feedcraft -Fc -f "/backups/db-$TS.dump.tmp"; then
    mv "/backups/db-$TS.dump.tmp" "/backups/db-$TS.dump"
    tar -czf "/backups/assets-$TS.tar.gz" -C /appdata/public a 2>/dev/null || true
    find /backups -type f -mtime +"$KEEP" -delete
    echo "[backup] $TS done"
  else
    echo "[backup] $TS FAILED" >&2
    rm -f "/backups/db-$TS.dump.tmp"
  fi
  sleep 86400
done
