---
title: Sneltoetsen en URL-paden
description: Volledige map van URLs en keyboard shortcuts.
---

## URL-paden

```
/                                       redirect naar default workspace dashboard
/login                                  inloggen
/signup                                 account aanmaken
/auth/callback                          OAuth callback
/admin/marketplace                      super-admin marketplace beheer
/admin/skills                           super-admin skill beheer
/admin/queue                            super-admin queue overzicht
/share/[slug]                           public marketplace listing
/r/[token]                              outreach freebie redirect
/docs/[locale]/...                      deze documentatie

/[ws]/dashboard                         workspace dashboard
/[ws]/profile                           profiel-instellingen
/[ws]/settings/[section]                workspace settings
/[ws]/activity                          audit-log feed
/[ws]/cost                              cost dashboard
/[ws]/queue                             HITL queue
/[ws]/runs                              alle runs
/[ws]/marketplace                       agent marketplace
/[ws]/agents                            alle agents (workspace + business)
/[ws]/skills                            workspace skills
/[ws]/flows                             AI flow builder
/[ws]/self-improving                    improvements + HITL learnings

/[ws]/business/[bizId]                  business dashboard
/[ws]/business/[bizId]/agents           agents van deze business
/[ws]/business/[bizId]/schedules        routines van deze business
/[ws]/business/[bizId]/runs             runs van deze business
/[ws]/business/[bizId]/topics           alle topics platte lijst
/[ws]/business/[bizId]/outreach         lead pipeline
/[ws]/business/[bizId]/n/[...path]      topic drill-in
/[ws]/business/[bizId]/tab/[tabId]      custom tab (iframe)
```

## Sneltoetsen in chat

| Toets | Wat |
|-------|-----|
| `Enter` | Send message |
| `Shift+Enter` | New line |
| `/` | Open command palette |
| `Esc` | Close chat panel |
| `Ctrl+K` | Open search vanaf elke pagina |

## Search

`Ctrl+K` opent search. Match op:

- Workspace namen
- Business namen plus slugs
- Agent namen
- Topic namen plus slugs
- Run IDs
- Skill namen
