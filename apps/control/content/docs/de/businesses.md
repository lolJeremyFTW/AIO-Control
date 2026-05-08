---
title: Businesses
description: Das Business-Dashboard, Sub-Routes, Isolation Modes.
---

Ein business ist ein Mini-Business innerhalb Ihres workspace. Eigene KPIs, agents, schedules, runs, queue, Integrationen. Beispiel: "Faceless YouTube" oder "Etsy POD".

## Business-Dashboard

URL: `/[workspace_slug]/business/[bizId]`

Enthält (von oben nach unten):

### 6 KPI-Kacheln

- Margin
- Revenue 30d
- Cost 30d
- Revenue 7d
- Runs 24h
- Success / Fail

### BusinessIntentPanel

Description, Mission, Targets. Was hier steht, wird in den System Prompt jedes agent für dieses business injiziert. Ermöglicht kontextreiche Output, ohne dass Sie es in jedem Prompt wiederholen.

### OpenClaw Agent Panel

Haben Sie einen OpenClaw-CLI agent an dieses business gekoppelt? Sie verwalten ihn hier.

### Zwei-Spalten-Layout

- **Links**: Open Queue (erste 6 Items)
- **Rechts**: Agents-Übersicht (erste 5) plus aktuelle runs (erste 5)

## Business Sub-Routes

Tabs unter der Business-Header:

| Tab | URL | Was es tut |
|-----|-----|--------------|
| Übersicht | `/business/[bizId]` | Das Dashboard oben |
| Agents | `/business/[bizId]/agents` | Liste der agents in diesem business |
| Routinen | `/business/[bizId]/schedules` | Cron-, webhook- und manuelle schedules. Badge zeigt Anzahl aktiver Routinen. |
| Runs | `/business/[bizId]/runs` | Run-Historie dieses business |
| Topics | `/business/[bizId]/topics` | Flache Liste aller Nav-Nodes in diesem business |
| Outreach | `/business/[bizId]/outreach` | Lead-Pipeline (nur für Outreach-Businesses) |
| Custom Tabs | `/business/[bizId]/tab/[tabId]` | iframe zu einer externen oder internen URL |

Rechts neben den Tabs steht ein Status-Pill: letzter run plus Outcome-Dot (grün = done, rot = failed, orange = running).

## Business Isolation

In Schritt 6 des Setup-Wizards wählen Sie zwischen:

- **Standalone** -- dieses business hat eigene API Keys, eigene Integrationen. Verwendet nichts vom workspace.
- **Inherits from workspace** -- fällt auf workspace-level Keys und Integrationen zurück, wenn das business selbst keine hat.

Anpassen ist später über die Business-Settings innerhalb des business möglich.

## Wann welche Isolation?

| Use Case | Mode |
|----------|------|
| Solo Founder mit eigenen Unternehmen | Inherits |
| Agency mit mehreren Kunden | Standalone (keine API-Key Cross-Contamination) |
| Test-Business neben Produktion | Inherits für schnelle Iteration |
| Kunde, der seinen eigenen API Key bezahlen will | Standalone |
