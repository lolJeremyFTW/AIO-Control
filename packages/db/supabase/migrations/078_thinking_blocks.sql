-- 078_thinking_blocks.sql
-- Preserve filterable thinking/status blocks in compact run history previews.

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
    when 'thinking' then
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

comment on column aio_control.runs.message_history is
  'Structured replay steps for run detail drawers: user, assistant, thinking, tool_call, and error.';
