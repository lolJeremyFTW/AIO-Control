---
title: Marketplace
description: Kuratierte Agent-Presets installieren oder eigenen Agent teilen.
---

URL: `/[ws]/marketplace`

## Public Agents

Kuratierte Liste von Agent-Presets, die Sie mit einem Klick in einem business installieren können. Jeder Eintrag hat:

- Name plus Beschreibung
- Provider plus Modell
- System Prompt
- Tool-Allowlist
- Skills
- Autor

Wählen Sie ein business zum Installieren. AIO kopiert den agent mit neuer ID. Keine Credentials werden mitgegeben.

## Eigenen Agent teilen

Auf einem agent gibt es eine "Share"-Schaltfläche. AIO erstellt ein Public Listing auf `/share/[slug]`. Andere können es ansehen (ohne Ihren API Key) und in ihrem workspace installieren.

Settings: Listing public oder private machen. Description bearbeiten. Installs tracken.

## Marketplace Kinds

Gefiltert nach Kind: chat / worker / generator / reviewer / router. Plus Kategorie-Tags wie "outreach", "youtube", "etsy".

## Admin Marketplace

Nur Super-Admin: `/admin/marketplace`. Kuratierte Submissions reviewen plus auf Featured oder Non-Featured setzen. Preview über `/api/admin/marketplace/preview`.
