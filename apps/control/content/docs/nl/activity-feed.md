---
title: Activity feed
description: Audit log van alle wijzigingen in de workspace.
---

URL: `/[ws]/activity`

Audit log van alle wijzigingen in de workspace. Trigger `_audit_row` op tabellen `businesses`, `agents`, `schedules`, `members`, `nav_nodes`, enzovoort schrijft elke insert / update / delete naar `audit_logs`.

## Wat u ziet

Per regel:

- Actor (uw display name, opgehaald uit `profiles`)
- Action: created / updated / deleted / archived
- Resource table plus resource id
- Timestamp plus relatieve tijd ("2 min geleden")
- Payload (de gewijzigde velden, ingeklapt)

## Filters

- Per resource_table (bijvoorbeeld alleen agent-changes via `?table=agents`)

## Pagination

50 per pagina, offset via URL.
