---
title: Tastenkombinationen und URL-Pfade
description: Vollständige Map von URLs und Keyboard Shortcuts.
---

## URL-Pfade

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

## Tastenkombinationen im Chat

| Taste | Was |
|-------|-----|
| `Enter` | Send Message |
| `Shift+Enter` | New Line |
| `/` | Command Palette öffnen |
| `Esc` | Chat-Panel schließen |
| `Ctrl+K` | Search von jeder Seite öffnen |

## Search

`Ctrl+K` öffnet Search. Match auf:

- Workspace-Namen
- Business-Namen plus Slugs
- Agent-Namen
- Topic-Namen plus Slugs
- Run-IDs
- Skill-Namen
