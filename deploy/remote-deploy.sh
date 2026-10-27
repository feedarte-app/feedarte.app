#!/usr/bin/env bash
# Deploys one release (called by autodeploy.sh on the server):
# DB backup → build image → restart → health check → automatic rollback on failure.
# Data (database, rendered images, uploads) lives in Docker volumes and is never touched.
set -euo pipefail
SHA=${1:?release id}
BASE=/opt/feedarte
REL=$BASE/releases/$SHA
P="docker compose -p feedarte --env-file $BASE/.env -f $REL/docker-compose.yml"
log() { echo "[deploy $(date +%H:%M:%S)] $*"; }

# ---------- configuration (.env) ----------
if [ ! -f $BASE/secrets.env ]; then   # generated once, never leaves the server
  (umask 077; echo "POSTGRES_PASSWORD=$(openssl rand -hex 24)" > $BASE/secrets.env)
fi
set -a; . $REL/deploy/config.env; set +a
if [ -z "${DOMAIN:-}" ]; then log "DOMAIN is empty in deploy/config.env"; exit 1; fi
{
  cat $BASE/secrets.env
  echo "DOMAIN=$DOMAIN"
  echo "PUBLIC_URL=https://$DOMAIN"
  echo "SITE_DOMAIN=${SITE_DOMAIN:-localhost}"
  echo "STATUS_TOKEN=${STATUS_TOKEN:-}"
  echo "BACKUP_DIR=$BASE/backups"
  echo "STATUS_DIR=$BASE/status"
  echo "APP_VERSION=$SHA"
  [ -f $BASE/extra.env ] && cat $BASE/extra.env   # optional manual overrides
} > $BASE/.env
chmod 600 $BASE/.env
cp $BASE/.env $REL/.env

# ---------- pre-deploy backup ----------
if docker ps --format '{{.Names}}' | grep -q '^feedarte-db-1$'; then
  log "backup before deploy"
  docker exec feedarte-db-1 pg_dump -U feedarte -d feedarte -Fc > $BASE/backups/predeploy-$SHA.dump.tmp \
    && mv $BASE/backups/predeploy-$SHA.dump.tmp $BASE/backups/predeploy-$SHA.dump
  ls -1t $BASE/backups/predeploy-*.dump 2>/dev/null | tail -n +11 | xargs -r rm -f   # keep last 10
fi

# ---------- validate web server config (a broken Caddyfile must never take the site down) ----------
log "validating Caddyfile"
if ! docker run --rm -e DOMAIN="$DOMAIN" -e SITE_DOMAIN="${SITE_DOMAIN:-localhost}" \
     -v $REL/deploy/Caddyfile:/etc/caddy/Caddyfile:ro caddy:2-alpine \
     caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null 2>$BASE/status/caddy-validate.log; then
  log "Caddyfile is invalid — deploy aborted, current release keeps running"
  tail -5 $BASE/status/caddy-validate.log || true
  exit 1
fi

# ---------- build ----------
log "building image $SHA"
docker build -t feedarte:$SHA $REL
if docker image inspect feedarte:latest >/dev/null 2>&1; then
  docker tag feedarte:latest feedarte:previous
fi
docker tag feedarte:$SHA feedarte:latest

# ---------- start ----------
log "starting"
$P up -d --no-build --remove-orphans

health() {
  for i in $(seq 1 40); do
    if $P exec -T app node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" 2>/dev/null; then
      return 0
    fi
    sleep 3
  done
  return 1
}

if health; then
  log "healthy ✔ release $SHA is live"
  echo "$SHA" > $BASE/current
  ln -sfn $REL $BASE/app
else
  log "HEALTH CHECK FAILED — rolling back"
  $P logs --tail 80 app || true
  if docker image inspect feedarte:previous >/dev/null 2>&1; then
    docker tag feedarte:previous feedarte:latest
    PREV=$(cat $BASE/current 2>/dev/null || echo "")
    [ -n "$PREV" ] && [ -d $BASE/releases/$PREV ] && P="docker compose -p feedarte --env-file $BASE/.env -f $BASE/releases/$PREV/docker-compose.yml"
    $P up -d --no-build
    health && log "rolled back to previous release" || log "rollback also unhealthy!"
  fi
  exit 1
fi

# ---------- cleanup ----------
ls -1dt $BASE/releases/*/ | tail -n +6 | xargs -r rm -rf
docker image ls feedarte --format '{{.Tag}}' | grep -vE '^(latest|previous|'"$SHA"')$' | xargs -r -I{} docker rmi feedarte:{} >/dev/null 2>&1 || true
docker image prune -f >/dev/null
log "done"
