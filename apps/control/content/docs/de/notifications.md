---
title: Notifications
description: Bell, Telegram, E-Mail, Web Push, Custom Integrations.
---

## Die Bell

In der Header. Live-Count von:

- Open queue items (oranger Punkt)
- Failed runs in den letzten 24h (roter Punkt)

Klicken Sie, um die Notification-Liste zu öffnen. Pro Item sehen Sie: Typ, Agent, Business, Timestamp. Klicken Sie, um zum Source-Item zu gehen. Die Dismiss-Schaltfläche entfernt das Item, ohne den Underlying State zu beeinflussen (`notification_dismissals` Tabelle).

## Notification Targets (Settings > Channels)

Ein Notification Target ist eine wiederverwendbare Destination. Sie binden es an agents oder schedules. Vier Kanäle:

- **Telegram Chat-ID** -- über Ihren Bot
- **E-Mail-Adresse**
- **Slack Channel** -- über Slack-Workspace
- **Discord Channel** -- über Discord-Bot

## Telegram Setup (Settings > Telegram)

1. Erstellen Sie einen Telegram-Bot über `@BotFather`. Sie erhalten ein Bot-Token.
2. Fügen Sie das Token in Settings > Telegram > Bot Token ein.
3. AIO Control registriert automatisch einen Webhook auf `/api/integrations/telegram/webhook`.
4. Senden Sie Ihrem Bot ein `/start` aus dem Chat, an den Notifikationen gehen sollen.
5. AIO Control erkennt den Chat und erstellt automatisch ein Telegram-Target mit dieser Chat-ID.
6. Auto-Topics: in Supergroups erkennt AIO die `message_thread_id` und erstellt pro Topic ein separates Target.

## Telegram Inbound

Nachrichten von Ihrem Chat an AIO Control können runs triggern. Pro agent können Sie Inbound aktivieren.

## E-Mail Notifications (Settings > E-Mail)

Geben Sie eine SMTP-Config oder einen Resend-API-Key an. AIO Control versendet:

- Run-Results (wenn Sie das pro agent enabled haben)
- HITL Queue Items (Digest, nicht eins-pro-Stück)
- Spend-Limit Alerts
- Onboarding Reminders

Templates sind anpassbar. Falls Sie kein SMTP haben, funktioniert Resend mit einem API-Key.

## Web Push (Mobile + Desktop)

VAPID-Keys auf `/api/push/key`. Subscribe über `/api/push/subscribe` (passiert automatisch, sobald Sie der Browser-Permission zustimmen). Test-Push über `/api/push/test`.

Funktioniert auf:

- Chrome, Edge, Firefox, Safari auf Desktop
- iOS Safari (nach "Zum Startbildschirm hinzufügen")
- Android Chrome
- Capacitor Build (native iOS / Android)

## Custom Integrations (Settings > Custom Integrations)

Eine Custom Integration ist ein eigener Webhook, an den AIO Control bei Events POSTet:

- `on_run_done` -- nach einem erfolgreichen run
- `on_run_fail` -- nach einem fehlgeschlagenen run
- `on_queue_review` -- bei neuem HITL-Item

Konfigurierbar:

- URL plus Methode (POST/PUT/PATCH)
- Headers (JSON)
- Body Template (Liquid-Syntax mit run-Feldern)
- Scope (workspace / business / topic)
- Enabled-Toggle

Beispiel-Body-Template:

```json
{
  "agent": "{{run.agent_name}}",
  "status": "{{run.status}}",
  "summary": "{{run.output_summary}}",
  "cost_eur": {{run.cost_cents}}
}
```
