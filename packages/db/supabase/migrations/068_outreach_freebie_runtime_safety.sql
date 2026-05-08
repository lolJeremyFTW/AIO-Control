-- 068_outreach_freebie_runtime_safety.sql
--
-- Replace the heavy freebie cron prompt with a short deterministic batch
-- call and reduce the Outreach Agent MCP footprint. The agent still keeps
-- fetch because the pitch-leads schedule uses it, but browser/filesystem and
-- the extra minimax MCP server are removed.

update aio_control.agents
   set config =
       coalesce(config, '{}'::jsonb)
       || jsonb_build_object(
            'maxHops', 40,
            'timeoutMs', 900000,
            'mcpServers', jsonb_build_array('aio', 'bash', 'fetch')
          )
 where id = 'c45ef6e6-8fab-4fc2-ace4-00d2705a7912';

update aio_control.schedules
   set enabled = true,
       cron_expr = '17,47 * * * *',
       instructions = $body$
## TrompTech Outreach - Freebie batch (safe)

Voer exact 1 batch uit en stop. Niet scrapen, niet browsen, geen Playwright,
geen filesystem writes, geen loops.

1. Gebruik `bash__bash` met exact deze command:

```bash
curl -fsS -X POST "http://127.0.0.1:3012/api/internal/outreach/freebie-batch" \
  -H "Authorization: Bearer $AGENT_SECRET_KEY" \
  -H "Content-Type: application/json" \
  -d '{"workspace_id":"cee51c60-3b60-4bdb-b714-b3c7fb886935","business_id":"59831e1d-9ad0-4a43-b116-cc48f6252cde","limit":2}'
```

2. Lees de JSON. Als `processed_count > 0`, stuur een korte Telegram met
   `aio__send_telegram_message`:
   "Freebies aangemaakt: [processed_count]" plus maximaal 2 regels met naam + url.

3. Als `processed_count = 0`, stuur geen Telegram; antwoord alleen kort:
   "Geen leads voor freebie."
$body$
 where id = '8f3f31cc-5e3b-49f2-bc2b-35c247cbfd22';

update aio_control.runs
   set next_retry_at = null
 where schedule_id = '8f3f31cc-5e3b-49f2-bc2b-35c247cbfd22'
   and status = 'failed';
