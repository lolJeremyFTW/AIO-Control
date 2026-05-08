---
title: Die acht Kernkonzepte
description: Workspace, business, topic, agent, schedule, run, queue item, skill.
---

Bevor der Rest der Docs landet, kurz die acht Begriffe, um die sich alles dreht.

## Workspace

Ihr multi-tenant Container. Alles lebt darin. Sie können mehrere workspaces haben (zum Beispiel einen für Ihre eigenen Unternehmen, einen für einen Kunden) und über den WorkspaceSwitcher in der Header wechseln.

## Business

Ein Mini-Business innerhalb eines workspace. Hat eigene KPIs, agents, schedules, runs, queue, Integrationen. Beispiel: "Faceless YouTube" oder "Etsy POD".

## Topic (Nav-Node)

Eine hierarchische Sektion innerhalb eines business. Vergleichbar mit einer Notion-Seite. Topics können Sub-Topics haben (unendlich tief). Ein topic kann agents pinnen, ein eigenes Dashboard haben oder eine externe URL über einen Custom-Tab einbetten.

## Agent

Eine AI-Instanz mit Namen, Provider, Modell, System Prompt, Tool-Allow-List, Skill-Allow-List und optionalen Telegram- oder E-Mail-Targets. Drei Scopes:

- **Workspace-global** -- `business_id IS NULL`
- **Business-scoped** -- `business_id` ausgefüllt
- **Topic-pinned** -- auch `nav_node_id` ausgefüllt

## Schedule

Ein Trigger, um einen agent auszuführen. Drei Arten:

- `cron` -- zeitbasiert, definiert über cron-expression
- `webhook` -- HTTP POST mit secret in der URL
- `manual` -- Schaltfläche in der UI

## Run

Eine Ausführung eines agent. Hat input, output, status, Kosten, tokens, errors, retry-state. Statuswerte: `queued`, `running`, `done`, `failed`, `review`.

## Queue Item

Ein Human-In-The-Loop-Moment. Ein agent fragt nach approve oder reject, bevor er eine Aktion ausführt (zum Beispiel eine E-Mail versenden oder eine Transaktion durchführen).

## Skill

Ein Markdown-Snippet (Titel, Wann-verwenden, Body), das Sie pro agent zuweisen können. Wird in den System Prompt injiziert. Pattern übernommen aus OpenClaws `SKILL.md`.

## Hierarchie zusammengefasst

```
workspace
  └── business
        └── topic (nav-node)
              └── topic (sub)
                    └── agent (pinned)
```

Ein agent kann workspace-global sein (kein business). Ein topic kann agents und Sub-Topics enthalten. Schedules werden an ein topic oder ein business gepinnt.
