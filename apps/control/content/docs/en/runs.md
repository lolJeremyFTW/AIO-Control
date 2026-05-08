---
title: Runs
description: Status, retry behavior, run details, follow-up, stop.
---

A run is one execution of an agent. Initiated by a schedule, a chat message, a webhook, or a chain.

## Statuses

| Status | Meaning |
|--------|-----------|
| `queued` | Created, waiting on worker |
| `running` | In progress |
| `done` | Finished successfully |
| `failed` | Error, no longer restartable |
| `review` | Asks for HITL approve |

## Run history pages

- **Workspace-wide**: `/[ws]/runs` -- all runs across all businesses
- **Per business**: `/[ws]/business/[bizId]/runs`
- **Per topic**: `/[ws]/business/[bizId]/n/[...path]/runs`

Filters: status, agent, business. Pageable via `offset`.

## Run details

Click a run row to expand:

- Agent, provider, model, business, topic
- Triggered by (schedule, manual, webhook, chain, chat)
- Input (the prompt + payload)
- Output (final response)
- Tokens in/out + cost
- Duration
- Errors (stack trace + retry count)
- Tool calls in chronological order

## Stopping a run

You can stop a running run via `/api/runs/[run_id]/stop`. Triggers a SIGTERM to the worker.

## Follow-up on a run

From a run detail you can send a follow-up message via `/api/runs/[run_id]/followup`. The agent gets its own output plus your new message and runs again.

## Run retries

Configurable per agent: `max_retries` plus `retry_delay_seconds`. On failure you see `retry_count: 2/3` in run details.
