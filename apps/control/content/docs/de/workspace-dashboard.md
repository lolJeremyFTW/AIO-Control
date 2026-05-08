---
title: Workspace-Dashboard
description: Business-KPIs, Queue-Snapshot, Onboarding-Wizard.
---

URL: `/[workspace_slug]/dashboard`

Was Sie sehen:

## 1. Onboarding-Wizard

Nur sichtbar, solange eines der drei Onboarding-Gates noch nicht erfüllt ist. Siehe [Erster Login](first-login).

## 2. Business KPI-Grid

Jedes business als Karte mit:

- Name, Icon, Appearance
- 30D Revenue / 30D Cost / Margin
- 7D Revenue
- 24H Run Count
- Success/Fail Ratio

Klicken Sie auf eine Karte, um zum [Business-Dashboard](businesses) zu gelangen.

## 3. Open Queue Snapshot

Die ersten 12 Items, die ältesten oder dringendsten oben. Für die vollständige Queue gehen Sie zu [Queue](queue).

## Wie die KPIs berechnet werden

KPIs stammen aus `cost_*` Views, die runs über 24h, 7d und 30d Windows aggregieren. Margin wird auf 2 Dezimalstellen angezeigt, damit Sub-Eurocent-Runs (wie ein MiniMax-Call von 0,03 EUR) nicht wegfallen.

Wenn keine businesses vorhanden sind, sehen Sie eine Sketchy-CTA-Karte: "Erstellen Sie Ihr erstes Business".
