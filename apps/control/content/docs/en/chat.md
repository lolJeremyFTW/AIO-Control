---
title: Chat with agents
description: The floating chat panel, threads, tool calls, HITL approval.
---

Click the green bell at the bottom right. The chat panel opens.

## Choosing an agent

At the top you see a dropdown with all workspace agents. Switching between agents gives each agent its own thread history.

## Threads and history

Per agent AIO Control stores conversations in `chat_threads` plus `chat_messages`. You open an old thread via the threads button, or start a new one with "+ New chat".

You can delete threads via the context menu in the threads list.

## AG-UI streaming

The chat uses the AG-UI event format. You see tokens come in as the model generates. Not one block at the end.

## Tool calls inline

When an agent uses a tool, a chip appears in the chat:

```
🔧 list_businesses (no args)
🔧 create_agent (name="Outreach worker", provider="minimax")
```

READ tools execute directly. WRITE tools ask approve.

## Approve / cancel WRITE tools

A WRITE tool shows a green approve button and a red cancel button. The agent waits until you choose. The round-trip via `tool_call_id` ensures the right pending state gets matched.

## Auto-approve mode

Per thread you can turn on auto-approve via a toggle. After that WRITE tools no longer get a confirmation. Recommended for agents with a limited tool allowlist.

## Ask-followup

The agent can ask you a question via `ask_followup`:

```
"Which model do you want for this new agent?
[claude-sonnet-4-6] [claude-haiku-4-5] [minimax-m2.7-highspeed]"
```

Click a button to send that as your answer.

## Open-ui-at navigation hints

An agent can suggest a path to navigate to:

```
🔗 View the runs at /[ws]/runs?status=failed
```

Click to go there.

## Confirm for destructive actions

Beyond WRITE confirmations the agent has a second confirmation layer for genuinely destructive actions (like deleting a business). Comes as a yellow card with summary plus approve/cancel.

## Cost and tokens per message

Below each reply:

```
1.2k input · 340 output · €0.0089
```

Estimated when there's no exact tokens report from the provider yet.

## Markdown rendering

Replies are rendered as markdown. Code blocks get syntax highlighting. Links are clickable.

## Command palette in chat

Type `/` in the chat input to search commands: agents, skills, MCP tools, custom commands. Works fuzzy.

## Shortcuts

| Key | What |
|-------|-----|
| `Enter` | Send message |
| `Shift+Enter` | New line |
| `/` | Open command palette |
| `Esc` | Close chat panel |
