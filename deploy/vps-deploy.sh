#!/usr/bin/env bash
# vps-deploy.sh — pulls latest main, installs deps, builds Next.js standalone,
# stages it under .next/standalone/apps/control, and bounces the systemd unit.
# Run by GH Actions deploy.yml or manually over SSH.
#
# Idempotent: re-running on the same SHA is safe (pnpm install --frozen-lockfile
# is a no-op, build is cached by Turborepo when nothing changed).

set -euo pipefail

ROOT="/home/jeremy/aio-control"
APP="$ROOT/apps/control"
STAGE="$APP/.next/standalone/apps/control"
SERVICE="aio-control"

cd "$ROOT"

echo "▸ Fetching latest main"
git fetch --quiet origin main
git reset --hard origin/main

echo "▸ Installing dependencies"
pnpm install --frozen-lockfile

# GIT_COMMIT_SHA may be passed in by the caller (GH Actions); if not, derive it.
GIT_COMMIT_SHA="${GIT_COMMIT_SHA:-$(git rev-parse HEAD)}"
BUILD_TIME="$(date -Iseconds)"
export GIT_COMMIT_SHA BUILD_TIME

echo "▸ Building (BASE_PATH=/aio, commit ${GIT_COMMIT_SHA:0:8})"
BASE_PATH=/aio pnpm build

echo "▸ Staging standalone bundle"
# Static + public + env need to live next to server.js inside the standalone tree.
rm -rf "$STAGE/.next/static" "$STAGE/public" 2>/dev/null || true
cp -r "$APP/.next/static" "$STAGE/.next/static"
if [[ -d "$APP/public" ]]; then
  cp -r "$APP/public" "$STAGE/public"
fi
cp "$APP/.env.production" "$STAGE/.env"

# Inject the version metadata so /api/version reflects this deploy.
{
  echo ""
  echo "GIT_COMMIT_SHA=$GIT_COMMIT_SHA"
  echo "BUILD_TIME=$BUILD_TIME"
} >> "$STAGE/.env"

echo "▸ Restarting $SERVICE"
sudo systemctl restart "$SERVICE"

echo "▸ Waiting for /api/health"
for i in {1..15}; do
  if curl -fsS -o /dev/null "http://127.0.0.1:3010/aio/api/health"; then
    echo "✓ deploy ${GIT_COMMIT_SHA:0:8} live after ${i}s"
    exit 0
  fi
  sleep 1
done

echo "✗ /api/health did not come up; tailing service logs:"
sudo journalctl -u "$SERVICE" --since "30s ago" --no-pager | tail -40
exit 1
