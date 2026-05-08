---
title: De acht kernconcepten
description: Workspace, business, topic, agent, schedule, run, queue item, skill.
---

Voor de rest van de docs landen, even de acht woorden waar alles op draait.

## Workspace

Uw multi-tenant container. Alles leeft hierin. U kunt meerdere workspaces hebben (bijvoorbeeld één voor uw eigen bedrijven, één voor een client) en wisselen via de WorkspaceSwitcher in de header.

## Business

Een mini-business binnen een workspace. Heeft eigen KPI's, agents, schedules, runs, queue, integraties. Voorbeeld: "Faceless YouTube" of "Etsy POD".

## Topic (nav-node)

Een hierarchische sectie binnen een business. Vergelijkbaar met een Notion-pagina. Topics kunnen sub-topics hebben (oneindig diep). Een topic kan agents pinnen, een eigen dashboard hebben, of een externe URL embedden via een custom tab.

## Agent

Een AI-instantie met een naam, provider, model, system prompt, tool-allow-list, skill-allow-list, en optionele Telegram of email targets. Drie scopes:

- **Workspace-globaal** -- `business_id IS NULL`
- **Business-scoped** -- `business_id` ingevuld
- **Topic-pinned** -- ook `nav_node_id` ingevuld

## Schedule

Een trigger om een agent te runnen. Drie soorten:

- `cron` -- op tijd, gedefinieerd via cron-expression
- `webhook` -- HTTP POST met secret in de URL
- `manual` -- knop in de UI

## Run

Eén uitvoering van een agent. Heeft input, output, status, kosten, tokens, errors, retry-state. Statussen: `queued`, `running`, `done`, `failed`, `review`.

## Queue item

Een Human-In-The-Loop moment. Een agent vraagt om approve of reject voordat hij een actie uitvoert (bijvoorbeeld een email versturen of een transactie doen).

## Skill

Een markdown-snippet (titel, wanneer-gebruiken, body) die u per agent kunt toewijzen. Wordt geinjecteerd in de system prompt. Patroon overgenomen van OpenClaw's `SKILL.md`.

## Hierarchie samengevat

```
workspace
  └── business
        └── topic (nav-node)
              └── topic (sub)
                    └── agent (pinned)
```

Een agent kan workspace-globaal zijn (geen business). Een topic kan agents en sub-topics bevatten. Schedules pinnen aan een topic of een business.
