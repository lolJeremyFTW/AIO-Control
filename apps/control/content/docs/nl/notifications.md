---
title: Notifications
description: Bell, Telegram, email, web push, custom integrations.
---

## De bell

In de header. Live count van:

- Open queue items (oranje stip)
- Gefaalde runs in de laatste 24h (rode stip)

Klik om de notification-list te openen. Per item ziet u: type, agent, business, timestamp. Klik om naar het bron-item te gaan. Dismiss-knop verwijdert zonder de underlying state te raken (`notification_dismissals` tabel).

## Notification targets (Settings > Channels)

Een notification target is een herbruikbare bestemming. U bindt aan agents of schedules. Vier kanalen:

- **Telegram chat-id** -- via uw bot
- **Email-adres**
- **Slack channel** -- via Slack workspace
- **Discord channel** -- via Discord bot

## Telegram setup (Settings > Telegram)

1. Maak een Telegram bot via `@BotFather`. U krijgt een bot-token.
2. Plak het token in Settings > Telegram > Bot token.
3. AIO Control registreert automatisch een webhook naar `/api/integrations/telegram/webhook`.
4. Stuur uw bot een `/start` vanuit de chat waarheen notificaties moeten.
5. AIO Control detecteert de chat en maakt automatisch een telegram-target met die chat-id.
6. Auto-topics: in supergroups detecteert AIO de `message_thread_id` en maakt per topic een aparte target.

## Telegram inbound

Berichten van uw chat naar AIO Control kunnen runs triggeren. Per agent kunt u inbound enablen.

## Email notifications (Settings > Email)

Geef een SMTP-config of Resend-API-key. AIO Control verstuurt:

- Run-results (als u dit per agent enabled)
- HITL queue items (digest, niet één-per-stuk)
- Spend-limit alerts
- Onboarding reminders

Templates zijn aanpasbaar. Mocht u geen SMTP hebben, werkt Resend met één API-key.

## Web push (mobile + desktop)

VAPID-keys op `/api/push/key`. Subscribe via `/api/push/subscribe` (gebeurt automatisch zodra u permission geeft in de browser). Test-push via `/api/push/test`.

Werkt op:

- Chrome, Edge, Firefox, Safari op desktop
- iOS Safari (na "Voeg toe aan beginscherm")
- Android Chrome
- Capacitor build (native iOS / Android)

## Custom integrations (Settings > Custom Integrations)

Een custom integration is een eigen webhook waar AIO Control naartoe POST'd bij events:

- `on_run_done` -- na een succesvolle run
- `on_run_fail` -- na een gefaalde run
- `on_queue_review` -- bij nieuwe HITL item

Configureerbaar:

- URL plus method (POST/PUT/PATCH)
- Headers (JSON)
- Body template (Liquid-syntax met run-velden)
- Scope (workspace / business / topic)
- Enabled toggle

Voorbeeld body template:

```json
{
  "agent": "{{run.agent_name}}",
  "status": "{{run.status}}",
  "summary": "{{run.output_summary}}",
  "cost_eur": {{run.cost_cents}}
}
```
