---
title: Topics (Nav-Nodes)
description: Hierarchische Sektionen innerhalb eines business.
---

Topics sind die hierarchischen Sektionen innerhalb eines business. Jedes topic kann:

- Sub-Topics enthalten (unendlich tief)
- Agents pinnen (erscheinen auf dem Topic-Dashboard)
- Schedules pinnen (erscheinen auf dem Routinen-Tab des topic)
- Ein eigenes Icon, eine eigene Farbe, ein eigenes Logo, einen eigenen Namen haben
- Eine externe URL über `href` einbetten (rendert als iframe)
- Custom Tabs neben den Standard-Topic-Routes haben

## Topic URL-Struktur

`/[ws]/business/[bizId]/n/[...path]`

Der Path ist eine Kette von Nav-Node-IDs oder Slugs. Beispiel für ein topic "Content" mit Sub-Topic "Scripts":

```
/myws/business/youtube/n/content/scripts
```

## Topic Sub-Routes

Am Ende einer Topic-URL können Sie eine der folgenden hinzufügen:

- `/agents` -- agents, die an dieses topic gepinnt sind
- `/runs` -- runs, die mit diesem topic getaggt sind
- `/routines` -- schedules, die an dieses topic gepinnt sind
- `/tab/[tabId]` -- Custom Tab für dieses topic

## Topic-Dashboard

Ein topic kann ein AI-generiertes Dashboard haben (`module_dashboards` Tabelle). Die `GenerateDashboardCard` Komponente lässt einen agent ein Markdown-Dashboard auf Basis des Topic-Kontexts generieren. Gespeicherte Dashboards erscheinen automatisch auf der Topic-Seite.

## Topic Routinen-Tab

Auf dem Routinen-Tab eines topic sehen Sie nur die schedules, die an dieses topic gepinnt sind. Praktisch für den Fokus.

## Custom Tabs

Pro topic können Sie einen eigenen Tab hinzufügen, der auf eine externe oder interne URL zeigt. AIO Control rendert diesen als iframe innerhalb des topic. Beispiele:

- Ein Linear-Board für Ihre Content-Roadmap
- Eine Notion-Seite mit Skript-Templates
- Ein Dashboard Ihres eigenen Analytics-Tools

Konfigurierbar über das Topic-Edit-Menü. AIO akzeptiert externe URLs (im iframe gerendert) und interne URLs innerhalb des workspace (ohne iframe-Wrapper geöffnet).

## Wann ein topic, wann ein eigenes business?

| Frage | Antwort |
|-------|----------|
| Hat es eigene KPIs und Revenue? | Eigenes business |
| Ist es ein Workflow innerhalb eines business? | Topic |
| Sind die agents spezifisch für diesen Zweck? | Topic mit Agent-Pin |
| Teilt es agents mit anderen Bereichen? | Topic |
