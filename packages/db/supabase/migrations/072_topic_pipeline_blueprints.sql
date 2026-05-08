-- 072_topic_pipeline_blueprints.sql
--
-- Let every business and every topic own its own editable pipeline
-- blueprint. Runtime events still flow through the existing outreach
-- tables; this adds the per-scope definition the visual builder edits.

alter table aio_control.outreach_pipeline_configs
  add column if not exists nav_node_id uuid references aio_control.nav_nodes(id) on delete cascade,
  add column if not exists pipeline_steps jsonb not null default '[]'::jsonb,
  add column if not exists pipeline_blueprint jsonb not null default '{}'::jsonb;

alter table aio_control.outreach_pipeline_runs
  add column if not exists nav_node_id uuid references aio_control.nav_nodes(id) on delete set null;

alter table aio_control.outreach_pipeline_events
  add column if not exists nav_node_id uuid references aio_control.nav_nodes(id) on delete set null;

alter table aio_control.outreach_pipeline_configs
  drop constraint if exists outreach_pipeline_configs_workspace_id_business_id_key;

create unique index if not exists idx_outreach_pipeline_configs_scope_unique
  on aio_control.outreach_pipeline_configs(workspace_id, business_id, coalesce(nav_node_id, '00000000-0000-0000-0000-000000000000'::uuid));

create index if not exists idx_outreach_pipeline_configs_topic
  on aio_control.outreach_pipeline_configs(workspace_id, business_id, nav_node_id);

create index if not exists idx_outreach_pipeline_runs_topic_time
  on aio_control.outreach_pipeline_runs(workspace_id, business_id, nav_node_id, created_at desc);

create index if not exists idx_outreach_pipeline_events_topic_time
  on aio_control.outreach_pipeline_events(workspace_id, business_id, nav_node_id, created_at desc);
