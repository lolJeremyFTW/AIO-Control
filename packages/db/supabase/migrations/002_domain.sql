-- 002_domain.sql — Phase 2: businesses, agents, queue, integrations.
-- Built on top of 001_init.sql (profiles, workspaces, workspace_members,
-- audit_logs, is_workspace_member, workspace_role, _audit_row).
-- Idempotent: drops and recreates so it stays safe to re-run during early
-- iteration.

-- ─── businesses ──────────────────────────────────────────────────────────────
create table if not exists public.businesses (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  sub text,
  letter text not null default 'B',
  variant text not null default 'brand',
    -- variants mirror the design rail: brand|orange|indigo|blue|violet|rose|amber
  status text not null default 'paused',
    -- running|paused
  primary_action text default 'Nieuwe automation',
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_businesses_workspace
  on public.businesses(workspace_id) where archived_at is null;

-- ─── agents ──────────────────────────────────────────────────────────────────
create table if not exists public.agents (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  business_id uuid references public.businesses(id) on delete cascade,
  name text not null,
  kind text not null default 'chat',
    -- chat|worker|reviewer|generator|router
  provider text not null default 'claude',
    -- claude|openrouter|minimax|ollama|openclaw|hermes|codex
  model text,
  config jsonb not null default '{}'::jsonb,
    -- { systemPrompt, temperature, maxTokens, mcpServers, endpoint, ... }
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_agents_workspace_business
  on public.agents(workspace_id, business_id) where archived_at is null;

-- ─── agent_secrets ───────────────────────────────────────────────────────────
-- pgcrypto.pgp_sym_encrypt'd values; the symmetric key is application-side
-- in env, never in the DB. Only the service_role can read the bytea column —
-- RLS denies everyone else (no SELECT policy).
create table if not exists public.agent_secrets (
  agent_id uuid not null references public.agents(id) on delete cascade,
  key text not null,
  value_encrypted bytea not null,
  updated_at timestamptz not null default now(),
  primary key (agent_id, key)
);

-- ─── queue_items ─────────────────────────────────────────────────────────────
create table if not exists public.queue_items (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  agent_id uuid references public.agents(id) on delete set null,
  state text not null check (state in ('auto', 'review', 'fail')),
  confidence numeric not null default 0,
    -- 0..1
  title text not null,
  meta text,
  payload jsonb,
  decision text check (decision in ('approve', 'reject') or decision is null),
  resolved_by uuid references public.profiles(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_queue_open
  on public.queue_items(business_id, state) where resolved_at is null;

-- ─── integrations ────────────────────────────────────────────────────────────
create table if not exists public.integrations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  business_id uuid references public.businesses(id) on delete set null,
  provider text not null,
    -- youtube_data|etsy|drive|stripe|shopify|openai|anthropic|openrouter|
    -- minimax|custom_mcp|...
  name text not null,
  status text not null default 'disconnected',
    -- connected|disconnected|expired|error
  credentials_encrypted bytea,
  last_refresh_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_integrations_workspace
  on public.integrations(workspace_id);

-- ─── KPI view ────────────────────────────────────────────────────────────────
-- Phase 2 ships a stub view that returns zeros so the dashboard renders before
-- runs/revenue tables exist. Phase 3+4 will replace it with real aggregates.
create or replace view public.business_kpis_view as
select
  b.id as business_id,
  b.workspace_id,
  'USAGE_30D'::text as label,
  0::numeric as value,
  'EUR'::text as unit,
  0::numeric as delta_pct
from public.businesses b
where b.archived_at is null
union all
select b.id, b.workspace_id, 'REVENUE_30D', 0, 'EUR', 0
  from public.businesses b where b.archived_at is null
union all
select b.id, b.workspace_id, 'RUNS_24H', 0, NULL, 0
  from public.businesses b where b.archived_at is null;

-- ─── updated_at maintenance ──────────────────────────────────────────────────
create or replace function public._touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_touch_businesses on public.businesses;
create trigger trg_touch_businesses
  before update on public.businesses
  for each row execute function public._touch_updated_at();

drop trigger if exists trg_touch_agents on public.agents;
create trigger trg_touch_agents
  before update on public.agents
  for each row execute function public._touch_updated_at();

drop trigger if exists trg_touch_integrations on public.integrations;
create trigger trg_touch_integrations
  before update on public.integrations
  for each row execute function public._touch_updated_at();

-- ─── Audit log triggers ──────────────────────────────────────────────────────
drop trigger if exists trg_audit_businesses on public.businesses;
create trigger trg_audit_businesses
  after insert or update or delete on public.businesses
  for each row execute function public._audit_row();

drop trigger if exists trg_audit_agents on public.agents;
create trigger trg_audit_agents
  after insert or update or delete on public.agents
  for each row execute function public._audit_row();

drop trigger if exists trg_audit_queue on public.queue_items;
create trigger trg_audit_queue
  after insert or update or delete on public.queue_items
  for each row execute function public._audit_row();

drop trigger if exists trg_audit_integrations on public.integrations;
create trigger trg_audit_integrations
  after insert or update or delete on public.integrations
  for each row execute function public._audit_row();

-- ─── Row-level security ──────────────────────────────────────────────────────
alter table public.businesses enable row level security;
alter table public.agents enable row level security;
alter table public.agent_secrets enable row level security;
alter table public.queue_items enable row level security;
alter table public.integrations enable row level security;

-- businesses
drop policy if exists "businesses_read_member" on public.businesses;
create policy "businesses_read_member"
  on public.businesses for select
  using (public.is_workspace_member(workspace_id));

drop policy if exists "businesses_write_editor" on public.businesses;
create policy "businesses_write_editor"
  on public.businesses for insert
  with check (
    public.workspace_role(workspace_id) in ('owner', 'admin', 'editor')
  );

drop policy if exists "businesses_update_editor" on public.businesses;
create policy "businesses_update_editor"
  on public.businesses for update
  using (public.workspace_role(workspace_id) in ('owner', 'admin', 'editor'))
  with check (public.workspace_role(workspace_id) in ('owner', 'admin', 'editor'));

drop policy if exists "businesses_delete_admin" on public.businesses;
create policy "businesses_delete_admin"
  on public.businesses for delete
  using (public.workspace_role(workspace_id) in ('owner', 'admin'));

-- agents — same matrix
drop policy if exists "agents_read_member" on public.agents;
create policy "agents_read_member"
  on public.agents for select
  using (public.is_workspace_member(workspace_id));

drop policy if exists "agents_insert_editor" on public.agents;
create policy "agents_insert_editor"
  on public.agents for insert
  with check (public.workspace_role(workspace_id) in ('owner', 'admin', 'editor'));

drop policy if exists "agents_update_editor" on public.agents;
create policy "agents_update_editor"
  on public.agents for update
  using (public.workspace_role(workspace_id) in ('owner', 'admin', 'editor'))
  with check (public.workspace_role(workspace_id) in ('owner', 'admin', 'editor'));

drop policy if exists "agents_delete_admin" on public.agents;
create policy "agents_delete_admin"
  on public.agents for delete
  using (public.workspace_role(workspace_id) in ('owner', 'admin'));

-- agent_secrets: locked down. service_role can do anything; everyone else
-- gets nothing. (RLS denies-by-default once enabled with no matching policy.)
-- We expose set/get via SECURITY DEFINER functions in a later migration.

-- queue_items: read by members, write by editors+; reviewers (anyone who
-- can update) decide on items.
drop policy if exists "queue_read_member" on public.queue_items;
create policy "queue_read_member"
  on public.queue_items for select
  using (public.is_workspace_member(workspace_id));

drop policy if exists "queue_insert_editor" on public.queue_items;
create policy "queue_insert_editor"
  on public.queue_items for insert
  with check (public.workspace_role(workspace_id) in ('owner', 'admin', 'editor'));

drop policy if exists "queue_update_editor" on public.queue_items;
create policy "queue_update_editor"
  on public.queue_items for update
  using (public.workspace_role(workspace_id) in ('owner', 'admin', 'editor'))
  with check (public.workspace_role(workspace_id) in ('owner', 'admin', 'editor'));

drop policy if exists "queue_delete_admin" on public.queue_items;
create policy "queue_delete_admin"
  on public.queue_items for delete
  using (public.workspace_role(workspace_id) in ('owner', 'admin'));

-- integrations
drop policy if exists "integrations_read_member" on public.integrations;
create policy "integrations_read_member"
  on public.integrations for select
  using (public.is_workspace_member(workspace_id));

drop policy if exists "integrations_write_admin" on public.integrations;
create policy "integrations_write_admin"
  on public.integrations for insert
  with check (public.workspace_role(workspace_id) in ('owner', 'admin'));

drop policy if exists "integrations_update_admin" on public.integrations;
create policy "integrations_update_admin"
  on public.integrations for update
  using (public.workspace_role(workspace_id) in ('owner', 'admin'))
  with check (public.workspace_role(workspace_id) in ('owner', 'admin'));

drop policy if exists "integrations_delete_admin" on public.integrations;
create policy "integrations_delete_admin"
  on public.integrations for delete
  using (public.workspace_role(workspace_id) in ('owner', 'admin'));
