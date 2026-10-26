#!/usr/bin/env bash
# One-time server preparation (run by cloud-init right after the repo is cloned).
set -euo pipefail
BASE=/opt/feedarte
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y ca-certificates curl git ufw fail2ban unattended-upgrades openssl
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
mkdir -p $BASE/backups $BASE/releases $BASE/status $BASE/deploy-logs

cat > /etc/systemd/system/feedarte-autodeploy.service <<UNIT
[Unit]
Description=Feedarte auto-deploy from GitHub (production branch)
After=network-online.target docker.service
[Service]
Type=oneshot
ExecStart=/bin/bash $BASE/repo/deploy/autodeploy.sh
UNIT
cat > /etc/systemd/system/feedarte-autodeploy.timer <<UNIT
[Unit]
Description=Check GitHub for a new Feedarte release every 2 minutes
[Timer]
OnBootSec=1min
OnUnitActiveSec=2min
[Install]
WantedBy=timers.target
UNIT
systemctl daemon-reload
systemctl enable --now feedarte-autodeploy.timer
touch $BASE/.prepared
echo "bootstrap done"
