---
title: Queue (HITL)
description: Human-In-The-Loop. Approve or reject suggested actions.
---

URL: `/[ws]/queue`

HITL = Human In The Loop. When an agent is unsure or wants to take a sensitive action, the run goes to `review` and a queue item appears.

## What's in the queue

Each item has:

- Agent, business, topic
- Reason (why HITL)
- Suggested action plus diff (for content edits)
- Approve / Reject / Skip buttons

## Approve flow

Click approve. The agent gets a signal and continues with the action. The queue item moves to `resolved`.

## Reject flow

Click reject. The run moves to `failed`. The `next_agent_on_fail` chain is followed if there is one.

## HITL learnings

Each HITL action generates a review learning (`review_learnings` table). Appears in [Self-Improving > HITL Learnings](self-improving). Helps agents learn from your approve/reject pattern.

## Filters

- **State**: open / resolved / all
- **Business**: filter per business
- **Show**: only open (default) or all

## Workspace queue vs business queue

Workspace queue shows everything across all businesses. Business dashboard shows only the first 6 open items for that business.
