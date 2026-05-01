-- 003_chat.sql — Phase 3: chat threads + messages + runs.
-- Sits on top of 001 (profiles/workspaces/members/audit) + 002 (businesses,
-- agents). Idempotent so it stays safe to re-run during early iteration.

-- ─── runs ───────────────────────────────────────────────────────────────────
-- Every agent execution lands here. Phase 3 inserts when chat completes;
-- phase 4 inserts when scheduled triggers fire and Claude Routines call back.
create table if not exists public.runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  agent_id uuid not null references public.agents(id) on delete cascade,
  business_id uuid references public.businesses(id) on delete set null,
  schedule_id uuid,            -- backfilled in 004 with FK
  triggered_by text not null,  -- chat|cron|webhook|manual
  status text not null default 'queued',
                               -- queued|running|done|failed|review
  started_at timestamptz,
  ended_at timestamptz,
  duration_ms integer,
  cost_cents integer not null default 0,
  confidence numeric,
  input jsonb,
  output jsonb,
  error_text text,
  created_at timestamptz not null default now()
);

create index if not exists idx_runs_workspace_created
  on public.runs(workspace_id, created_at desc);
create index if not exists idx_runs_agent_status
  on public.runs(agent_id, status);

-- ─── chat_threads ────────────────────────────────────────────────────────────
create table if not exists public.chat_threads (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  agent_id uuid not null references public.agents(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_chat_threads_user
  on public.chat_threads(user_id, updated_at desc);

drop trigger if exists trg_touch_threads on public.chat_threads;
create trigger trg_touch_threads
  before update on public.chat_threads
  for each row execute function public._touch_updated_at();

-- ─── chat_messages ───────────────────────────────────────────────────────────
create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.chat_threads(id) on delete cascade,
  role text not null check (role in ('system', 'user', 'assistant')),
  content jsonb not null,
  tool_calls jsonb,
  run_id uuid references public.runs(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_chat_messages_thread_created
  on public.chat_messages(thread_id, created_at);

-- ─── Audit triggers (runs only — chat traffic would flood the audit log) ─────
drop trigger if exists trg_audit_runs on public.runs;
create trigger trg_audit_runs
  after insert or update on public.runs
  for each row execute function public._audit_row();

-- ─── Row-level security ──────────────────────────────────────────────────────
alter table public.runs enable row level security;
alter table public.chat_threads enable row level security;
alter table public.chat_messages enable row level security;

-- runs: read by workspace members; insert/update by editors+ via server
-- actions, and by service_role (Claude Routines callback).
drop policy if exists "runs_read_member" on public.runs;
create policy "runs_read_member"
  on public.runs for select
  using (public.is_workspace_member(workspace_id));

drop policy if exists "runs_insert_editor" on public.runs;
create policy "runs_insert_editor"
  on public.runs for insert
  with check (public.workspace_role(workspace_id) in ('owner', 'admin', 'editor'));

drop policy if exists "runs_update_editor" on public.runs;
create policy "runs_update_editor"
  on public.runs for update
  using (public.workspace_role(workspace_id) in ('owner', 'admin', 'editor'))
  with check (public.workspace_role(workspace_id) in ('owner', 'admin', 'editor'));

-- chat_threads + chat_messages: a user only sees their own threads, even
-- across other workspaces they belong to. Owners/admins do NOT auto-read
-- another user's chat history (private DM-with-AI semantics).
drop policy if exists "threads_read_self" on public.chat_threads;
create policy "threads_read_self"
  on public.chat_threads for select
  using (user_id = auth.uid());

drop policy if exists "threads_insert_self" on public.chat_threads;
create policy "threads_insert_self"
  on public.chat_threads for insert
  with check (
    user_id = auth.uid()
    and public.is_workspace_member(workspace_id)
  );

drop policy if exists "threads_update_self" on public.chat_threads;
create policy "threads_update_self"
  on public.chat_threads for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "threads_delete_self" on public.chat_threads;
create policy "threads_delete_self"
  on public.chat_threads for delete
  using (user_id = auth.uid());

drop policy if exists "messages_read_owner" on public.chat_messages;
create policy "messages_read_owner"
  on public.chat_messages for select
  using (
    exists (
      select 1 from public.chat_threads t
      where t.id = chat_messages.thread_id
        and t.user_id = auth.uid()
    )
  );

drop policy if exists "messages_insert_owner" on public.chat_messages;
create policy "messages_insert_owner"
  on public.chat_messages for insert
  with check (
    exists (
      select 1 from public.chat_threads t
      where t.id = chat_messages.thread_id
        and t.user_id = auth.uid()
    )
  );
