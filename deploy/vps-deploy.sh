#!/usr/bin/env bash
# vps-deploy.sh — pulls latest main, installs deps, then BUILDS TWICE:
#   1. BASE_PATH=/aio  → staged in .staged-aio/, served by aio-control on :3010
#                        (used by https://tromptech.life/aio/*)
#   2. BASE_PATH=""    → staged in .staged-root/, served by aio-control-root on :3012
#                        (used by https://aio.tromptech.life/*)
# Both builds share the same .env.production. They're independent Node
# processes pointing at the same Supabase, so logging in on one URL gives
# you a session on the other (cookies are scoped to .tromptech.life via
# Supabase's default cookie config).
#
# Idempotent: re-running on the same SHA is safe.

set -euo pipefail

ROOT="/home/jeremy/aio-control"
APP="$ROOT/apps/control"
STAGE_AIO="$ROOT/.staged-aio"
STAGE_ROOT="$ROOT/.staged-root"

cd "$ROOT"

echo "▸ Fetching latest main"
git fetch --quiet origin main
git reset --hard origin/main

echo "▸ Installing dependencies"
pnpm install --frozen-lockfile

GIT_COMMIT_SHA="${GIT_COMMIT_SHA:-$(git rev-parse HEAD)}"
BUILD_TIME="$(date -Iseconds)"
export GIT_COMMIT_SHA BUILD_TIME

build_and_stage() {
  local label="$1"
  local base_path="$2"
  local stage_dir="$3"
  echo "▸ Building ($label, BASE_PATH='${base_path}', commit ${GIT_COMMIT_SHA:0:8})"

  # Wipe the prior build so basePath flips don't leak between builds.
  # Turborepo also caches by file-hash AND a strict env-var allowlist —
  # since BASE_PATH isn't tracked in turbo.json, the second build was
  # replaying the first build's cached output (with the wrong basePath
  # baked in). --force skips the cache and reruns Next every time.
  rm -rf "$APP/.next"
  # Pre-generate the .next/types/validator.ts route-typegen file. Next
  # 16's `next build` triggers typegen too, but on this VPS it races
  # with the tsc workers and they sometimes start before validator.ts
  # exists, failing with "File '...validator.ts' not found." Running
  # typegen explicitly first removes the race.
  ( cd "$APP" && BASE_PATH="$base_path" pnpm exec next typegen )
  BASE_PATH="$base_path" pnpm exec turbo run build --force --filter=@aio/control

  # Stage the standalone bundle. Standalone produces apps/control under
  # the .next/standalone tree because we're in a monorepo — preserve that.
  rm -rf "$stage_dir"
  mkdir -p "$stage_dir"
  cp -r "$APP/.next/standalone/." "$stage_dir/"
  mkdir -p "$stage_dir/apps/control/.next"
  cp -r "$APP/.next/static" "$stage_dir/apps/control/.next/static"
  if [[ -d "$APP/public" ]]; then
    cp -r "$APP/public" "$stage_dir/apps/control/public"
  fi

  # Bake .env.production + version metadata into the standalone tree.
  cp "$APP/.env.production" "$stage_dir/apps/control/.env"
  {
    echo ""
    echo "GIT_COMMIT_SHA=$GIT_COMMIT_SHA"
    echo "BUILD_TIME=$BUILD_TIME"
    # Override BASE_PATH per build so process.env matches what Next baked in.
    echo "BASE_PATH=$base_path"
  } >> "$stage_dir/apps/control/.env"
}

build_and_stage "path /aio"        "/aio" "$STAGE_AIO"
build_and_stage "subdomain root"   ""     "$STAGE_ROOT"

echo "▸ Restarting services"
sudo systemctl restart aio-control
sudo systemctl restart aio-control-root

echo "▸ Waiting for both health endpoints"
ok=0
for i in {1..15}; do
  s1=$(curl -fsS -o /dev/null -w "%{http_code}" "http://127.0.0.1:3010/aio/api/health" || echo 000)
  s2=$(curl -fsS -o /dev/null -w "%{http_code}" "http://127.0.0.1:3012/api/health" || echo 000)
  if [[ "$s1" == "200" && "$s2" == "200" ]]; then
    ok=1; break
  fi
  sleep 1
done

if [[ $ok -ne 1 ]]; then
  echo "✗ One of the services didn't come up:"
  echo "  :3010/aio/api/health = $s1"
  echo "  :3012/api/health     = $s2"
  echo "--- aio-control logs ---"
  sudo journalctl -u aio-control --since "60s ago" --no-pager | tail -20
  echo "--- aio-control-root logs ---"
  sudo journalctl -u aio-control-root --since "60s ago" --no-pager | tail -20
  exit 1
fi

echo "✓ deploy ${GIT_COMMIT_SHA:0:8} live (path :3010, subdomain :3012)"
