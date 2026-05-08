---
title: Activity Feed
description: Audit Log aller Änderungen im workspace.
---

URL: `/[ws]/activity`

Audit Log aller Änderungen im workspace. Der Trigger `_audit_row` auf den Tabellen `businesses`, `agents`, `schedules`, `members`, `nav_nodes`, etc. schreibt jeden Insert / Update / Delete in `audit_logs`.

## Was Sie sehen

Pro Zeile:

- Actor (Ihr Display-Name, abgerufen aus `profiles`)
- Action: created / updated / deleted / archived
- Resource Table plus Resource ID
- Timestamp plus relative Zeit ("vor 2 Min")
- Payload (die geänderten Felder, eingeklappt)

## Filter

- Pro resource_table (zum Beispiel nur Agent-Changes über `?table=agents`)

## Pagination

50 pro Seite, Offset über URL.
