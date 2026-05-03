-- 024_marketplace_public.sql — public read on the marketplace agents
-- catalog so we can render a /share/<slug> page without a session.
-- The catalog is curator-managed (only service_role inserts) so
-- making it world-readable is intentional + safe.

alter table aio_control.marketplace_agents enable row level security;

drop policy if exists "marketplace_public_read" on aio_control.marketplace_agents;
create policy "marketplace_public_read" on aio_control.marketplace_agents
  for select to anon, authenticated
  using (true);

-- Track the share count so popularity can be a sort key later.
alter table aio_control.marketplace_agents
  add column if not exists share_count integer not null default 0,
  add column if not exists install_count integer not null default 0;

create or replace function aio_control.bump_marketplace_share(_slug text)
returns void
language sql
security definer
set search_path = public, aio_control
as $$
  update aio_control.marketplace_agents
  set share_count = share_count + 1
  where slug = _slug;
$$;

grant execute on function aio_control.bump_marketplace_share(text) to anon, authenticated;
