---
title: Workspace dashboard
description: Business KPI's, queue snapshot, onboarding wizard.
---

URL: `/[workspace_slug]/dashboard`

Wat u ziet:

## 1. Onboarding wizard

Alleen aanwezig zolang één van de drie onboarding-gates nog niet klopt. Zie [Eerste login](first-login).

## 2. Business KPI grid

Elke business als een kaart met:

- Naam, icon, appearance
- 30D revenue / 30D cost / margin
- 7D revenue
- 24H run count
- Success/fail ratio

Klik een kaart om naar de [business dashboard](businesses) te gaan.

## 3. Open queue snapshot

Eerste 12 items met de oudste of meest urgente bovenaan. Voor de volledige queue gaat u naar [Queue](queue).

## Hoe de KPI's worden berekend

KPI's komen uit `cost_*` views die runs aggregeren over 24h, 7d en 30d windows. Margin wordt op 2 decimalen getoond zodat sub-eurocent runs (zoals een MiniMax-call van 0,03 EUR) niet wegvallen.

Bij geen businesses ziet u een sketchy CTA-kaart: "Maak uw eerste business".
