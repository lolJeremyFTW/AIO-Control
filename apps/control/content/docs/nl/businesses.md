---
title: Businesses
description: Het business dashboard, sub-routes, isolation modes.
---

Een business is een mini-business binnen uw workspace. Eigen KPI's, agents, schedules, runs, queue, integraties. Voorbeeld: "Faceless YouTube" of "Etsy POD".

## Business dashboard

URL: `/[workspace_slug]/business/[bizId]`

Bevat (van boven naar beneden):

### 6 KPI tegels

- Margin
- Revenue 30d
- Cost 30d
- Revenue 7d
- Runs 24h
- Success / Fail

### BusinessIntentPanel

Description, mission, targets. Wat hier staat wordt geinjecteerd in elke agent's system prompt voor deze business. Maakt context-rijke output mogelijk zonder dat u het in elke prompt herhaalt.

### OpenClaw agent panel

Heeft u een OpenClaw-CLI agent gekoppeld aan deze business? U beheert 'm hier.

### Twee-koloms layout

- **Links**: Open queue (eerste 6 items)
- **Rechts**: Agents-overzicht (eerste 5) plus recente runs (eerste 5)

## Business sub-routes

Tabs onder de business header:

| Tab | URL | Wat het doet |
|-----|-----|--------------|
| Overzicht | `/business/[bizId]` | Het dashboard hierboven |
| Agents | `/business/[bizId]/agents` | Lijst van agents in deze business |
| Routines | `/business/[bizId]/schedules` | Cron, webhook en manual schedules. Badge toont aantal actieve routines. |
| Runs | `/business/[bizId]/runs` | Run-historie van deze business |
| Topics | `/business/[bizId]/topics` | Platte lijst van alle nav-nodes in deze business |
| Outreach | `/business/[bizId]/outreach` | Lead pipeline (alleen voor outreach-businesses) |
| Custom tabs | `/business/[bizId]/tab/[tabId]` | iframe naar een externe of interne URL |

Rechts naast de tabs staat een status-pill: laatste run plus outcome dot (groen = done, rood = failed, oranje = running).

## Business isolation

In stap 6 van de setup-wizard kiest u tussen:

- **Standalone** -- deze business heeft eigen API keys, eigen integraties. Gebruikt niets van de workspace.
- **Inherits from workspace** -- valt terug op workspace-level keys en integraties als de business er zelf geen heeft.

Aanpassen kan later via de business-settings binnen de business.

## Wanneer welke isolation?

| Use case | Mode |
|----------|------|
| Solo founder met eigen bedrijven | Inherits |
| Agency met meerdere clients | Standalone (geen API-key cross-contamination) |
| Test-business naast productie | Inherits voor snelle iteratie |
| Klant die zijn eigen API key wil betalen | Standalone |
