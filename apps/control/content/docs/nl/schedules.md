---
title: Schedules en routines
description: Cron, webhook, manual triggers. Hybride lokaal + Routines.
---

URL per business: `/[ws]/business/[bizId]/schedules`

## Drie types

| Type | Trigger |
|------|---------|
| **cron** | Op tijd, gedefinieerd via een cron-expression |
| **webhook** | HTTP POST naar `/api/triggers/[secret]` |
| **manual** | Gebruiker klikt "Run nu" |

## Cron schedule bouwen

De `ScheduleBuilder` heeft 5 modes:

| Mode | Voorbeeld |
|------|-----------|
| **interval** | Elke 30 minuten |
| **hourly** | Op het uur |
| **daily** | Elke dag om 09:00 |
| **weekly** | Maa-Vrij om 09:00 |
| **custom** | Hand-geschreven cron-expression |

De form vertaalt naar een 5-velden cron-string in UTC. Voorbeeld: dagelijks 09:00 NL = `0 7 * * *` UTC. AIO Control rekent de offset.

## Velden bij een cron schedule

- **Agent** -- welke agent draait
- **Titel** -- voor uzelf, bijvoorbeeld "Dagelijkse Etsy listing scan"
- **Beschrijving** (optioneel) -- voor uzelf
- **Instructies** -- de prompt die naar de agent gaat
- **Topic-pin** (optioneel) -- onder welk topic de runs vallen
- **Telegram target** (optioneel) -- waar de report naartoe gaat
- **Custom integration** (optioneel) -- webhook na done
- **Notification targets** -- Slack, Discord, email

## Webhook schedules

Bij aanmaken krijgt u een unieke URL:

```
https://aio.tromptech.life/api/triggers/abc123def456
```

Het secret in de URL wordt sha256-gehasht en constant-time vergeleken met `webhook_secret_hash`. Een POST hier in plaatst een queued run met de body als input.

```bash
curl -X POST https://aio.tromptech.life/api/triggers/abc123 \
  -H "Content-Type: application/json" \
  -d '{"trigger": "github_push", "repo": "myrepo"}'
```

Disabled schedules geven 423. Wrong secret geeft 401.

## Manual schedules

Klik "Run nu" op een manual schedule. Direct dispatch.

## Hybride dispatch

- Subscription Claude agents > Anthropic Routines (gebeurt op Claude's infra)
- Andere agents > lokale node-cron op uw VPS

Beide schrijven runs naar dezelfde tabel.

## Routine count badge

De Routines-tab in de business-header toont het aantal enabled schedules als badge.

## Schedule editen

Rechter-klik op een schedule-rij in de SchedulesPanel. Edit dialog opent met alle velden.

## Schedule pauzeren

Toggle de "Enabled" switch. Disabled schedules slaan triggers over zonder te falen.

## Retry-sweep

Een achtergrond cron tikt elke X minuten en herstart gefaalde runs met exponential backoff. Endpoint: `/api/runs/retry-sweep`.
