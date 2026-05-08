---
title: Outreach
description: Lead pipeline for outreach businesses. Status tabs, freebie tracking.
---

URL: `/[ws]/business/[bizId]/outreach`

(Only relevant for outreach businesses, like lead-gen pipelines.)

## Lead pipeline

Source of truth: `outreach_leads` table (`workspace_id` + `business_id` keys).

## Status states

| Status | Meaning |
|--------|-----------|
| `new` | Just in, not yet pitched |
| `pitched` | Pitch sent |
| `approved` | Approved for freebie or sample |
| `sent` | Sample sent |
| `freebie_ready` | Freebie is ready (pixel can track) |
| `pending_whatsapp` | Waiting on WhatsApp follow-up |
| `responded` | Lead has replied |
| `rejected` | Not interested or not a fit |
| `contactformulier_failed` | Form submit failed |
| `handmatig` | Manually flagged |

## Top stats

Four cards at the top:

- Total leads in pipeline
- Freebies opened (`view_count > 0`)
- Replies (`responded_at IS NOT NULL`)
- Per-status counts (clickable tabs)

## Lead table columns

- Name, email, website
- Industry, region
- Status (badge)
- Score (lead quality score)
- Opens plus last viewed at
- Reply summary

Paginated at 500 per query. Filter on status via URL param `?status=freebie_ready`.

## Outreach actions

Per lead via context menu:

- Mark as approved / sent / responded / rejected
- Generate freebie (via `/api/internal/outreach/freebie`)
- Bulk freebie batch (`/api/internal/outreach/freebie-batch`)
- Reply with AI template (`/api/internal/outreach/reply`)

## Token-based freebie URLs

Each lead gets a unique `token`. Freebie URLs like `aio.tromptech.life/r/[token]` redirect to the generated freebie page. View count auto-increments.

## Master sheet

`outreach_master` table holds cross-business stats. Useful for agencies to see which prospect was interested at Business A but not at Business B.
