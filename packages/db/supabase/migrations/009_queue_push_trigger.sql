-- 009_queue_push_trigger.sql — Phase 7c (auto-fire): when a queue item
-- lands in 'review' or 'fail' state, fan out a push notification to all
-- workspace members who have a push_subscription. We use pg_net's async
-- HTTP client (ships with Supabase's Postgres) to POST to our own
-- /api/push/queue-event endpoint with a service token; that endpoint
-- looks up subscriptions and calls web-push (Node-only).

create extension if not exists pg_net with schema extensions;

-- Tiny key/value table for runtime config the trigger needs (origin URL,
-- callback secret). We use a table instead of ALTER DATABASE SET because
-- some self-hosted Supabase setups don't grant the postgres user the
-- needed role to set custom GUCs at the DB level.
create table if not exists aio_control._settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

-- Defaults — overwrite from your deploy script with the actual secret +
-- public origin (matches NEXT_PUBLIC_TRIGGER_ORIGIN / BASE_PATH).
insert into aio_control._settings (key, value)
values
  ('public_origin', 'https://tromptech.life'),
  ('base_path', '/aio'),
  ('callback_secret', '')
on conflict (key) do nothing;

create or replace function aio_control._setting(k text)
returns text language sql security definer set search_path = aio_control
stable as $$
  select value from aio_control._settings where key = k limit 1;
$$;

create or replace function aio_control._notify_queue_event()
returns trigger
language plpgsql
security definer
set search_path = aio_control, extensions
as $$
declare
  origin text := coalesce(aio_control._setting('public_origin'), 'https://tromptech.life');
  base_path text := coalesce(aio_control._setting('base_path'), '/aio');
  secret text := coalesce(aio_control._setting('callback_secret'), '');
  url text;
  body jsonb;
begin
  -- Only fire on rows that need attention. Auto rows don't need a push
  -- (they're handled without the operator), and we deliberately skip
  -- updates that happen as part of resolving the item.
  if (TG_OP = 'INSERT' and (NEW.state = 'review' or NEW.state = 'fail'))
     or (TG_OP = 'UPDATE'
         and OLD.state is distinct from NEW.state
         and (NEW.state = 'review' or NEW.state = 'fail')
         and NEW.resolved_at is null)
  then
    -- If we don't have a callback secret configured the API would
    -- reject the call anyway — short-circuit to keep the trigger cheap.
    if secret = '' then return NEW; end if;

    url := origin || base_path || '/api/push/queue-event';
    body := jsonb_build_object(
      'workspace_id', NEW.workspace_id,
      'business_id', NEW.business_id,
      'queue_item_id', NEW.id,
      'state', NEW.state,
      'title', NEW.title
    );
    perform extensions.http_post(
      url := url,
      body := body,
      headers := jsonb_build_object(
        'content-type', 'application/json',
        'x-aio-callback-secret', secret
      )
    );
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_queue_push on aio_control.queue_items;
create trigger trg_queue_push
  after insert or update on aio_control.queue_items
  for each row execute function aio_control._notify_queue_event();
