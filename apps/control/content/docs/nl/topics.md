---
title: Topics (nav-nodes)
description: Hierarchische secties binnen een business.
---

Topics zijn de hierarchische secties binnen een business. Elke topic kan:

- Sub-topics bevatten (oneindig diep)
- Agents pinnen (komen op het topic-dashboard)
- Schedules pinnen (komen op de routines-tab van de topic)
- Een eigen icon, kleur, logo, naam hebben
- Een externe URL embedden via `href` (rendert als iframe)
- Custom tabs hebben naast de standaard topic-routes

## Topic URL-structuur

`/[ws]/business/[bizId]/n/[...path]`

De path is een chain van nav-node IDs of slugs. Voorbeeld voor een topic "Content" met sub-topic "Scripts":

```
/myws/business/youtube/n/content/scripts
```

## Topic sub-routes

Onderaan een topic-URL kunt u een van deze toevoegen:

- `/agents` -- agents gepind op dit topic
- `/runs` -- runs getagd met dit topic
- `/routines` -- schedules gepind op dit topic
- `/tab/[tabId]` -- custom tab voor dit topic

## Topic dashboard

Een topic kan een AI-gegenereerd dashboard hebben (`module_dashboards` tabel). De `GenerateDashboardCard` component laat een agent een markdown-dashboard genereren op basis van topic-context. Saved dashboards verschijnen automatisch op de topic-pagina.

## Topic-routines tab

Op de routines-tab van een topic ziet u alleen de schedules die aan dit topic zijn gepind. Handig voor focus.

## Custom tabs

Per topic kunt u een eigen tab toevoegen die naar een externe of interne URL wijst. AIO Control rendert die als iframe binnen het topic. Voorbeelden:

- Een Linear-bord voor uw content roadmap
- Een Notion-pagina met script-templates
- Een dashboard van uw eigen analytics-tool

Configureerbaar via het topic-edit-menu. AIO accepteert externe URLs (rendered in iframe) en interne URLs binnen de workspace (geopend zonder iframe-wrapper).

## Wanneer een topic, wanneer een aparte business?

| Vraag | Antwoord |
|-------|----------|
| Heeft het eigen KPI's en revenue? | Aparte business |
| Is het een werkstroom binnen 1 business? | Topic |
| Zijn de agents specifiek voor dit doel? | Topic met agent-pin |
| Deelt het agents met andere onderdelen? | Topic |
