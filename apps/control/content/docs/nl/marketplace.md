---
title: Marketplace
description: Curated agent-presets installeren of uw eigen agent delen.
---

URL: `/[ws]/marketplace`

## Public agents

Curated lijst van agent-presets die u in één klik kunt installeren in een business. Elke entry heeft:

- Naam plus beschrijving
- Provider plus model
- System prompt
- Tool-allowlist
- Skills
- Auteur

Kies een business om te installen. AIO kopieert de agent met nieuwe ID. Geen credentials gaan mee.

## Eigen agent delen

Op een agent zit een "Share" knop. AIO maakt een public listing op `/share/[slug]`. Anderen kunnen bekijken (zonder uw API key) en op hun workspace installen.

Settings: maak listing public of private. Edit description. Track installs.

## Marketplace kinds

Filtered op kind: chat / worker / generator / reviewer / router. Plus categorie-tags zoals "outreach", "youtube", "etsy".

## Admin marketplace

Super-admin only: `/admin/marketplace`. Curated submissions reviewen plus featured of non-featured zetten. Preview via `/api/admin/marketplace/preview`.
