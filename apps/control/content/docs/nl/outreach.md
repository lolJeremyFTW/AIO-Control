---
title: Outreach
description: Lead pipeline voor outreach-businesses. Status tabs, freebie tracking.
---

URL: `/[ws]/business/[bizId]/outreach`

(Alleen relevant voor outreach-businesses, zoals lead-gen pipelines.)

## Lead pipeline

Source-of-truth: `outreach_leads` tabel (`workspace_id` + `business_id` keys).

## Status states

| Status | Betekenis |
|--------|-----------|
| `new` | Net binnen, nog niet gepitched |
| `pitched` | Pitch verstuurd |
| `approved` | Approved voor freebie of sample |
| `sent` | Sample verstuurd |
| `freebie_ready` | Freebie klaarstaat (pixel kan tracken) |
| `pending_whatsapp` | Wacht op WhatsApp opvolgactie |
| `responded` | Lead heeft gereageerd |
| `rejected` | Geen interesse of niet geschikt |
| `contactformulier_failed` | Form-submit mislukt |
| `handmatig` | Handmatig gemarkeerd |

## Top stats

Vier kaarten bovenaan:

- Totaal leads in pipeline
- Freebies geopend (`view_count > 0`)
- Replies (`responded_at IS NOT NULL`)
- Per-status counts (klikbare tabs)

## Lead-tabel kolommen

- Naam, email, website
- Branche, regio
- Status (badge)
- Score (lead-quality score)
- Opens plus last viewed at
- Reply summary

Gepagineerd op 500 per query. Filter op status via URL param `?status=freebie_ready`.

## Outreach acties

Per lead via context-menu:

- Mark as approved / sent / responded / rejected
- Genereer freebie (via `/api/internal/outreach/freebie`)
- Bulk freebie batch (`/api/internal/outreach/freebie-batch`)
- Reply met AI-template (`/api/internal/outreach/reply`)

## Token-based freebie URLs

Elke lead krijgt een unieke `token`. Freebie-URLs zoals `aio.tromptech.life/r/[token]` redirect naar de gegenereerde freebie-page. View-count auto-increments.

## Master sheet

`outreach_master` tabel houdt cross-business stats. Voor agencies handig om te zien welke prospect wel geinteresseerd was bij Business A maar niet bij Business B.
