---
title: Businesses
description: The business dashboard, sub-routes, isolation modes.
---

A business is a mini business inside your workspace. Own KPIs, agents, schedules, runs, queue, integrations. Example: "Faceless YouTube" or "Etsy POD".

## Business dashboard

URL: `/[workspace_slug]/business/[bizId]`

Contains (top to bottom):

### 6 KPI tiles

- Margin
- Revenue 30d
- Cost 30d
- Revenue 7d
- Runs 24h
- Success / Fail

### BusinessIntentPanel

Description, mission, targets. What's here gets injected into every agent's system prompt for this business. Lets you produce context-rich output without repeating yourself in every prompt.

### OpenClaw agent panel

Have an OpenClaw CLI agent linked to this business? You manage it here.

### Two-column layout

- **Left**: Open queue (first 6 items)
- **Right**: Agents overview (first 5) plus recent runs (first 5)

## Business sub-routes

Tabs under the business header:

| Tab | URL | What it does |
|-----|-----|--------------|
| Overview | `/business/[bizId]` | The dashboard above |
| Agents | `/business/[bizId]/agents` | List of agents in this business |
| Routines | `/business/[bizId]/schedules` | Cron, webhook and manual schedules. Badge shows count of active routines. |
| Runs | `/business/[bizId]/runs` | Run history of this business |
| Topics | `/business/[bizId]/topics` | Flat list of all nav nodes in this business |
| Outreach | `/business/[bizId]/outreach` | Lead pipeline (only for outreach businesses) |
| Custom tabs | `/business/[bizId]/tab/[tabId]` | iframe to an external or internal URL |

To the right of the tabs is a status pill: last run plus outcome dot (green = done, red = failed, orange = running).

## Business isolation

In step 6 of the setup wizard you choose between:

- **Standalone** -- this business has its own API keys, its own integrations. Uses nothing from the workspace.
- **Inherits from workspace** -- falls back to workspace-level keys and integrations if the business doesn't have its own.

You can adjust later via the business settings inside the business.

## When which isolation?

| Use case | Mode |
|----------|------|
| Solo founder with own businesses | Inherits |
| Agency with multiple clients | Standalone (no API key cross-contamination) |
| Test business next to production | Inherits for fast iteration |
| Customer who wants to pay their own API key | Standalone |
