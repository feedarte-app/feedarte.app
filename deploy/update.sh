#!/usr/bin/env bash
# Zero-fuss update: pull code, rebuild, restart. DB migrations run automatically on start.
set -euo pipefail
cd "$(dirname "$0")/.."
git pull --ff-only
docker compose build
docker compose up -d
docker image prune -f
docker compose ps
