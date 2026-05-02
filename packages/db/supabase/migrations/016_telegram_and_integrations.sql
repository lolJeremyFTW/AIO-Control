-- 016_telegram_and_integrations.sql — Telegram channels + generic
-- outbound integrations (HTTP webhooks, custom API endpoints).
--
-- Resolution mirrors api_keys: a target can be configured workspace-
-- wide and overridden per business or per nav-node. Each agent +
-- schedule can declare a `target_id` referencing a row here so reports
-- end up in the right channel.

-- ─── telegram_targets ────────────────────────────────────────────────────────
-- Bot token lives in the api_keys table (provider='telegram'). This
-- table just stores the routing details: chat_id (group/channel),
-- optional topic_id (for forum-style group threads), and
-- allowlist/denylist controlling who in the chat can issue commands
-- back to the bot (future inbound flow; placeholder columns now).
create table if not exists aio_control.telegram_targets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references aio_control.workspaces(id) on delete cascade,
  -- Where this routing applies. workspace = default fallback.
  scope text not null check (scope in ('workspace', 'business', 'navnode')),
  scope_id uuid not null,
  name text not null,
  chat_id text not null,
  -- Telegram forum topics: only populated when chat_id is a supergroup
  -- with topics enabled. Leave null for regular chats.
  topic_id integer,
  -- Username allowlist / denylist as plain text arrays. allow=null means
  -- everyone allowed. deny always evaluated; a username on deny blocks
  -- even if also on allow.
  allowlist text[] not null default array[]::text[],
  denylist text[] not null default array[]::text[],
  -- Whether to send run-completion notifications, run-failure alerts,
  -- queue-review pings. Default: send all three.
  send_run_done boolean not null default true,
  send_run_fail boolean not null default true,
  send_queue_review boolean not null default true,
  enabled boolean not null default true,
  created_by uuid references aio_control.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_telegram_targets_workspace
  on aio_control.telegram_targets(workspace_id, scope, scope_id);

alter table aio_control.telegram_targets enable row level security;

drop policy if exists "telegram_targets_member_read" on aio_control.telegram_targets;
create policy "telegram_targets_member_read" on aio_control.telegram_targets
  for select using (
    workspace_id in (
      select workspace_id from aio_control.workspace_members
      where user_id = auth.uid()
    )
  );

drop policy if exists "telegram_targets_editor_write" on aio_control.telegram_targets;
create policy "telegram_targets_editor_write" on aio_control.telegram_targets
  for all using (
    workspace_id in (
      select workspace_id from aio_control.workspace_members
      where user_id = auth.uid()
        and role in ('owner', 'admin', 'editor')
    )
  )
  with check (
    workspace_id in (
      select workspace_id from aio_control.workspace_members
      where user_id = auth.uid()
        and role in ('owner', 'admin', 'editor')
    )
  );

-- ─── custom_integrations ─────────────────────────────────────────────────────
-- Generic outbound HTTP integration: a URL + method + header template +
-- body template. Headers can reference {{var}} for substitution at
-- send-time (we keep that simple — just simple string replace).
create table if not exists aio_control.custom_integrations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references aio_control.workspaces(id) on delete cascade,
  scope text not null check (scope in ('workspace', 'business', 'navnode')),
  scope_id uuid not null,
  name text not null,
  url text not null,
  method text not null default 'POST'
    check (method in ('GET', 'POST', 'PUT', 'PATCH', 'DELETE')),
  -- Headers as a JSON object: { "Authorization": "Bearer ${TOKEN}", ... }
  headers jsonb not null default '{}'::jsonb,
  -- Body template — when JSON, we render it as application/json. The
  -- mustache-style {{run.status}} / {{run.output}} get substituted.
  body_template text,
  -- Which event types fire this integration.
  on_run_done boolean not null default true,
  on_run_fail boolean not null default true,
  on_queue_review boolean not null default false,
  enabled boolean not null default true,
  created_by uuid references aio_control.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_custom_integrations_workspace
  on aio_control.custom_integrations(workspace_id, scope, scope_id);

alter table aio_control.custom_integrations enable row level security;

drop policy if exists "custom_integrations_member_read" on aio_control.custom_integrations;
create policy "custom_integrations_member_read" on aio_control.custom_integrations
  for select using (
    workspace_id in (
      select workspace_id from aio_control.workspace_members
      where user_id = auth.uid()
    )
  );

drop policy if exists "custom_integrations_editor_write" on aio_control.custom_integrations;
create policy "custom_integrations_editor_write" on aio_control.custom_integrations
  for all using (
    workspace_id in (
      select workspace_id from aio_control.workspace_members
      where user_id = auth.uid()
        and role in ('owner', 'admin', 'editor')
    )
  )
  with check (
    workspace_id in (
      select workspace_id from aio_control.workspace_members
      where user_id = auth.uid()
        and role in ('owner', 'admin', 'editor')
    )
  );

-- ─── Per-agent + per-schedule routing ────────────────────────────────────────
-- Adds optional foreign keys so each agent / schedule can declare WHERE
-- its run reports go.
alter table aio_control.agents
  add column if not exists telegram_target_id uuid
    references aio_control.telegram_targets(id) on delete set null,
  add column if not exists custom_integration_id uuid
    references aio_control.custom_integrations(id) on delete set null;

alter table aio_control.schedules
  add column if not exists title text,
  add column if not exists description text,
  add column if not exists instructions text,
  add column if not exists telegram_target_id uuid
    references aio_control.telegram_targets(id) on delete set null,
  add column if not exists custom_integration_id uuid
    references aio_control.custom_integrations(id) on delete set null,
  add column if not exists timezone text not null default 'Europe/Amsterdam';
