---
title: Notifications
description: Bell, Telegram, email, web push, custom integrations.
---

## The bell

In the header. Live count of:

- Open queue items (orange dot)
- Failed runs in the last 24h (red dot)

Click to open the notification list. Per item you see: type, agent, business, timestamp. Click to go to the source item. The dismiss button removes it without touching the underlying state (`notification_dismissals` table).

## Notification targets (Settings > Channels)

A notification target is a reusable destination. You bind it to agents or schedules. Four channels:

- **Telegram chat-id** -- via your bot
- **Email address**
- **Slack channel** -- via Slack workspace
- **Discord channel** -- via Discord bot

## Telegram setup (Settings > Telegram)

1. Create a Telegram bot via `@BotFather`. You get a bot token.
2. Paste the token in Settings > Telegram > Bot token.
3. AIO Control automatically registers a webhook to `/api/integrations/telegram/webhook`.
4. Send your bot a `/start` from the chat where notifications should go.
5. AIO Control detects the chat and automatically creates a telegram target with that chat-id.
6. Auto-topics: in supergroups AIO detects the `message_thread_id` and creates a separate target per topic.

## Telegram inbound

Messages from your chat to AIO Control can trigger runs. Per agent you can enable inbound.

## Email notifications (Settings > Email)

Provide an SMTP config or Resend API key. AIO Control sends:

- Run results (if you enable this per agent)
- HITL queue items (digest, not one-by-one)
- Spend-limit alerts
- Onboarding reminders

Templates are customizable. If you don't have SMTP, Resend works with a single API key.

## Web push (mobile + desktop)

VAPID keys at `/api/push/key`. Subscribe via `/api/push/subscribe` (happens automatically once you grant permission in the browser). Test push via `/api/push/test`.

Works on:

- Chrome, Edge, Firefox, Safari on desktop
- iOS Safari (after "Add to home screen")
- Android Chrome
- Capacitor build (native iOS / Android)

## Custom integrations (Settings > Custom Integrations)

A custom integration is a webhook of your own that AIO Control POSTs to on events:

- `on_run_done` -- after a successful run
- `on_run_fail` -- after a failed run
- `on_queue_review` -- on a new HITL item

Configurable:

- URL plus method (POST/PUT/PATCH)
- Headers (JSON)
- Body template (Liquid syntax with run fields)
- Scope (workspace / business / topic)
- Enabled toggle

Example body template:

```json
{
  "agent": "{{run.agent_name}}",
  "status": "{{run.status}}",
  "summary": "{{run.output_summary}}",
  "cost_eur": {{run.cost_cents}}
}
```
