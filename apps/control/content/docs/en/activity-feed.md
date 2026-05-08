---
title: Activity feed
description: Audit log of all changes in the workspace.
---

URL: `/[ws]/activity`

Audit log of all changes in the workspace. Trigger `_audit_row` on tables `businesses`, `agents`, `schedules`, `members`, `nav_nodes`, etc. writes every insert / update / delete to `audit_logs`.

## What you see

Per row:

- Actor (your display name, fetched from `profiles`)
- Action: created / updated / deleted / archived
- Resource table plus resource id
- Timestamp plus relative time ("2 min ago")
- Payload (the changed fields, collapsed)

## Filters

- Per resource_table (for example only agent changes via `?table=agents`)

## Pagination

50 per page, offset via URL.
