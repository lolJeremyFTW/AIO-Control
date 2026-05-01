#!/usr/bin/env bash
# One-shot installer that registers the daily backup with jeremy's crontab.
# Idempotent — run it again any time and it'll either be a no-op or update
# the entry in place.

set -euo pipefail

LINE="0 3 * * * /home/jeremy/aio-control/deploy/backup-supabase.sh >> /home/jeremy/backups/aio/backup.log 2>&1"

mkdir -p /home/jeremy/backups/aio
chmod +x /home/jeremy/aio-control/deploy/backup-supabase.sh

# crontab -l fails when no crontab exists yet; fall back to empty input.
CURRENT="$(crontab -l 2>/dev/null || true)"

# Strip any prior aio-backup line, then re-append.
NEW="$(printf '%s\n' "$CURRENT" | grep -v 'aio-control/deploy/backup-supabase.sh' || true)"
NEW="$(printf '%s\n%s\n' "$NEW" "$LINE")"

printf '%s\n' "$NEW" | crontab -

echo "✓ Cron installed. Verify with: crontab -l"
