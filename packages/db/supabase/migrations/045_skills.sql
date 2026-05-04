-- 045_skills.sql — workspace-scoped reusable skill snippets that
-- agents can opt into. Pattern lifted from OpenClaw's SKILL.md
-- design: each skill has a name + short description + markdown body.
-- The system-prompt builder injects enabled skills as a "## Skills"
-- block so the model knows when + how to apply them.
--
-- Scope = workspace. A skill is editable by workspace editors and
-- readable by every member. Per-agent allow-list lives on
-- aio_control.agents.allowed_skills (uuid[]).

create table if not exists aio_control.skills (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references aio_control.workspaces(id) on delete cascade,
  -- Short identifier shown in the agent picker + injected as a
  -- markdown bullet header. e.g. "google-meet", "lead-research",
  -- "instagram-reply".
  name text not null,
  -- One-liner that tells the model when to apply this skill. Lifted
  -- from OpenClaw's frontmatter `description:` field.
  description text not null,
  -- Markdown body — the actual instructions. Free-form, but kept
  -- compact (skills compete for context window). Recommended < 500
  -- words per skill.
  body text not null,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  unique (workspace_id, name)
);

create index if not exists idx_skills_workspace
  on aio_control.skills(workspace_id) where archived_at is null;

alter table aio_control.skills enable row level security;

drop policy if exists "skills_select_member" on aio_control.skills;
create policy "skills_select_member"
  on aio_control.skills for select
  using (aio_control.is_workspace_member(workspace_id));

drop policy if exists "skills_write_editor" on aio_control.skills;
create policy "skills_write_editor"
  on aio_control.skills for all
  using (aio_control.workspace_role(workspace_id) in ('owner', 'admin', 'editor'))
  with check (aio_control.workspace_role(workspace_id) in ('owner', 'admin', 'editor'));

-- Audit trigger so skill changes show up in the workspace audit log
-- alongside agent + business mutations.
drop trigger if exists trg_audit_skills on aio_control.skills;
create trigger trg_audit_skills
  after insert or update or delete on aio_control.skills
  for each row execute function aio_control._audit_row();

-- Bump updated_at on row update.
drop trigger if exists trg_touch_skills on aio_control.skills;
create trigger trg_touch_skills
  before update on aio_control.skills
  for each row execute function aio_control._touch_updated_at();

-- Per-agent allow-list. NULL = no skills enabled (current behaviour
-- for existing agents). An empty array also means none. Non-empty
-- means: only these skill ids are surfaced to the model.
alter table aio_control.agents
  add column if not exists allowed_skills uuid[];

create index if not exists idx_agents_allowed_skills_present
  on aio_control.agents(id) where allowed_skills is not null;
