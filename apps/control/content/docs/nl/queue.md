---
title: Queue (HITL)
description: Human-In-The-Loop. Approve of reject voorgestelde acties.
---

URL: `/[ws]/queue`

HITL = Human In The Loop. Wanneer een agent twijfelt of een gevoelige actie wil doen, gaat de run naar `review` en verschijnt er een queue-item.

## Wat staat er in de queue

Elk item heeft:

- Agent, business, topic
- Reden (waarom HITL)
- Voorgestelde actie plus diff (bij content edits)
- Approve / Reject / Skip knoppen

## Approve flow

Klik approve. De agent krijgt een signal en gaat verder met de actie. De queue-item gaat naar `resolved`.

## Reject flow

Klik reject. De run gaat naar `failed`. De `next_agent_on_fail` chain wordt opgevolgd als die er is.

## HITL learnings

Elke HITL-actie genereert een review-learning (`review_learnings` tabel). Verschijnt in [Self-Improving > HITL Learnings](self-improving). Helpt agents leren van uw approve/reject patroon.

## Filters

- **State**: open / resolved / all
- **Business**: filter per business
- **Show**: alleen open (default) of alle

## Workspace queue vs business queue

Workspace queue toont alles over alle businesses. Business dashboard toont alleen de eerste 6 open items voor die business.
