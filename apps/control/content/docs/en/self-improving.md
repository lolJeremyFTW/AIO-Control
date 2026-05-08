---
title: Self-Improving
description: Improvement proposals, HITL learnings, self-healing.
---

URL: `/[ws]/self-improving`

## Improvements

A special agent (the self-improving agent) can post proposals for what AIO Control could do better. Examples:

- "Add a retry button to failed runs"
- "Make Telegram target choice sticky between sessions"
- "Generate cost-summary mail every Monday morning"

## Status flow

`proposed` > `approved` > `building` > `built` > `verified`

Reject sets to `rejected`.

## Improvement fields

- Title plus body
- Type (UI / agent-behavior / data / integration / etc.)
- Severity / priority
- Linked agent or business
- Decision rationale (when approved or rejected)

## HITL learnings section

Below the improvements you see the last 15 review learnings. Each entry:

- Title (what the agent proposed)
- Outcome (approved / rejected)
- Body (the lesson)
- Lesson type (was-correct / was-incorrect / angle-not-seen)

These learnings are injected into the system prompt of reviewer agents so they learn from your decisions.

## Self-healing

For repeatedly failing runs (for example a schedule that fails 5x in a row) the self-improving agent automatically creates a proposed improvement. Migration `070_improvements_self_healing.sql`.
