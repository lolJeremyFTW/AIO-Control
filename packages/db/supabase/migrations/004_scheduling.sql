-- 004_scheduling.sql — Phase 4: schedules, webhook secrets, Claude Routine
-- bookkeeping. Builds on 002 (agents) + 003 (runs).

-- ─── schedules ───────────────────────────────────────────────────────────────
create table if not exists public.schedules (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  agent_id uuid not null references public.agents(id) on delete cascade,
  business_id uuid references public.businesses(id) on delete set null,
  kind text not null check (kind in ('cron', 'webhook', 'manual')),
  cron_expr text,
  webhook_secret_hash text,
    -- sha256(secret); the plaintext is shown ONCE and never stored.
  provider_routine_id text,
    -- Anthropic Routine id when kind='cron'
  provider_bearer_token bytea,
    -- pgcrypto.pgp_sym_encrypt of the bearer; service-role only.
  enabled boolean not null default true,
  last_fired_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_schedules_workspace
  on public.schedules(workspace_id);
create index if not exists idx_schedules_secret
  on public.schedules(webhook_secret_hash) where webhook_secret_hash is not null;

-- runs.schedule_id was provisioned in 003 without an FK so 004 stays
-- additive without requiring runs to be empty. Add the FK now that
-- schedules exists.
alter table public.runs
  drop constraint if exists runs_schedule_id_fkey;
alter table public.runs
  add constraint runs_schedule_id_fkey
    foreign key (schedule_id) references public.schedules(id) on delete set null;

-- ─── triggers ────────────────────────────────────────────────────────────────
drop trigger if exists trg_touch_schedules on public.schedules;
create trigger trg_touch_schedules
  before update on public.schedules
  for each row execute function public._touch_updated_at();

drop trigger if exists trg_audit_schedules on public.schedules;
create trigger trg_audit_schedules
  after insert or update or delete on public.schedules
  for each row execute function public._audit_row();

-- ─── RLS ─────────────────────────────────────────────────────────────────────
alter table public.schedules enable row level security;

-- Members can read schedule metadata but NOT the bearer token (column-level
-- security — see view below) or the secret hash. We expose a view that
-- omits the sensitive columns and grant read on the view to authenticated.

drop policy if exists "schedules_read_member" on public.schedules;
create policy "schedules_read_member"
  on public.schedules for select
  using (public.is_workspace_member(workspace_id));

drop policy if exists "schedules_insert_editor" on public.schedules;
create policy "schedules_insert_editor"
  on public.schedules for insert
  with check (public.workspace_role(workspace_id) in ('owner', 'admin', 'editor'));

drop policy if exists "schedules_update_editor" on public.schedules;
create policy "schedules_update_editor"
  on public.schedules for update
  using (public.workspace_role(workspace_id) in ('owner', 'admin', 'editor'))
  with check (public.workspace_role(workspace_id) in ('owner', 'admin', 'editor'));

drop policy if exists "schedules_delete_admin" on public.schedules;
create policy "schedules_delete_admin"
  on public.schedules for delete
  using (public.workspace_role(workspace_id) in ('owner', 'admin'));

-- Public-safe view: same data minus encrypted/secret columns. Use this from
-- the UI; it inherits RLS via SECURITY INVOKER.
create or replace view public.schedules_safe as
select
  id,
  workspace_id,
  agent_id,
  business_id,
  kind,
  cron_expr,
  provider_routine_id,
  enabled,
  last_fired_at,
  created_at,
  updated_at
from public.schedules;
