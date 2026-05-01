#!/usr/bin/env bash
# Daily backup of the self-hosted Supabase Postgres. Run by cron — see
# deploy/install-cron.sh for the crontab line. Stores compressed pg_dump
# files under /home/jeremy/backups/aio/ and prunes anything older than 30
# days. Two backups per day (size-checked to skip an unchanged db).
#
# We dump via docker exec rather than psql-on-host so the credentials live
# only inside the Supabase container's env. Output is custom-format
# (-Fc) so pg_restore can do partial restores if needed.

set -euo pipefail

DEST="/home/jeremy/backups/aio"
NAME="$(date +%FT%H%M%S).dump"
RETENTION_DAYS=30

mkdir -p "$DEST"

docker exec -i supabase-db pg_dump -U postgres -Fc -d postgres > "$DEST/$NAME"

# Skip backup if it's binary-identical to the previous one (saves disk on
# idle days). pg_dump custom-format includes a timestamp in the header so
# we compare from byte 1024 onward to dodge that.
PREV="$(ls -1t "$DEST"/*.dump 2>/dev/null | sed -n 2p || true)"
if [[ -n "$PREV" ]] && cmp -s -i 1024 "$PREV" "$DEST/$NAME"; then
  echo "no changes since $PREV — removing redundant $NAME"
  rm "$DEST/$NAME"
fi

# Prune old dumps.
find "$DEST" -name '*.dump' -type f -mtime +$RETENTION_DAYS -delete

echo "✓ backup ok: $(ls -1 "$DEST" | wc -l) dumps retained"
