---
title: Self-Improving
description: Improvement voorstellen, HITL learnings, self-healing.
---

URL: `/[ws]/self-improving`

## Improvements

Een speciale agent (de self-improving agent) kan voorstellen plaatsen voor wat AIO Control beter zou kunnen doen. Voorbeelden:

- "Voeg een retry-knop toe aan failed runs"
- "Maak Telegram-target keuze sticky tussen sessies"
- "Genereer cost-summary mail elke maandagochtend"

## Status flow

`proposed` > `approved` > `building` > `built` > `verified`

Reject zet op `rejected`.

## Improvement velden

- Title plus body
- Type (UI / agent-behavior / data / integration / etc.)
- Severity / priority
- Linked agent of business
- Decision rationale (als approved of rejected)

## HITL learnings sectie

Onder de improvements ziet u de laatste 15 review-learnings. Elke entry:

- Title (wat de agent voorstelde)
- Outcome (approved / rejected)
- Body (de lesson)
- Lesson type (was-juist / was-onjuist / hoek-niet-gezien)

Deze learnings worden geinjecteerd in de system-prompt van reviewer-agents zodat zij van uw besluiten leren.

## Self-healing

Bij steeds-falende runs (bijvoorbeeld een schedule die 5x op rij faalt) maakt de self-improving agent automatisch een proposed-improvement aan. Migration `070_improvements_self_healing.sql`.
