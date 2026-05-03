-- 033_login_events.sql — per-user login audit trail. Records every
-- successful authentication so the user can review where & when their
-- account was accessed (security panel in profile settings).
--
-- Population: not via DB trigger because Supabase's auth.users updates
-- on every refresh, which would spam the table. Instead the Next.js
-- middleware writes a row the first time it sees a session it hasn't
-- recorded for the current cookie-day. See lib/auth/login-events.ts.
--
-- Retention: keep the last 90 days; older rows can be pruned by a cron
-- (handled by deploy/install-cron.sh once the prune script lands).

create table if not exists aio_control.login_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references aio_control.profiles(id) on delete cascade,
  ip_address inet,
  user_agent text,
  -- Parsed device hint computed app-side from user_agent so the UI
  -- doesn't need to re-parse on every render. Examples:
  --   "Chrome on Windows", "Safari on iOS", "Firefox on macOS".
  device_label text,
  -- "password" | "magic_link" | "oauth:<provider>" | "session_refresh"
  -- (we de-dupe session_refresh entries app-side; only the first per
  --  rolling 12h window gets recorded).
  method text not null default 'password',
  created_at timestamptz not null default now()
);

create index if not exists idx_login_events_user_created
  on aio_control.login_events(user_id, created_at desc);

-- ─── RLS ─────────────────────────────────────────────────────────────────────
alter table aio_control.login_events enable row level security;

-- A user can only see their own login history. service_role bypasses
-- RLS for inserts (the middleware uses the service-role client to
-- write, since we don't want clients spoofing rows for other users).
drop policy if exists "login_events_select_own" on aio_control.login_events;
create policy "login_events_select_own"
  on aio_control.login_events for select
  using (user_id = auth.uid());

-- No client-side insert/update/delete policies — only service_role can
-- write, and we never let users edit or delete their own login history
-- (it's an audit trail).
