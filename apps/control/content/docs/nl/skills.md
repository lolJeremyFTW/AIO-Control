---
title: Skills
description: Herbruikbare procedurele kennis voor agents.
---

URL: `/[ws]/skills`

Skills zijn herbruikbare procedurele kennis. Patroon overgenomen van OpenClaw's `SKILL.md`.

## Anatomie van een skill

```yaml
name: "Outreach copywriter"
description: "Wanneer u een outreach email moet schrijven naar een prospect."
body: |
  ## Stappenplan
  1. Lees eerst de homepage van de prospect.
  2. Vind één concreet pijnpunt dat AIO Control oplost.
  3. ...
```

## Per agent toewijzen

Op de agent-edit dialog kiest u welke skills die mag laden. Alleen geselecteerde skills komen in zijn system-prompt.

## Skill aanmaken

Klik "Nieuwe skill". Vul name plus description plus body. Body is markdown. AIO ondersteunt code blocks, lists, tables.

## Skill genereren via AI

Op de skills-pagina staat ook een "AI generate" knop. U beschrijft de skill in één zin, een agent maakt body voor u. Endpoint: `/api/skills/generate`.

## Skill archiveren

Edit > Archive. Verbergt zonder data te verwijderen. Agents die referenceren krijgen een waarschuwing.

## Admin skills

`/admin/skills` voor super-admin. Skills delen op de marketplace. Preview rendering.

## Skills versus lange system prompts

Splits lange procedural-kennis op in skills. Per agent kiest u welke skills mag laden. Maakt prompts compacter en pseudo-modulair.
