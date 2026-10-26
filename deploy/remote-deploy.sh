#!/usr/bin/env bash
# Runs ON the server (called by GitHub Actions). Idempotent:
#  first run  → prepares the server (Docker, firewall, swap, auto security updates) and generates secrets
#  every run  → DB backup → build new image → restart → health check → automatic rollback on failure
# Data (database, rendered images, uploads) lives in Docker volumes and is never touched by deploys.
set -euo pipefail
SHA=${1:?release id}
BASE=/opt/feedarte
REL=$BASE/releases/$SHA
P="docker compose -p feedarte --env-file $BASE/.env -f $REL/docker-compose.yml"
log() { echo "[deploy $(date +%H:%M:%S)] $*"; }

# ---------- one-time server preparation ----------
if [ ! -f $BASE/.prepared ]; then
  log "first run: preparing server"
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -y
  apt-get install -y ca-certificates curl ufw fail2ban unattended-upgrades openssl
  dpkg-reconfigure -f noninteractive unattended-upgrades || true
  ufw default deny incoming; ufw default allow outgoing
  ufw allow OpenSSH; ufw allow 80/tcp; ufw allow 443/tcp; ufw allow 443/udp
  ufw --force enable
  if ! swapon --show | grep -q swapfile; then
    fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
    echo '/swapfile none swap sw 0 0' >> /etc/fstab
  fi
  command -v docker >/dev/null || curl -fsSL https://get.docker.com | sh
  systemctl enable --now docker
  mkdir -p $BASE/backups
  touch $BASE/.prepared
fi

# ---------- configuration (.env) ----------
# secrets are generated once on the server and never leave it
if [ ! -f $BASE/secrets.env ]; then
  umask 077
  echo "POSTGRES_PASSWORD=$(openssl rand -hex 24)" > $BASE/secrets.env
fi
set -a; . $REL/deploy/config.env; set +a
{
  cat $BASE/secrets.env
  echo "DOMAIN=$DOMAIN"
  echo "PUBLIC_URL=https://$DOMAIN"
  echo "BACKUP_DIR=$BASE/backups"
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
