---
title: Self-Improving
description: Improvement-Vorschläge, HITL Learnings, Self-Healing.
---

URL: `/[ws]/self-improving`

## Improvements

Ein spezieller Agent (der Self-Improving-Agent) kann Vorschläge platzieren, was AIO Control besser machen könnte. Beispiele:

- "Eine Retry-Schaltfläche zu Failed Runs hinzufügen"
- "Telegram-Target-Auswahl sticky zwischen Sessions machen"
- "Cost-Summary-Mail jeden Montagmorgen generieren"

## Status Flow

`proposed` > `approved` > `building` > `built` > `verified`

Reject setzt auf `rejected`.

## Improvement-Felder

- Titel plus Body
- Typ (UI / Agent-Behavior / Data / Integration / etc.)
- Severity / Priority
- Linked Agent oder Business
- Decision Rationale (wenn approved oder rejected)

## HITL Learnings Sektion

Unter den Improvements sehen Sie die letzten 15 Review-Learnings. Jeder Eintrag:

- Titel (was der agent vorschlug)
- Outcome (approved / rejected)
- Body (die Lesson)
- Lesson Type (war-richtig / war-falsch / Ecke-nicht-gesehen)

Diese Learnings werden in den System Prompt der Reviewer-Agents injiziert, damit diese aus Ihren Entscheidungen lernen.

## Self-Healing

Bei wiederholt fehlschlagenden runs (zum Beispiel ein schedule, der 5x in Folge fehlschlägt) erstellt der Self-Improving-Agent automatisch ein Proposed-Improvement. Migration `070_improvements_self_healing.sql`.
