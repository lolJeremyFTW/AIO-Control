-- 069_run_detail_history_preview.sql
-- Compact run.message_history for the run-detail drawer.
--
-- Some tool-heavy runs store tens of MB of JSON in message_history. The UI
-- only needs readable previews for tool args/results, so this RPC clips large
-- JSON/text fields inside Postgres before the API sends them to the browser.

create or replace function aio_control._run_detail_clip_text(
  _value text,
  _max_chars integer
)
returns text
language sql
immutable
as $$
  select case
    when _value is null then null
    when length(_value) <= greatest(_max_chars, 0) then _value
    else
      left(_value, greatest(_max_chars, 0)) ||
      E'\n... ' ||
      (length(_value) - greatest(_max_chars, 0))::text ||
      ' characters hidden'
  end;
$$;

create or replace function aio_control._run_detail_preview_jsonb(
  _value jsonb,
  _max_chars integer
)
returns jsonb
language sql
immutable
as $$
  select case
    when _value is null then null
    when length(_value::text) <= greatest(_max_chars, 0) then _value
    else to_jsonb(aio_control._run_detail_clip_text(_value::text, _max_chars))
  end;
$$;

create or replace function aio_control._run_detail_preview_step(
  _step jsonb,
  _max_text_chars integer,
  _max_json_chars integer
)
returns jsonb
language sql
immutable
as $$
  select case _step->>'kind'
    when 'user' then
      jsonb_set(
        _step,
        '{text}',
        to_jsonb(aio_control._run_detail_clip_text(_step->>'text', _max_text_chars)),
        true
      )
    when 'assistant' then
      jsonb_set(
        _step,
        '{text}',
        to_jsonb(aio_control._run_detail_clip_text(_step->>'text', _max_text_chars)),
        true
      )
    when 'error' then
      jsonb_set(
        _step,
        '{message}',
        to_jsonb(aio_control._run_detail_clip_text(_step->>'message', _max_text_chars)),
        true
      )
    when 'tool_call' then
      jsonb_strip_nulls(
        jsonb_set(
          jsonb_set(
            _step,
            '{args}',
            aio_control._run_detail_preview_jsonb(_step->'args', _max_json_chars),
            true
          ),
          '{result}',
          aio_control._run_detail_preview_jsonb(_step->'result', _max_json_chars),
          true
        )
      )
    else _step
  end;
$$;

create or replace function aio_control.run_message_history_preview(
  _run_id uuid,
  _max_steps integer default 200,
  _max_text_chars integer default 20000,
  _max_json_chars integer default 4000
)
returns jsonb
language sql
stable
security invoker
set search_path = aio_control, public
as $$
  with source as (
    select case
      when jsonb_typeof(message_history) = 'array' then message_history
      else '[]'::jsonb
    end as history
    from aio_control.runs
    where id = _run_id
  ),
  steps as (
    select elem, ord
    from source,
      lateral jsonb_array_elements(source.history) with ordinality as item(elem, ord)
    order by ord
    limit greatest(_max_steps, 0)
  )
  select coalesce(
    jsonb_agg(
      aio_control._run_detail_preview_step(
        elem,
        _max_text_chars,
        _max_json_chars
      )
      order by ord
    ),
    '[]'::jsonb
  )
  from steps;
$$;

grant execute on function aio_control.run_message_history_preview(
  uuid,
  integer,
  integer,
  integer
) to authenticated, service_role;
