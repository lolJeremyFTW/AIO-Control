-- 063_agent_topic_links.sql - agents can belong to multiple topics.
--
-- agents.nav_node_id remains the primary/default topic for backwards
-- compatibility with run attribution. This join table stores the full
-- set of topic links used by the UI and topic-scoped agent lists.

create table if not exists aio_control.agent_topic_links (
  agent_id uuid not null references aio_control.agents(id) on delete cascade,
  nav_node_id uuid not null references aio_control.nav_nodes(id) on delete cascade,
  workspace_id uuid not null references aio_control.workspaces(id) on delete cascade,
  business_id uuid not null references aio_control.businesses(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (agent_id, nav_node_id)
);

create index if not exists idx_agent_topic_links_scope
  on aio_control.agent_topic_links(workspace_id, business_id, nav_node_id);
create index if not exists idx_agent_topic_links_agent
  on aio_control.agent_topic_links(agent_id);

create or replace function aio_control._agent_topic_links_enforce_scope()
returns trigger
language plpgsql
as $$
declare
  agent_workspace uuid;
  agent_business uuid;
  node_workspace uuid;
  node_business uuid;
  node_archived timestamptz;
begin
  select a.workspace_id, a.business_id
    into agent_workspace, agent_business
    from aio_control.agents a
   where a.id = new.agent_id
     and a.archived_at is null;

  if agent_workspace is null then
    raise exception 'agent_topic_links agent_id does not reference an active agent';
  end if;

  if agent_business is null then
    raise exception 'workspace-global agents cannot be linked to business topics';
  end if;

  select n.workspace_id, n.business_id, n.archived_at
    into node_workspace, node_business, node_archived
    from aio_control.nav_nodes n
   where n.id = new.nav_node_id;

  if node_workspace is null or node_archived is not null then
    raise exception 'agent_topic_links nav_node_id does not reference an active topic';
  end if;

  if agent_workspace <> node_workspace or agent_business <> node_business then
    raise exception 'agent_topic_links agent and topic must belong to the same business';
  end if;

  new.workspace_id := agent_workspace;
  new.business_id := agent_business;
  return new;
end;
$$;

drop trigger if exists trg_agent_topic_links_enforce_scope
  on aio_control.agent_topic_links;
create trigger trg_agent_topic_links_enforce_scope
  before insert or update on aio_control.agent_topic_links
  for each row execute function aio_control._agent_topic_links_enforce_scope();

alter table aio_control.agent_topic_links enable row level security;

drop policy if exists "agent_topic_links_read_member"
  on aio_control.agent_topic_links;
create policy "agent_topic_links_read_member"
  on aio_control.agent_topic_links for select
  using (aio_control.is_workspace_member(workspace_id));

drop policy if exists "agent_topic_links_insert_editor"
  on aio_control.agent_topic_links;
create policy "agent_topic_links_insert_editor"
  on aio_control.agent_topic_links for insert
  with check (
    aio_control.workspace_role(workspace_id) in ('owner', 'admin', 'editor')
  );

drop policy if exists "agent_topic_links_update_editor"
  on aio_control.agent_topic_links;
create policy "agent_topic_links_update_editor"
  on aio_control.agent_topic_links for update
  using (
    aio_control.workspace_role(workspace_id) in ('owner', 'admin', 'editor')
  )
  with check (
    aio_control.workspace_role(workspace_id) in ('owner', 'admin', 'editor')
  );

drop policy if exists "agent_topic_links_delete_editor"
  on aio_control.agent_topic_links;
create policy "agent_topic_links_delete_editor"
  on aio_control.agent_topic_links for delete
  using (
    aio_control.workspace_role(workspace_id) in ('owner', 'admin', 'editor')
  );

insert into aio_control.agent_topic_links (
  agent_id,
  nav_node_id,
  workspace_id,
  business_id
)
select
  a.id,
  a.nav_node_id,
  a.workspace_id,
  a.business_id
from aio_control.agents a
join aio_control.nav_nodes n
  on n.id = a.nav_node_id
 and n.workspace_id = a.workspace_id
 and n.business_id = a.business_id
 and n.archived_at is null
where a.archived_at is null
  and a.business_id is not null
  and a.nav_node_id is not null
on conflict do nothing;

comment on table aio_control.agent_topic_links is
  'Many-to-many topic links for business-scoped agents. agents.nav_node_id remains the primary/default topic.';
