#!/usr/bin/env bash
# Restore DB from a backup (run on the server as root):
#   bash /opt/feedarte/app/deploy/restore.sh /opt/feedarte/backups/predeploy-XXXX.dump
set -euo pipefail
FILE=${1:?usage: restore.sh /opt/feedarte/backups/<file>.dump}
P="docker compose -p feedarte --env-file /opt/feedarte/.env -f /opt/feedarte/app/docker-compose.yml"
read -rp "This will REPLACE the current database with $FILE. Type YES: " ok
[ "$ok" = "YES" ] || exit 1
$P stop app worker
docker exec -i feedarte-db-1 pg_restore -U feedarte -d feedarte --clean --if-exists < "$FILE"
$P start app worker
echo "Restored."
