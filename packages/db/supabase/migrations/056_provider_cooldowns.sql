-- 056_provider_cooldowns.sql — cross-process / cross-tenant rate-limit
-- cooldown table.
--
-- Each Node process (aio-control on :3010, aio-control-root on :3012)
-- previously kept its own in-memory cooldown clock. When workspace A's
-- cron tripped MiniMax 429 on :3010, workspace B's interactive chat on
-- :3012 was unaware and would also hit the limiter. Sharing via DB
-- gives every caller a single source of truth.
--
-- Multi-tenancy: keyed by (provider, key_hash). Same API key shared
-- across workspaces shares the cooldown (correct — same bucket).
-- Different keys = independent cooldowns.

create table if not exists aio_control.provider_cooldowns (
  -- SHA-256 hex of (provider || ':' || api_key) — never store plaintext keys
  key_hash text primary key,
  provider text not null,
  cooldown_until timestamptz not null,
  reason text,
  updated_at timestamptz not null default now()
);

-- Plain index on cooldown_until — partial index with now() is rejected
-- (immutability constraint). The full index is small enough.
create index if not exists idx_provider_cooldowns_until
  on aio_control.provider_cooldowns(cooldown_until);

-- Allow service-role to read/write; no row-level security (no PII, only
-- key hashes + cooldown timestamps).
alter table aio_control.provider_cooldowns enable row level security;

drop policy if exists "provider_cooldowns_service_only" on aio_control.provider_cooldowns;
create policy "provider_cooldowns_service_only"
  on aio_control.provider_cooldowns
  for all
  using (false)
  with check (false);
-- Service-role bypasses RLS so it can read/write freely.
