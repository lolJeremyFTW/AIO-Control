---
title: AI Flow Builder
description: Beschreiben Sie eine Automatisierung, AI generiert einen ausführbaren Plan.
---

URL: `/[ws]/flows`

Beschreiben Sie eine Automatisierung oder ein ganzes Business. Ein AI generiert einen ausführbaren Plan mit:

- Agents (Kind, Provider, Modell, System Prompt)
- Schedules (Cron, Manual, Webhook)
- Skills (welche pro agent)
- MCP Server (welche pro agent)
- Integrations (Custom Webhooks)

## Beispiel-Input

```
Ik wil dagelijks Etsy-listings scrapen voor concurrenten in de
'soy candle' niche, prijzen vergelijken met mijn store, en als ik
goedkoper ben dan 80% van de top-10, mijn prijzen 5% verhogen.
Reports naar mijn Telegram.
```

## Output Preview

AIO zeigt:

- 3 agents (Scraper, Comparator, Price-Updater)
- 2 schedules (täglich 06:00 plus täglich 06:30)
- 1 skill (Etsy Listing Parser)
- 1 Integration (Telegram Report)
- 1 Custom Integration (Etsy API Call)

Sie überprüfen jeden Eintrag, bearbeiten wo nötig, und klicken "Alles anlegen". Ressourcen werden in einer Transaktion erstellt.

## Targeting

Wählen Sie zuerst:

- **In welchem business** -- neu oder bestehend
- **Unter welchen topics** -- neu oder bestehend

API Endpoint: `/api/flows/generate`.
