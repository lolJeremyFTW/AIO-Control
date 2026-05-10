-- 085_brain_foundation.sql
-- TrompTech Brain foundation tables:
--   memory mirror, lightweight knowledge graph, asset registry,
--   proposal/dream safety, and budget alerts.

do $$
begin
  begin
    create extension if not exists vector;
  exception when others then
    raise notice 'vector extension unavailable: %', sqlerrm;
  end;
end $$;

-- Optional extensions. We do not depend on these tables using them yet, but
-- enabling them here makes the deployment self-documenting where available.
do $$
begin
  begin
    create extension if not exists timescaledb;
  exception when others then
    raise notice 'timescaledb extension unavailable: %', sqlerrm;
  end;
  begin
    create extension if not exists pg_cron;
  exception when others then
    raise notice 'pg_cron extension unavailable: %', sqlerrm;
  end;
end $$;

-- Memory: Obsidian/plain-text mirror.
create table if not exists aio_control.notes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references aio_control.workspaces(id) on delete cascade,
  business_id uuid references aio_control.businesses(id) on delete set null,
  nav_node_id uuid references aio_control.nav_nodes(id) on delete set null,
  source text not null default 'manual',
  source_path text,
  external_id text,
  title text not null,
  body text not null default '',
  note_type text not null default 'note',
  frontmatter jsonb not null default '{}'::jsonb,
  tags text[] not null default '{}',
  content_hash text,
  embedding vector(1024),
  importance integer not null default 5 check (importance between 0 and 10),
  archived_at timestamptz,
  indexed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, source, source_path)
);

create index if not exists idx_notes_workspace_updated
  on aio_control.notes(workspace_id, updated_at desc)
  where archived_at is null;
create index if not exists idx_notes_business
  on aio_control.notes(workspace_id, business_id, updated_at desc)
  where business_id is not null and archived_at is null;
create index if not exists idx_notes_tags
  on aio_control.notes using gin(tags);
create index if not exists idx_notes_frontmatter
  on aio_control.notes using gin(frontmatter);
create index if not exists idx_notes_body_fts
  on aio_control.notes using gin(to_tsvector('simple', title || ' ' || body));

do $$
begin
  begin
    create index if not exists idx_notes_embedding_hnsw
      on aio_control.notes using hnsw (embedding vector_cosine_ops)
      where embedding is not null;
  exception when others then
    raise notice 'notes embedding index skipped: %', sqlerrm;
  end;
end $$;

create or replace function aio_control.recall_notes(
  _workspace_id uuid,
  _query text,
  _query_embedding vector(1024) default null,
  _business_id uuid default null,
  _nav_node_id uuid default null,
  _match_count integer default 10
) returns table (
  id uuid,
  workspace_id uuid,
  business_id uuid,
  nav_node_id uuid,
  title text,
  body text,
  note_type text,
  source text,
  source_path text,
  tags text[],
  vector_score real,
  keyword_score real,
  combined_score real,
  updated_at timestamptz
)
language sql
stable
set search_path = aio_control, public
as $$
  with scored as (
    select
      n.id,
      n.workspace_id,
      n.business_id,
      n.nav_node_id,
      n.title,
      n.body,
      n.note_type,
      n.source,
      n.source_path,
      n.tags,
      case
        when _query_embedding is null or n.embedding is null then 0::real
        else (1 - (n.embedding <=> _query_embedding))::real
      end as vector_score,
      case
        when coalesce(_query, '') = '' then 0::real
        else ts_rank_cd(
          to_tsvector('simple', n.title || ' ' || n.body),
          plainto_tsquery('simple', _query)
        )::real
      end as keyword_score,
      n.importance,
      n.updated_at
    from aio_control.notes n
    where n.workspace_id = _workspace_id
      and n.archived_at is null
      and (_business_id is null or n.business_id = _business_id)
      and (_nav_node_id is null or n.nav_node_id = _nav_node_id)
  )
  select
    s.id,
    s.workspace_id,
    s.business_id,
    s.nav_node_id,
    s.title,
    s.body,
    s.note_type,
    s.source,
    s.source_path,
    s.tags,
    s.vector_score,
    s.keyword_score,
    (
      (s.vector_score * 0.70)
      + (least(s.keyword_score, 1.0) * 0.25)
      + ((s.importance::real / 10.0) * 0.05)
    )::real as combined_score,
    s.updated_at
  from scored s
  where s.vector_score > 0 or s.keyword_score > 0
  order by combined_score desc, s.updated_at desc
  limit greatest(1, least(coalesce(_match_count, 10), 50));
$$;

grant execute on function aio_control.recall_notes(uuid, text, vector, uuid, uuid, integer)
  to authenticated, service_role;

create table if not exists aio_control.note_links (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references aio_control.workspaces(id) on delete cascade,
  from_note_id uuid not null references aio_control.notes(id) on delete cascade,
  to_note_id uuid references aio_control.notes(id) on delete cascade,
  to_ref text,
  relation text not null default 'links_to',
  created_at timestamptz not null default now(),
  check (to_note_id is not null or to_ref is not null)
);

