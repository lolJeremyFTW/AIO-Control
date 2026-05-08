---
title: The eight core concepts
description: Workspace, business, topic, agent, schedule, run, queue item, skill.
---

Before the rest of the docs make sense, here are the eight words everything turns on.

## Workspace

Your multi-tenant container. Everything lives in here. You can have multiple workspaces (for example one for your own businesses, one for a client) and switch via the WorkspaceSwitcher in the header.

## Business

A mini business inside a workspace. Has its own KPIs, agents, schedules, runs, queue, integrations. Example: "Faceless YouTube" or "Etsy POD".

## Topic (nav node)

A hierarchical section inside a business. Comparable to a Notion page. Topics can have sub-topics (infinitely deep). A topic can pin agents, have its own dashboard, or embed an external URL through a custom tab.

## Agent

An AI instance with a name, provider, model, system prompt, tool allow-list, skill allow-list, and optional Telegram or email targets. Three scopes:

- **Workspace-global** -- `business_id IS NULL`
- **Business-scoped** -- `business_id` filled in
- **Topic-pinned** -- `nav_node_id` also filled in

## Schedule

A trigger to run an agent. Three kinds:

- `cron` -- on time, defined via cron expression
- `webhook` -- HTTP POST with secret in the URL
- `manual` -- button in the UI

## Run

A single execution of an agent. Has input, output, status, cost, tokens, errors, retry state. Statuses: `queued`, `running`, `done`, `failed`, `review`.

## Queue item

A Human-In-The-Loop moment. An agent asks for approve or reject before performing an action (for example sending an email or running a transaction).

## Skill

A markdown snippet (title, when-to-use, body) that you can assign per agent. Gets injected into the system prompt. Pattern taken from OpenClaw's `SKILL.md`.

## Hierarchy summarized

```
workspace
  └── business
        └── topic (nav-node)
              └── topic (sub)
                    └── agent (pinned)
```

An agent can be workspace-global (no business). A topic can contain agents and sub-topics. Schedules pin to a topic or a business.
