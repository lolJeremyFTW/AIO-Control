-- Agent dashboards are rendered through business/topic tabs and should only
-- be readable by the owner of the workspace they were created in.

drop policy if exists "agent_dashboards_read" on aio_control.agent_dashboards;
create policy "agent_dashboards_read"
  on aio_control.agent_dashboards for select
  using (aio_control.workspace_role(workspace_id) = 'owner');

update aio_control.custom_tabs tabs
set url = 'aio-dashboard:' || dashboards.slug
from aio_control.agent_dashboards dashboards
where tabs.workspace_id = dashboards.workspace_id
  and tabs.business_id is not distinct from dashboards.business_id
  and substring(tabs.url from '/d/([A-Za-z0-9_-]+)') = dashboards.slug;
