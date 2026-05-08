---
title: AI Flow Builder
description: Beschrijf een automatisering, AI genereert een uitvoerbaar plan.
---

URL: `/[ws]/flows`

Beschrijf een automatisering of een hele business. Een AI genereert een uitvoerbaar plan met:

- Agents (kind, provider, model, system prompt)
- Schedules (cron, manual, webhook)
- Skills (welke per agent)
- MCP servers (welke per agent)
- Integrations (custom webhooks)

## Voorbeeld input

```
Ik wil dagelijks Etsy-listings scrapen voor concurrenten in de
'soy candle' niche, prijzen vergelijken met mijn store, en als ik
goedkoper ben dan 80% van de top-10, mijn prijzen 5% verhogen.
Reports naar mijn Telegram.
```

## Output preview

AIO toont:

- 3 agents (scraper, comparator, price-updater)
- 2 schedules (dagelijks 06:00 plus dagelijks 06:30)
- 1 skill (Etsy listing parser)
- 1 integration (Telegram report)
- 1 custom integration (Etsy API call)

U bekijkt elke entry, edit waar nodig, en klikt "Maak alles aan". Resources worden in één transactie gecreeerd.

## Targeting

Kies eerst:

- **In welke business** -- nieuwe of bestaande
- **Onder welke topics** -- nieuwe of bestaande

API endpoint: `/api/flows/generate`.
