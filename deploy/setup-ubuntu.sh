#!/usr/bin/env bash
# One-time server preparation for Ubuntu 24.04 (Hetzner / any VPS). Run as root:
#   curl -fsSL <this file> | bash      (or scp it and run)
set -euo pipefail

echo "==> System update"
apt-get update -y && apt-get upgrade -y
apt-get install -y ca-certificates curl git ufw fail2ban unattended-upgrades

echo "==> Automatic security updates"
dpkg-reconfigure -f noninteractive unattended-upgrades

echo "==> Firewall: SSH + HTTP/HTTPS only"
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw --force enable

echo "==> Swap (2G) for safety during image builds"
if ! swapon --show | grep -q swapfile; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

echo "==> Docker"
if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sh
fi
systemctl enable --now docker

echo "==> Done. Next:"
echo "   git clone <your repo> /opt/feedcraft && cd /opt/feedcraft"
echo "   cp .env.example .env && nano .env"
echo "   docker compose up -d --build"
