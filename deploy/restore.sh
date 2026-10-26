#!/usr/bin/env bash
# Restore DB from a backup:  ./deploy/restore.sh backups/db-20261026-0300.dump
set -euo pipefail
cd "$(dirname "$0")/.."
FILE=${1:?usage: restore.sh backups/db-XXXX.dump}
read -rp "This will REPLACE the current database with $FILE. Type YES: " ok
[ "$ok" = "YES" ] || exit 1
docker compose stop app worker
docker compose exec -T db pg_restore -U feedcraft -d feedcraft --clean --if-exists < "$FILE"
docker compose start app worker
echo "Restored. Rendered images will be regenerated on the next feed update (or press Re-render)."
