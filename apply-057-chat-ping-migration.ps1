$ErrorActionPreference = "Stop"

$repo = Split-Path -Parent $MyInvocation.MyCommand.Path
$migration = Join-Path $repo "packages\db\supabase\migrations\057_chat_message_realtime.sql"

if (-not (Test-Path $migration)) {
  throw "Migration file not found: $migration"
}

Write-Host "Applying 057_chat_message_realtime.sql on jeremy@vps..." -ForegroundColor Cyan
Get-Content -Raw $migration |
  ssh jeremy@vps "docker exec -i supabase-db psql -U postgres -d postgres"

Write-Host ""
Write-Host "Verifying chat_scheduled_messages exists..." -ForegroundColor Cyan
ssh jeremy@vps "docker exec -i supabase-db psql -U postgres -d postgres -c ""select to_regclass('aio_control.chat_scheduled_messages') as chat_scheduled_messages;"""

Write-Host ""
Write-Host "Done. Press Enter to close." -ForegroundColor Green
[void][System.Console]::ReadLine()
