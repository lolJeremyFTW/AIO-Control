-- 050_outreach_tracking.sql — Outreach freebie tracking infrastructure.
--
-- The outreach cron generates one HTML freebie per lead. Instead of
-- emailing a file as attachment, we host it at /r/[token] and embed
-- that URL in the pitch. When the prospect opens it, we log a view.
-- When they reply by email, an IMAP poller hits /api/internal/outreach/reply
-- which lands here too.
--
-- Source of truth notes:
--  • leads_data.js on the VPS still holds the master lead list (status,
--    pitch, branche, etc.). This table is a *projection* keyed by
--    (workspace_id, vps_lead_id) — only leads that actually got a
--    freebie generated get rows here.
--  • outreach_views is append-only event log; counts are derived.
--    A unique constraint per (lead_token, ip_hash) within a 60-minute
--    bucket keeps refresh-spam out.

create table if not exists aio_control.outreach_leads (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references aio_control.workspaces(id) on delete cascade,
  business_id uuid not null references aio_control.businesses(id) on delete cascade,
  -- Source-of-truth lead id from leads_data.js on the VPS.
  vps_lead_id integer not null,
  -- Short URL-safe token used in /r/[token]. Unique globally so the
  -- public route doesn't have to know the workspace.
  token text not null unique,
  lead_name text not null,
  lead_email text,
  lead_website text,
  lead_branche text,
  lead_regio text,
  -- Full HTML body of the freebie report (10-30KB typical).
  html_content text not null,
  -- Aggregate scoring 0-100 (sum of per-angle scores, agent-computed).
  score integer,
  -- Per-angle scores as { "A": 7, "B": 8, "C": 6, "D": 9, "E": 7 }.
  angle_scores jsonb,
  -- Updated by /api/internal/outreach/reply when an email reply matches.
  responded_at timestamptz,
  reply_subject text,
  reply_body text,
  reply_from text,
  -- Cached counters maintained by triggers below — avoids the count(*)
  -- aggregate every time the dashboard renders.
  view_count integer not null default 0,
  last_viewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, vps_lead_id)
);

create index if not exists idx_outreach_leads_workspace
  on aio_control.outreach_leads(workspace_id);
create index if not exists idx_outreach_leads_business
  on aio_control.outreach_leads(business_id);
create index if not exists idx_outreach_leads_responded
  on aio_control.outreach_leads(responded_at) where responded_at is not null;
create index if not exists idx_outreach_leads_viewed
  on aio_control.outreach_leads(last_viewed_at desc nulls last);

drop trigger if exists trg_touch_outreach_leads on aio_control.outreach_leads;
create trigger trg_touch_outreach_leads
  before update on aio_control.outreach_leads
  for each row execute function aio_control._touch_updated_at();

create table if not exists aio_control.outreach_views (
  id bigserial primary key,
  lead_id uuid not null references aio_control.outreach_leads(id) on delete cascade,
  -- SHA256 of the client IP — never store the IP itself, GDPR-friendly.
  ip_hash text,
  user_agent text,
  -- The Referer (so we can tell if it came from a Telegram preview unfurl
  -- vs. a direct click). Truncated to 200 chars at write time.
  referer text,
  viewed_at timestamptz not null default now()
);

create index if not exists idx_outreach_views_lead_time
  on aio_control.outreach_views(lead_id, viewed_at desc);

-- Bump the cached counters on every insert. Triggers are cheaper than
-- having the read path do count(*).
create or replace function aio_control._bump_outreach_view_counters()
returns trigger language plpgsql as $$
begin
  update aio_control.outreach_leads
    set view_count = view_count + 1,
        last_viewed_at = new.viewed_at,
        updated_at = now()
    where id = new.lead_id;
  return new;
end$$;

drop trigger if exists trg_outreach_view_counters on aio_control.outreach_views;
create trigger trg_outreach_view_counters
  after insert on aio_control.outreach_views
  for each row execute function aio_control._bump_outreach_view_counters();

-- RLS — workspace members can read their leads, only service role writes.
alter table aio_control.outreach_leads enable row level security;
alter table aio_control.outreach_views enable row level security;

drop policy if exists "outreach_leads_read" on aio_control.outreach_leads;
create policy "outreach_leads_read"
  on aio_control.outreach_leads for select
  using (aio_control.is_workspace_member(workspace_id));

drop policy if exists "outreach_views_read" on aio_control.outreach_views;
create policy "outreach_views_read"
  on aio_control.outreach_views for select
  using (
    exists (
      select 1 from aio_control.outreach_leads l
      where l.id = lead_id
        and aio_control.is_workspace_member(l.workspace_id)
    )
  );

-- Add the new tables to the realtime publication so the dashboard's
-- "Geopend" badge updates live without a page refresh.
do $$
begin
  begin
    alter publication supabase_realtime add table aio_control.outreach_leads;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table aio_control.outreach_views;
  exception when duplicate_object then null;
  end;
end $$;
