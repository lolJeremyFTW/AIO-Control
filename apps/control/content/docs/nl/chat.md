---
title: Chat met agents
description: Het zwevende chat-paneel, threads, tool calls, HITL approval.
---

Klik de groene bel rechtsonder. Het chat-paneel opent.

## Agent kiezen

Bovenaan ziet u een dropdown met alle workspace-agents. Wisselen tussen agents geeft elke agent zijn eigen thread-history.

## Threads en history

Per agent slaat AIO Control conversations op in `chat_threads` plus `chat_messages`. U opent een oude thread via de threads-knop, of start een nieuwe met "+ Nieuwe chat".

Threads kunt u verwijderen via het context-menu in de threads-lijst.

## AG-UI streaming

De chat gebruikt het AG-UI event-format. U ziet tokens binnenkomen terwijl het model genereert. Niet één blok aan het eind.

## Tool calls inline

Wanneer een agent een tool gebruikt, verschijnt er een chip in de chat:

```
🔧 list_businesses (geen args)
🔧 create_agent (name="Outreach worker", provider="minimax")
```

READ tools voeren direct uit. WRITE tools vragen approve.

## Approve / cancel WRITE tools

Een WRITE tool toont een groene approve-knop en een rode cancel-knop. De agent wacht tot u kiest. De round-trip via `tool_call_id` zorgt dat de juiste pending state wordt gematched.

## Auto-approve mode

Per thread kunt u auto-approve aanzetten via een toggle. Daarna krijgen WRITE tools geen confirmatie meer. Geadviseerd voor agents met beperkte tool-allowlist.

## Ask-followup

De agent kan u een vraag stellen via `ask_followup`:

```
"Welk model wilt u voor deze nieuwe agent?
[claude-sonnet-4-6] [claude-haiku-4-5] [minimax-m2.7-highspeed]"
```

Klik op een knop om dat als uw antwoord te sturen.

## Open-ui-at navigation hints

Een agent kan een pad voorstellen om naartoe te navigeren:

```
🔗 Bekijk de runs op /[ws]/runs?status=failed
```

Klik om er heen te gaan.

## Confirm voor destructieve acties

Buiten WRITE-confirmaties heeft de agent een tweede confirmatie-laag voor echt destructieve acties (zoals een business verwijderen). Komt als een gele kaart met summary plus approve/cancel.

## Cost en tokens per message

Onder elk antwoord staat:

```
1.2k input · 340 output · €0.0089
```

Estimated wanneer er nog geen exacte tokens-rapport van de provider is.

## Markdown rendering

Antwoorden worden gerendered als markdown. Code-blocks krijgen syntax highlighting. Links zijn klikbaar.

## Command palette in chat

Type `/` in de chat-input om commands te zoeken: agents, skills, MCP-tools, custom commands. Werkt fuzzy.

## Sneltoetsen

| Toets | Wat |
|-------|-----|
| `Enter` | Send message |
| `Shift+Enter` | New line |
| `/` | Open command palette |
| `Esc` | Close chat panel |
