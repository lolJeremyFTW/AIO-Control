---
title: API and webhooks
description: Webhook triggers, run callbacks, streaming chat, push.
---

## Authenticated endpoints

Default: cookie-based auth via Supabase SSR. Use from your browser session.

## Public endpoints

| Endpoint | What |
|----------|-----|
| `/api/health` | 200 / 503 for Caddy probe |
| `/api/version` | Build SHA plus timestamp |
| `/api/auth/oauth-config` | Which OAuth providers are active |
| `/api/triggers/[secret]` | Webhook trigger for schedules |
| `/share/[slug]` | Public marketplace listing |
| `/r/[token]` | Outreach freebie redirect |
| `/docs/[locale]/...` | This documentation itself |

## Triggering an agent run via webhook

```bash
curl -X POST https://aio.tromptech.life/api/triggers/<your-secret> \
  -H "Content-Type: application/json" \
  -d '{
    "trigger": "github_push",
    "repo": "myrepo",
    "commits": [...]
  }'
```

Response: `{ "ok": true, "run_id": "uuid" }`. The agent gets the body as `input`.

## Routines callback (subscription Claude)

Anthropic Routines POST to `/api/runs/result` (payload-based, newer) or `/api/runs/[run_id]/result` (URL-param, legacy). Both routes parse the Routines response and update the run row.

## Streaming chat

`POST /api/chat/[agent_id]` with body:

```json
{
  "thread_id": "optional-uuid",
  "message": "What's the status of my outreach pipeline?",
  "approve_tool": null
}
```

Response: SSE stream with AG-UI events:

- `text_chunk` -- tokens
- `tool_use_start` / `tool_use_end`
- `tool_call_pending` (for approve)
- `usage` (final tokens plus cost)
- `done`

## Cancel a run

```bash
curl -X POST https://aio.tromptech.life/api/runs/<run_id>/stop
```

## Follow-up on a run

```bash
curl -X POST https://aio.tromptech.life/api/runs/<run_id>/followup \
  -d '{"message": "Try again but now with scope=last-week"}'
```

## Search

```bash
curl "https://aio.tromptech.life/api/search?q=outreach"
```

Returns: workspaces / businesses / agents / runs / topics matching the query.

## Push notifications

- `GET /api/push/key` -- VAPID public key
- `POST /api/push/subscribe` -- register a subscription
- `POST /api/push/test` -- send a test push to your devices
- `POST /api/push/queue-event` -- internal, triggered on queue inserts
