-- Keep one in-flight automated run per schedule, with self-healing locks.

create table if not exists aio_control.scheduled_run_locks (
  schedule_id uuid primary key references aio_control.schedules(id) on delete cascade,
  active_run_id uuid not null references aio_control.runs(id) on delete cascade,
  locked_at timestamptz not null default now()
);

alter table aio_control.scheduled_run_locks
  drop constraint if exists one_active_run;

create or replace function aio_control.acquire_schedule_run_lock(
  p_schedule_id uuid,
  p_run_id uuid
) returns boolean
language plpgsql
security definer
set search_path = aio_control, public
as $$
declare
  affected integer := 0;
begin
  -- Reap locks for terminal runs. This covers process crashes after a run
  -- finished but before release_schedule_run_lock was called.
  delete from aio_control.scheduled_run_locks l
  using aio_control.runs r
  where l.active_run_id = r.id
    and r.status in ('done', 'failed', 'cancelled');

  insert into aio_control.scheduled_run_locks (
    schedule_id,
    active_run_id,
    locked_at
  )
  values (p_schedule_id, p_run_id, now())
  on conflict (schedule_id) do update
    set active_run_id = excluded.active_run_id,
        locked_at = excluded.locked_at
    where aio_control.scheduled_run_locks.locked_at < now() - interval '2 hours'
       or not exists (
         select 1
         from aio_control.runs r
         where r.id = aio_control.scheduled_run_locks.active_run_id
           and r.status = 'running'
       );

  get diagnostics affected = row_count;
  return affected > 0;
end;
$$;

create or replace function aio_control.release_schedule_run_lock(
  p_schedule_id uuid,
  p_run_id uuid
) returns void
language plpgsql
security definer
set search_path = aio_control, public
as $$
begin
  delete from aio_control.scheduled_run_locks
  where schedule_id = p_schedule_id
    and active_run_id = p_run_id;
end;
$$;

grant execute on function aio_control.acquire_schedule_run_lock(uuid, uuid)
  to service_role;
grant execute on function aio_control.release_schedule_run_lock(uuid, uuid)
  to service_role;
