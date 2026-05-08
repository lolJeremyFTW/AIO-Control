---
title: Workspace dashboard
description: Business KPIs, queue snapshot, onboarding wizard.
---

URL: `/[workspace_slug]/dashboard`

What you see:

## 1. Onboarding wizard

Only present as long as one of the three onboarding gates is not yet satisfied. See [First login](first-login).

## 2. Business KPI grid

Each business as a card with:

- Name, icon, appearance
- 30D revenue / 30D cost / margin
- 7D revenue
- 24H run count
- Success/fail ratio

Click a card to go to the [business dashboard](businesses).

## 3. Open queue snapshot

First 12 items with the oldest or most urgent at the top. For the full queue go to [Queue](queue).

## How the KPIs are calculated

KPIs come from `cost_*` views that aggregate runs over 24h, 7d and 30d windows. Margin is shown to 2 decimals so sub-eurocent runs (like a MiniMax call of EUR 0.03) don't drop off.

With no businesses you see a sketchy CTA card: "Create your first business".
