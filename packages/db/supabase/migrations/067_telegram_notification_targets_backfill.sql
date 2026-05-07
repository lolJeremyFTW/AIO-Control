-- 067_telegram_notification_targets_backfill.sql
--
-- Move existing Telegram routing into the provider-neutral notification
-- layer without deleting or rewriting the legacy telegram_targets rows.
-- The generic row uses the same UUID as the legacy row, which keeps old
-- agent/schedule foreign keys usable as notification target IDs.

insert into aio_control.notification_targets (
  id,
  workspace_id,
  provider,
  scope,
  scope_id,
  name,
  config,
  allowlist,
  denylist,
  send_run_done,
  send_run_fail,
  send_queue_review,
  enabled,
  created_by,
  created_at,
  updated_at
)
select
  tt.id,
  tt.workspace_id,
  'telegram',
  tt.scope,
  case when tt.scope = 'workspace' then tt.workspace_id else tt.scope_id end,
  tt.name,
  jsonb_build_object(
    'chat_id', tt.chat_id,
    'topic_id', tt.topic_id,
    'legacy_target_id', tt.id
  ),
  tt.allowlist,
  tt.denylist,
  tt.send_run_done,
  tt.send_run_fail,
  tt.send_queue_review,
  tt.enabled,
  tt.created_by,
  tt.created_at,
  tt.updated_at
from aio_control.telegram_targets tt
on conflict (id) do update set
  workspace_id = excluded.workspace_id,
  provider = excluded.provider,
  scope = excluded.scope,
  scope_id = excluded.scope_id,
  name = excluded.name,
  config = excluded.config,
  allowlist = excluded.allowlist,
  denylist = excluded.denylist,
  send_run_done = excluded.send_run_done,
  send_run_fail = excluded.send_run_fail,
  send_queue_review = excluded.send_queue_review,
  enabled = excluded.enabled,
  updated_at = excluded.updated_at;

insert into aio_control.notification_bindings (
  workspace_id,
  owner_type,
  owner_id,
  target_id,
  event_mask,
  created_by,
  created_at
)
select
  tt.workspace_id,
  tt.scope,
  case when tt.scope = 'workspace' then tt.workspace_id else tt.scope_id end,
  tt.id,
  array_remove(array[
    case when tt.send_run_done then 'run_done' end,
    case when tt.send_run_fail then 'run_fail' end,
    case when tt.send_queue_review then 'queue_review' end
  ], null)::text[],
  tt.created_by,
  tt.created_at
from aio_control.telegram_targets tt
on conflict (workspace_id, owner_type, owner_id, target_id) do update set
  event_mask = excluded.event_mask;

insert into aio_control.notification_bindings (
  workspace_id,
  owner_type,
  owner_id,
  target_id,
  event_mask
)
select
  a.workspace_id,
  'agent',
  a.id,
  a.telegram_target_id,
  array_remove(array[
    case when tt.send_run_done then 'run_done' end,
    case when tt.send_run_fail then 'run_fail' end
  ], null)::text[]
from aio_control.agents a
join aio_control.telegram_targets tt on tt.id = a.telegram_target_id
where a.telegram_target_id is not null
on conflict (workspace_id, owner_type, owner_id, target_id) do update set
  event_mask = excluded.event_mask;

insert into aio_control.notification_bindings (
  workspace_id,
  owner_type,
  owner_id,
  target_id,
  event_mask
)
select
  s.workspace_id,
  'schedule',
  s.id,
  s.telegram_target_id,
  array_remove(array[
    case when tt.send_run_done then 'run_done' end,
    case when tt.send_run_fail then 'run_fail' end
  ], null)::text[]
from aio_control.schedules s
join aio_control.telegram_targets tt on tt.id = s.telegram_target_id
where s.telegram_target_id is not null
on conflict (workspace_id, owner_type, owner_id, target_id) do update set
  event_mask = excluded.event_mask;
