---
title: Runs
description: Status, Retry-Verhalten, Run-Details, Follow-Up, Stop.
---

Ein run ist eine Ausführung eines agent. Initiiert durch einen schedule, eine Chat-Message, einen Webhook oder eine Chain.

## Statuswerte

| Status | Bedeutung |
|--------|-----------|
| `queued` | Angelegt, wartet auf Worker |
| `running` | In Bearbeitung |
| `done` | Erfolgreich abgeschlossen |
| `failed` | Error, kann nicht mehr neugestartet werden |
| `review` | Fragt nach HITL-Approve |

## Run-Historie-Seiten

- **Workspace-weit**: `/[ws]/runs` -- alle runs über alle businesses
- **Pro Business**: `/[ws]/business/[bizId]/runs`
- **Pro Topic**: `/[ws]/business/[bizId]/n/[...path]/runs`

Filter: Status, Agent, Business. Paginierbar über `offset`.

## Run-Details

Klicken Sie auf eine Run-Zeile, um sie auszuklappen:

- Agent, Provider, Modell, Business, Topic
- Triggered by (Schedule, Manual, Webhook, Chain, Chat)
- Input (der Prompt + Payload)
- Output (Final Response)
- Tokens in/out + Kosten
- Duration
- Errors (Stack Trace + Retry Count)
- Tool Calls in chronologischer Reihenfolge

## Run stoppen

Einen running run können Sie über `/api/runs/[run_id]/stop` stoppen. Triggert ein SIGTERM an den Worker.

## Follow-Up auf einen Run

Aus einem Run-Detail können Sie eine Follow-Up-Message über `/api/runs/[run_id]/followup` senden. Der agent erhält seinen eigenen Output plus Ihre neue Message und läuft erneut.

## Run Retries

Konfigurierbar pro Agent: `max_retries` plus `retry_delay_seconds`. Bei Failure sehen Sie `retry_count: 2/3` in den Run-Details.