create index if not exists idx_note_links_from
  on aio_control.note_links(workspace_id, from_note_id);
create index if not exists idx_note_links_to
  on aio_control.note_links(workspace_id, to_note_id)
  where to_note_id is not null;

-- Knowledge graph: simple typed triples inside Postgres.
create table if not exists aio_control.entities (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references aio_control.workspaces(id) on delete cascade,
  business_id uuid references aio_control.businesses(id) on delete set null,
  slug text not null,
  name text not null,
  entity_type text not null,
  aliases text[] not null default '{}',
  properties jsonb not null default '{}'::jsonb,
  source_note_id uuid references aio_control.notes(id) on delete set null,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, slug)
);

create index if not exists idx_entities_workspace_type
  on aio_control.entities(workspace_id, entity_type)
  where archived_at is null;
create index if not exists idx_entities_aliases
  on aio_control.entities using gin(aliases);

create table if not exists aio_control.facts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references aio_control.workspaces(id) on delete cascade,
  business_id uuid references aio_control.businesses(id) on delete set null,
  subject_entity_id uuid references aio_control.entities(id) on delete cascade,
  subject_ref text,
  predicate text not null,
  object_text text,
  object_entity_id uuid references aio_control.entities(id) on delete set null,
  confidence numeric not null default 0.8 check (confidence >= 0 and confidence <= 1),
  source_note_id uuid references aio_control.notes(id) on delete set null,
  source_run_id uuid references aio_control.runs(id) on delete set null,
  valid_from timestamptz,
  valid_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (subject_entity_id is not null or subject_ref is not null),
  check (object_text is not null or object_entity_id is not null)
);

create index if not exists idx_facts_subject
  on aio_control.facts(workspace_id, subject_entity_id, predicate)
  where subject_entity_id is not null;
create index if not exists idx_facts_predicate
  on aio_control.facts(workspace_id, predicate);

create table if not exists aio_control.relationships (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references aio_control.workspaces(id) on delete cascade,
  business_id uuid references aio_control.businesses(id) on delete set null,
  from_entity_id uuid not null references aio_control.entities(id) on delete cascade,
  to_entity_id uuid not null references aio_control.entities(id) on delete cascade,
  relation text not null,
  weight numeric not null default 1,
  properties jsonb not null default '{}'::jsonb,
  source_note_id uuid references aio_control.notes(id) on delete set null,
  source_run_id uuid references aio_control.runs(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, from_entity_id, to_entity_id, relation)
);

create index if not exists idx_relationships_from
  on aio_control.relationships(workspace_id, from_entity_id, relation);
create index if not exists idx_relationships_to
  on aio_control.relationships(workspace_id, to_entity_id, relation);

-- Asset registry and sync/deploy inventory.
create table if not exists aio_control.systems (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references aio_control.workspaces(id) on delete cascade,
  system_key text not null,
  name text not null,
  kind text not null default 'machine',
  platform text,
  hostname text,
  tailnet_ip inet,
  status text not null default 'unknown',
  metadata jsonb not null default '{}'::jsonb,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, system_key)
);

create index if not exists idx_systems_workspace_status
  on aio_control.systems(workspace_id, status, last_seen_at desc);

create table if not exists aio_control.assets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references aio_control.workspaces(id) on delete cascade,
  business_id uuid references aio_control.businesses(id) on delete set null,
  slug text not null,
  name text not null,
  asset_type text not null,
  category text,
  description text,
  version text not null default '0.0.0',
  source_uri text,
  checksum text,
  desired_state jsonb not null default '{}'::jsonb,
  required_key_ids uuid[] not null default '{}',
  metadata jsonb not null default '{}'::jsonb,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, slug)
);

create index if not exists idx_assets_workspace_type
  on aio_control.assets(workspace_id, asset_type, category)
  where archived_at is null;

create table if not exists aio_control.deployments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references aio_control.workspaces(id) on delete cascade,
  asset_id uuid not null references aio_control.assets(id) on delete cascade,
  system_id uuid not null references aio_control.systems(id) on delete cascade,
  deployed_version text,
  desired_version text,
  status text not null default 'unknown',
  drift_status text not null default 'unknown',
  local_path text,
  local_checksum text,
  config jsonb not null default '{}'::jsonb,
  last_checked_at timestamptz,
  last_deployed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, asset_id, system_id)
);

create index if not exists idx_deployments_system
  on aio_control.deployments(workspace_id, system_id, status);
create index if not exists idx_deployments_asset
  on aio_control.deployments(workspace_id, asset_id, drift_status);

create table if not exists aio_control.deployment_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references aio_control.workspaces(id) on delete cascade,
  deployment_id uuid references aio_control.deployments(id) on delete cascade,
  asset_id uuid references aio_control.assets(id) on delete set null,
  system_id uuid references aio_control.systems(id) on delete set null,
  event_type text not null,
  status text not null default 'info',
  message text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_deployment_events_workspace_created
  on aio_control.deployment_events(workspace_id, created_at desc);

