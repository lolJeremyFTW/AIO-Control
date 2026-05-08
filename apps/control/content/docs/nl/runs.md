---
title: Runs
description: Status, retry behavior, run details, follow-up, stop.
---

Een run is één uitvoering van een agent. Geinitieerd door een schedule, een chat-message, een webhook, of een chain.

## Statussen

| Status | Betekenis |
|--------|-----------|
| `queued` | Aangemaakt, wacht op worker |
| `running` | Bezig |
| `done` | Succesvol klaar |
| `failed` | Error, niet meer te herstarten |
| `review` | Vraagt om HITL approve |

## Run-historie pagina's

- **Workspace-wide**: `/[ws]/runs` -- alle runs over alle businesses
- **Per business**: `/[ws]/business/[bizId]/runs`
- **Per topic**: `/[ws]/business/[bizId]/n/[...path]/runs`

Filters: status, agent, business. Pagineerbaar via `offset`.

## Run details

Klik een run-rij om uit te klappen:

- Agent, provider, model, business, topic
- Triggered by (schedule, manual, webhook, chain, chat)
- Input (de prompt + payload)
- Output (final response)
- Tokens in/out + kosten
- Duration
- Errors (stack trace + retry count)
- Tool calls in chronologische volgorde

## Run stoppen

Een running run kunt u stoppen via `/api/runs/[run_id]/stop`. Triggered een SIGTERM aan de worker.

## Follow-up op een run

Vanuit een run-detail kunt u een follow-up message sturen via `/api/runs/[run_id]/followup`. De agent krijgt zijn eigen output plus uw nieuwe message en runt opnieuw.

## Run retries

Configureerbaar per agent: `max_retries` plus `retry_delay_seconds`. Bij failure ziet u `retry_count: 2/3` in run details.
