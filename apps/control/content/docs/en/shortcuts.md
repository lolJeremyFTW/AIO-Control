---
title: Shortcuts and URL paths
description: Full map of URLs and keyboard shortcuts.
---

## URL paths

```
/                                       redirect to default workspace dashboard
/login                                  log in
/signup                                 create account
/auth/callback                          OAuth callback
/admin/marketplace                      super-admin marketplace management
/admin/skills                           super-admin skill management
/admin/queue                            super-admin queue overview
/share/[slug]                           public marketplace listing
/r/[token]                              outreach freebie redirect
/docs/[locale]/...                      this documentation

/[ws]/dashboard                         workspace dashboard
/[ws]/profile                           profile settings
/[ws]/settings/[section]                workspace settings
/[ws]/activity                          audit log feed
/[ws]/cost                              cost dashboard
/[ws]/queue                             HITL queue
/[ws]/runs                              all runs
/[ws]/marketplace                       agent marketplace
/[ws]/agents                            all agents (workspace + business)
/[ws]/skills                            workspace skills
/[ws]/flows                             AI flow builder
/[ws]/self-improving                    improvements + HITL learnings

/[ws]/business/[bizId]                  business dashboard
/[ws]/business/[bizId]/agents           agents of this business
/[ws]/business/[bizId]/schedules        routines of this business
/[ws]/business/[bizId]/runs             runs of this business
/[ws]/business/[bizId]/topics           all topics flat list
/[ws]/business/[bizId]/outreach         lead pipeline
/[ws]/business/[bizId]/n/[...path]      topic drill-in
/[ws]/business/[bizId]/tab/[tabId]      custom tab (iframe)
```

## Shortcuts in chat

| Key | What |
|-------|-----|
| `Enter` | Send message |
| `Shift+Enter` | New line |
| `/` | Open command palette |
| `Esc` | Close chat panel |
| `Ctrl+K` | Open search from any page |

## Search

`Ctrl+K` opens search. Match on:

- Workspace names
- Business names plus slugs
- Agent names
- Topic names plus slugs
- Run IDs
- Skill names
