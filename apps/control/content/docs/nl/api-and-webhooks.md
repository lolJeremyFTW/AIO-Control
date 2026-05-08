---
title: API en webhooks
description: Webhook triggers, run callbacks, streaming chat, push.
---

## Authenticated endpoints

Default: cookie-based auth via Supabase SSR. Gebruik vanuit uw browser-sessie.

## Public endpoints

| Endpoint | Wat |
|----------|-----|
| `/api/health` | 200 / 503 voor Caddy probe |
| `/api/version` | Build SHA plus timestamp |
| `/api/auth/oauth-config` | Welke OAuth-providers actief zijn |
| `/api/triggers/[secret]` | Webhook trigger voor schedules |
| `/share/[slug]` | Public marketplace listing |
| `/r/[token]` | Outreach freebie redirect |
| `/docs/[locale]/...` | Deze documentatie zelf |

## Triggering een agent run via webhook

```bash
curl -X POST https://aio.tromptech.life/api/triggers/<your-secret> \
  -H "Content-Type: application/json" \
  -d '{
    "trigger": "github_push",
    "repo": "myrepo",
    "commits": [...]
  }'
```

Response: `{ "ok": true, "run_id": "uuid" }`. De agent krijgt de body als `input`.

## Routines callback (subscription Claude)

Anthropic Routines POST-en naar `/api/runs/result` (payload-based, nieuwer) of `/api/runs/[run_id]/result` (URL-param, legacy). Beide routes parsen de Routines-response en updaten de run-row.

## Streaming chat

`POST /api/chat/[agent_id]` met body:

```json
{
  "thread_id": "optional-uuid",
  "message": "Wat is de status van mijn outreach pipeline?",
  "approve_tool": null
}
```

Response: SSE stream met AG-UI events:

- `text_chunk` -- tokens
- `tool_use_start` / `tool_use_end`
- `tool_call_pending` (voor approve)
- `usage` (final tokens plus cost)
- `done`

## Cancel een run

```bash
curl -X POST https://aio.tromptech.life/api/runs/<run_id>/stop
```

## Follow-up op een run

```bash
curl -X POST https://aio.tromptech.life/api/runs/<run_id>/followup \
  -d '{"message": "Probeer opnieuw maar nu met scope=last-week"}'
```

## Search

```bash
curl "https://aio.tromptech.life/api/search?q=outreach"
```

Returns: workspaces / businesses / agents / runs / topics matching de query.

## Push notifications

- `GET /api/push/key` -- VAPID public key
- `POST /api/push/subscribe` -- registreer een subscription
- `POST /api/push/test` -- stuur een test-push naar uw devices
- `POST /api/push/queue-event` -- intern, getriggerd bij queue inserts
