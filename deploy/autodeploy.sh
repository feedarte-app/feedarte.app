#!/usr/bin/env bash
# Runs every 2 minutes (systemd timer). Deploys a new commit of the `production` branch.
set -uo pipefail
# run from a copy: the repo checkout below may replace this very file
if [ "${FA_COPY:-}" != 1 ]; then cp "$0" /tmp/feedarte-autodeploy.sh; FA_COPY=1 exec bash /tmp/feedarte-autodeploy.sh "$@"; fi
BASE=/opt/feedarte
exec 9>$BASE/.autodeploy.lock
flock -n 9 || exit 0
export GIT_SSH_COMMAND="ssh -i /root/.ssh/feedarte_repo -o IdentitiesOnly=yes"
cd $BASE/repo
git fetch -q origin production || { echo "fetch failed"; exit 1; }
SHA=$(git rev-parse --short=12 origin/production)
CUR=$(cat $BASE/current 2>/dev/null || true)
FAILED=$(cat $BASE/status/failed 2>/dev/null || true)
[ "$SHA" = "$CUR" ] && [ "${1:-}" != "--force" ] && exit 0
[ "$SHA" = "$FAILED" ] && [ "${1:-}" != "--force" ] && exit 0   # don't rebuild a broken commit in a loop
# keep the deploy scripts themselves up to date
git checkout -q --detach origin/production
REL=$BASE/releases/$SHA
rm -rf "$REL" && mkdir -p "$REL"
git archive "$SHA" | tar -x -C "$REL"
LOG=$BASE/deploy-logs/$SHA.log
echo "{\"status\":\"deploying\",\"sha\":\"$SHA\",\"at\":\"$(date -Is)\"}" > $BASE/status/status.json
if bash "$REL/deploy/remote-deploy.sh" "$SHA" > "$LOG" 2>&1; then
  echo "{\"status\":\"ok\",\"sha\":\"$SHA\",\"at\":\"$(date -Is)\"}" > $BASE/status/status.json
  rm -f $BASE/status/failed
else
  echo "{\"status\":\"failed\",\"sha\":\"$SHA\",\"at\":\"$(date -Is)\"}" > $BASE/status/status.json
  echo "$SHA" > $BASE/status/failed
fi
tail -n 150 "$LOG" > $BASE/status/last-deploy.log
ls -1t $BASE/deploy-logs/*.log | tail -n +21 | xargs -r rm -f
