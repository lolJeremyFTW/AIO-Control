---
title: Outreach
description: Lead-Pipeline für Outreach-Businesses. Status-Tabs, Freebie-Tracking.
---

URL: `/[ws]/business/[bizId]/outreach`

(Nur relevant für Outreach-Businesses, wie Lead-Gen-Pipelines.)

## Lead-Pipeline

Source-of-Truth: `outreach_leads` Tabelle (`workspace_id` + `business_id` Keys).

## Status States

| Status | Bedeutung |
|--------|-----------|
| `new` | Gerade eingegangen, noch nicht gepitched |
| `pitched` | Pitch versendet |
| `approved` | Approved für Freebie oder Sample |
| `sent` | Sample versendet |
| `freebie_ready` | Freebie steht bereit (Pixel kann tracken) |
| `pending_whatsapp` | Wartet auf WhatsApp-Folgeaktion |
| `responded` | Lead hat reagiert |
| `rejected` | Kein Interesse oder ungeeignet |
| `contactformulier_failed` | Form-Submit fehlgeschlagen |
| `handmatig` | Manuell markiert |

## Top Stats

Vier Karten oben:

- Gesamtzahl Leads in Pipeline
- Geöffnete Freebies (`view_count > 0`)
- Replies (`responded_at IS NOT NULL`)
- Per-Status-Counts (klickbare Tabs)

## Lead-Tabellen-Spalten

- Name, E-Mail, Website
- Branche, Region
- Status (Badge)
- Score (Lead-Quality-Score)
- Opens plus Last Viewed At
- Reply Summary

Paginiert auf 500 pro Query. Filter auf Status über URL-Param `?status=freebie_ready`.

## Outreach-Aktionen

Pro Lead über Kontextmenü:

- Mark as approved / sent / responded / rejected
- Freebie generieren (über `/api/internal/outreach/freebie`)
- Bulk Freebie Batch (`/api/internal/outreach/freebie-batch`)
- Reply mit AI-Template (`/api/internal/outreach/reply`)

## Token-basierte Freebie-URLs

Jeder Lead erhält ein eindeutiges `token`. Freebie-URLs wie `aio.tromptech.life/r/[token]` redirecten auf die generierte Freebie-Page. View-Count auto-increments.

## Master Sheet

Die `outreach_master` Tabelle hält Cross-Business-Stats. Für Agencies praktisch, um zu sehen, welcher Prospect bei Business A interessiert war, aber nicht bei Business B.
