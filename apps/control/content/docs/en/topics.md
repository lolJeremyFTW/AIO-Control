---
title: Topics (nav nodes)
description: Hierarchical sections inside a business.
---

Topics are the hierarchical sections inside a business. Each topic can:

- Contain sub-topics (infinitely deep)
- Pin agents (they appear on the topic dashboard)
- Pin schedules (they appear on the routines tab of the topic)
- Have its own icon, color, logo, name
- Embed an external URL via `href` (renders as iframe)
- Have custom tabs alongside the standard topic routes

## Topic URL structure

`/[ws]/business/[bizId]/n/[...path]`

The path is a chain of nav node IDs or slugs. Example for a topic "Content" with sub-topic "Scripts":

```
/myws/business/youtube/n/content/scripts
```

## Topic sub-routes

At the end of a topic URL you can append one of these:

- `/agents` -- agents pinned to this topic
- `/runs` -- runs tagged with this topic
- `/routines` -- schedules pinned to this topic
- `/tab/[tabId]` -- custom tab for this topic

## Topic dashboard

A topic can have an AI-generated dashboard (`module_dashboards` table). The `GenerateDashboardCard` component lets an agent generate a markdown dashboard based on topic context. Saved dashboards appear automatically on the topic page.

## Topic routines tab

On the routines tab of a topic you only see the schedules pinned to this topic. Useful for focus.

## Custom tabs

Per topic you can add a custom tab pointing to an external or internal URL. AIO Control renders it as an iframe inside the topic. Examples:

- A Linear board for your content roadmap
- A Notion page with script templates
- A dashboard from your own analytics tool

Configurable via the topic edit menu. AIO accepts external URLs (rendered in iframe) and internal URLs within the workspace (opened without iframe wrapper).

## When a topic, when a separate business?

| Question | Answer |
|-------|----------|
| Does it have its own KPIs and revenue? | Separate business |
| Is it a workflow inside 1 business? | Topic |
| Are the agents specific to this purpose? | Topic with agent pin |
| Does it share agents with other parts? | Topic |
