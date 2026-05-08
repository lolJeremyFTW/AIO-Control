---
title: Queue (HITL)
description: Human-In-The-Loop. Vorgeschlagene Aktionen approven oder rejecten.
---

URL: `/[ws]/queue`

HITL = Human In The Loop. Wenn ein agent zweifelt oder eine sensible Aktion durchführen möchte, geht der run auf `review` und ein queue item erscheint.

## Was in der Queue steht

Jedes Item hat:

- Agent, Business, Topic
- Grund (warum HITL)
- Vorgeschlagene Aktion plus Diff (bei Content-Edits)
- Approve / Reject / Skip Schaltflächen

## Approve Flow

Klicken Sie Approve. Der agent erhält ein Signal und fährt mit der Aktion fort. Das queue item geht auf `resolved`.

## Reject Flow

Klicken Sie Reject. Der run geht auf `failed`. Die `next_agent_on_fail` Chain wird verfolgt, falls vorhanden.

## HITL Learnings

Jede HITL-Aktion erzeugt ein Review-Learning (`review_learnings` Tabelle). Erscheint in [Self-Improving > HITL Learnings](self-improving). Hilft agents, von Ihrem Approve/Reject-Pattern zu lernen.

## Filter

- **State**: open / resolved / all
- **Business**: pro business filtern
- **Show**: nur open (Default) oder alle

## Workspace Queue vs Business Queue

Workspace Queue zeigt alles über alle businesses. Das Business-Dashboard zeigt nur die ersten 6 offenen Items für dieses business.