-- Proposal layer / dream safety.
create table if not exists aio_control.proposals (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references aio_control.workspaces(id) on delete cascade,
  business_id uuid references aio_control.businesses(id) on delete set null,
  nav_node_id uuid references aio_control.nav_nodes(id) on delete set null,
  agent_id uuid references aio_control.agents(id) on delete set null,
  run_id uuid references aio_control.runs(id) on delete set null,
  title text not null,
  summary text not null,
  proposal_type text not null default 'change',
  risk_level text not null default 'medium' check (risk_level in ('low', 'medium', 'high')),
  confidence numeric not null default 0.5 check (confidence >= 0 and confidence <= 1),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'applied', 'rolled_back')),
  proposed_patch jsonb not null default '{}'::jsonb,
  rollback_patch jsonb,
  approval_rules jsonb not null default '{}'::jsonb,
  decided_by uuid references aio_control.profiles(id) on delete set null,
  decided_at timestamptz,
  applied_at timestamptz,
  rolled_back_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_proposals_workspace_status
  on aio_control.proposals(workspace_id, status, created_at desc);
create index if not exists idx_proposals_business_status
  on aio_control.proposals(workspace_id, business_id, status, created_at desc)
  where business_id is not null;

-- Alerts for budgets, keys, providers, deployments.
create table if not exists aio_control.alerts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references aio_control.workspaces(id) on delete cascade,
  business_id uuid references aio_control.businesses(id) on delete set null,
  severity text not null default 'info' check (severity in ('info', 'warning', 'critical')),
  category text not null,
  title text not null,
  message text,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'open' check (status in ('open', 'acknowledged', 'resolved')),
  acknowledged_by uuid references aio_control.profiles(id) on delete set null,
  acknowledged_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_alerts_workspace_status
  on aio_control.alerts(workspace_id, status, severity, created_at desc);

-- Touch/audit triggers where useful.
do $$
declare
  _table text;
begin
  foreach _table in array array[
    'notes', 'entities', 'facts', 'relationships', 'systems',
    'assets', 'deployments', 'proposals'
  ]
  loop
    execute format('drop trigger if exists trg_touch_%I on aio_control.%I', _table, _table);
    execute format(
      'create trigger trg_touch_%I before update on aio_control.%I for each row execute function aio_control._touch_updated_at()',
      _table,
      _table
    );
  end loop;
end $$;

do $$
declare
  _table text;
begin
  foreach _table in array array[
    'notes', 'note_links', 'entities', 'facts', 'relationships',
    'systems', 'assets', 'deployments', 'deployment_events',
    'proposals', 'alerts'
  ]
  loop
    execute format('alter table aio_control.%I enable row level security', _table);

    execute format('drop policy if exists "%s_select_member" on aio_control.%I', _table, _table);
    execute format(
      'create policy "%s_select_member" on aio_control.%I for select using (aio_control.is_workspace_member(workspace_id))',
      _table,
      _table
    );

    execute format('drop policy if exists "%s_insert_editor" on aio_control.%I', _table, _table);
    execute format(
      'create policy "%s_insert_editor" on aio_control.%I for insert with check (aio_control.workspace_role(workspace_id) in (''owner'', ''admin'', ''editor'') or auth.role() = ''service_role'')',
      _table,
      _table
    );

    execute format('drop policy if exists "%s_update_editor" on aio_control.%I', _table, _table);
    execute format(
      'create policy "%s_update_editor" on aio_control.%I for update using (aio_control.workspace_role(workspace_id) in (''owner'', ''admin'', ''editor'') or auth.role() = ''service_role'') with check (aio_control.workspace_role(workspace_id) in (''owner'', ''admin'', ''editor'') or auth.role() = ''service_role'')',
      _table,
      _table
    );

    execute format('drop policy if exists "%s_delete_admin" on aio_control.%I', _table, _table);
    execute format(
      'create policy "%s_delete_admin" on aio_control.%I for delete using (aio_control.workspace_role(workspace_id) in (''owner'', ''admin'') or auth.role() = ''service_role'')',
      _table,
      _table
    );
  end loop;
end $$;

grant select, insert, update, delete on
  aio_control.notes,
  aio_control.note_links,
  aio_control.entities,
  aio_control.facts,
  aio_control.relationships,
  aio_control.systems,
  aio_control.assets,
  aio_control.deployments,
  aio_control.deployment_events,
  aio_control.proposals,
  aio_control.alerts
to authenticated;

grant select, insert, update, delete on
  aio_control.notes,
  aio_control.note_links,
  aio_control.entities,
  aio_control.facts,
  aio_control.relationships,
  aio_control.systems,
  aio_control.assets,
  aio_control.deployments,
  aio_control.deployment_events,
  aio_control.proposals,
  aio_control.alerts
to service_role;
