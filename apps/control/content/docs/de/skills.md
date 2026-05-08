---
title: Skills
description: Wiederverwendbares prozedurales Wissen für agents.
---

URL: `/[ws]/skills`

Skills sind wiederverwendbares prozedurales Wissen. Pattern übernommen aus OpenClaws `SKILL.md`.

## Anatomie eines Skill

```yaml
name: "Outreach copywriter"
description: "Wanneer u een outreach email moet schrijven naar een prospect."
body: |
  ## Stappenplan
  1. Lees eerst de homepage van de prospect.
  2. Vind één concreet pijnpunt dat AIO Control oplost.
  3. ...
```

## Pro Agent zuweisen

Im Agent-Edit-Dialog wählen Sie, welche Skills dieser laden darf. Nur ausgewählte Skills landen in seinem System Prompt.

## Skill anlegen

Klicken Sie "Neuer Skill". Füllen Sie Name plus Description plus Body aus. Body ist Markdown. AIO unterstützt Code Blocks, Listen, Tabellen.

## Skill über AI generieren

Auf der Skills-Seite gibt es auch eine "AI Generate"-Schaltfläche. Sie beschreiben den Skill in einem Satz, ein agent erstellt den Body für Sie. Endpoint: `/api/skills/generate`.

## Skill archivieren

Edit > Archive. Verbirgt, ohne Daten zu löschen. Agents, die referenzieren, erhalten eine Warnung.

## Admin Skills

`/admin/skills` für Super-Admin. Skills auf der Marketplace teilen. Preview Rendering.

## Skills versus lange System Prompts

Splitten Sie lange prozedurale Kenntnisse in Skills auf. Pro agent wählen Sie, welche Skills geladen werden dürfen. Macht Prompts kompakter und pseudo-modular.
