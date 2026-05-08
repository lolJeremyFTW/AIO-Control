---
title: Schedules und Routinen
description: Cron, webhook, manuelle Trigger. Hybrid lokal + Routines.
---

URL pro business: `/[ws]/business/[bizId]/schedules`

## Drei Typen

| Typ | Trigger |
|------|---------|
| **cron** | Zeitbasiert, definiert über eine cron-expression |
| **webhook** | HTTP POST an `/api/triggers/[secret]` |
| **manual** | Benutzer klickt "Run jetzt" |

## Cron Schedule bauen

Der `ScheduleBuilder` hat 5 Modes:

| Mode | Beispiel |
|------|-----------|
| **interval** | Alle 30 Minuten |
| **hourly** | Zur vollen Stunde |
| **daily** | Täglich um 09:00 |
| **weekly** | Mo-Fr um 09:00 |
| **custom** | Handgeschriebene cron-expression |

Die Form übersetzt zu einem 5-Felder cron-string in UTC. Beispiel: täglich 09:00 NL = `0 7 * * *` UTC. AIO Control rechnet den Offset.

## Felder bei einem Cron Schedule

- **Agent** -- welcher agent läuft
- **Titel** -- für Sie selbst, zum Beispiel "Tägliche Etsy Listing Scan"
- **Beschreibung** (optional) -- für Sie selbst
- **Instruktionen** -- der Prompt, der an den agent geht
- **Topic-Pin** (optional) -- unter welchem topic die runs fallen
- **Telegram Target** (optional) -- wohin der Report geht
- **Custom Integration** (optional) -- Webhook nach Done
- **Notification Targets** -- Slack, Discord, E-Mail

## Webhook Schedules

Beim Anlegen erhalten Sie eine eindeutige URL:

```
https://aio.tromptech.life/api/triggers/abc123def456
```

Das Secret in der URL wird sha256-gehashed und constant-time mit `webhook_secret_hash` verglichen. Ein POST hier hin platziert einen queued run mit dem Body als Input.

```bash
curl -X POST https://aio.tromptech.life/api/triggers/abc123 \
  -H "Content-Type: application/json" \
  -d '{"trigger": "github_push", "repo": "myrepo"}'
```

Disabled Schedules geben 423. Wrong Secret gibt 401.

## Manual Schedules

Klicken Sie "Run jetzt" auf einem manual Schedule. Direkter Dispatch.

## Hybrid Dispatch

- Subscription-Claude-Agents > Anthropic Routines (passiert auf Claudes Infra)
- Andere Agents > lokales node-cron auf Ihrem VPS

Beide schreiben runs in dieselbe Tabelle.

## Routine Count Badge

Der Routinen-Tab in der Business-Header zeigt die Anzahl enabled Schedules als Badge.

## Schedule bearbeiten

Rechtsklick auf eine Schedule-Zeile in der SchedulesPanel. Edit-Dialog öffnet sich mit allen Feldern.

## Schedule pausieren

Toggeln Sie den "Enabled"-Switch. Disabled Schedules überspringen Trigger, ohne fehlzuschlagen.

## Retry-Sweep

Ein Hintergrund-Cron tickt alle X Minuten und startet fehlgeschlagene runs mit Exponential Backoff neu. Endpoint: `/api/runs/retry-sweep`.
