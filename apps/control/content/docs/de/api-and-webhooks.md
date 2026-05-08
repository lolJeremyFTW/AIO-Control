---
title: API und Webhooks
description: Webhook Triggers, Run Callbacks, Streaming Chat, Push.
---

## Authenticated Endpoints

Default: Cookie-basierte Auth über Supabase SSR. Verwendung aus Ihrer Browser-Session.

## Public Endpoints

| Endpoint | Was |
|----------|-----|
| `/api/health` | 200 / 503 für Caddy Probe |
| `/api/version` | Build SHA plus Timestamp |
| `/api/auth/oauth-config` | Welche OAuth-Provider aktiv sind |
| `/api/triggers/[secret]` | Webhook Trigger für schedules |
| `/share/[slug]` | Public Marketplace Listing |
| `/r/[token]` | Outreach Freebie Redirect |
| `/docs/[locale]/...` | Diese Dokumentation selbst |

## Triggern eines Agent Run über Webhook

```bash
curl -X POST https://aio.tromptech.life/api/triggers/<your-secret> \
  -H "Content-Type: application/json" \
  -d '{
    "trigger": "github_push",
    "repo": "myrepo",
    "commits": [...]
  }'
```

Response: `{ "ok": true, "run_id": "uuid" }`. Der agent erhält den Body als `input`.

## Routines Callback (Subscription Claude)

Anthropic Routines POSTen an `/api/runs/result` (Payload-basiert, neuer) oder `/api/runs/[run_id]/result` (URL-Param, Legacy). Beide Routes parsen die Routines-Response und updaten die Run-Row.

## Streaming Chat

`POST /api/chat/[agent_id]` mit Body:

```json
{
  "thread_id": "optional-uuid",
  "message": "Wat is de status van mijn outreach pipeline?",
  "approve_tool": null
}
```

Response: SSE Stream mit AG-UI Events:

- `text_chunk` -- Tokens
- `tool_use_start` / `tool_use_end`
- `tool_call_pending` (für Approve)
- `usage` (Final Tokens plus Cost)
- `done`

## Cancel einen Run

```bash
curl -X POST https://aio.tromptech.life/api/runs/<run_id>/stop
```

## Follow-Up auf einen Run

```bash
curl -X POST https://aio.tromptech.life/api/runs/<run_id>/followup \
  -d '{"message": "Probeer opnieuw maar nu met scope=last-week"}'
```

## Search

```bash
curl "https://aio.tromptech.life/api/search?q=outreach"
```

Returns: workspaces / businesses / agents / runs / topics, die zur Query passen.

## Push Notifications

- `GET /api/push/key` -- VAPID Public Key
- `POST /api/push/subscribe` -- eine Subscription registrieren
- `POST /api/push/test` -- einen Test-Push an Ihre Devices senden
- `POST /api/push/queue-event` -- intern, getriggert bei Queue Inserts
