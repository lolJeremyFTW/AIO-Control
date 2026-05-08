---
title: Agents
description: Providers, kinds, key sources, tools, skills, chains, MCP.
---

An agent is an AI instance with a name, provider, model, system prompt, and optional Telegram or email targets. This is the central page where everything comes together.

## Three scopes

| Scope | `business_id` | Where visible |
|-------|---------------|----------------|
| Workspace-global | `NULL` | On `/[ws]/agents` under heading "Workspace". Available in chat across the whole workspace. |
| Business-scoped | filled | On the Agents tab of that business |
| Topic-pinned | filled plus `nav_node_id` filled | On the topic dashboard. Useful for context-rich builds. |

An agent can be pinned to multiple topics via `nav_node_ids` (array). The first stays the "home" topic.

## Agent kinds

When creating you choose one of five:

- **chat** -- conversational, with chat panel as main interface
- **worker** -- runs tasks without much back and forth
- **reviewer** -- reviews output of other agents (HITL helpers)
- **generator** -- creates new content (posts, scripts, designs)
- **router** -- dispatches to other agents

The `kind` determines the default tool allowlist (see below).

## Providers

| Provider | Auth | Where used |
|----------|------|---------------|
| `claude` | Anthropic API key | Direct via Anthropic API |
| `claude_cli` | Claude Pro/Max/Team subscription | Via Claude CLI on the VPS, no API costs |
| `openrouter` | OpenRouter API key | Access to hundreds of models |
| `minimax` | MiniMax Coder Plan key | Cheap MiniMax-M2.7-Highspeed (default) |
| `ollama` | None, runs locally | On your VPS via Ollama endpoint |
| `openai_codex` | ChatGPT login (OAuth) | Codex via OpenAI ChatGPT subscription |
| `openclaw` | None | OpenClaw CLI subprocess on your VPS |
| `hermes` | None | Nous Research Hermes Agent CLI on your VPS |
| `codex` | OpenAI API key | Codex via OpenAI API |

## Key source

Per agent `key_source` says where the credential comes from:

| Value | Meaning |
|--------|-----------|
| `subscription` | Claude subscription. Cron runs on Claude Routines, chat via `claude-cli`. No API costs. |
| `api_key` | Comes from the workspace `api_keys` table. Local dispatch via VPS. |
| `env` | Falls back on `process.env.<PROVIDER>_API_KEY`. Default for solo dev. |

The resolver `resolveApiKey()` checks in order: navnode > business > workspace > env. With `businesses.isolated = true` we skip the workspace fallback.

## Tools (function tools)

Each agent has an allow-list of platform tools. Three categories:

| Category | What | Confirmation |
|-----------|-----|--------------|
| **READ** | `list_*`, `get_*`, `resolve_*` | No confirmation, always direct |
| **WRITE** | `create_*`, `update_*`, `set_*` | Asks approve in chat panel, unless agent is on auto-approve |
| **META** | `ask_followup`, `todo_set`, `open_ui_at`, `remember_schedule_resource` | UI side effects, no payload |

Known tools (list is extendable):

- `list_businesses`, `list_agents`, `list_schedules`, `list_runs`, `list_nav_nodes`, `list_integrations`, `list_review_learnings`
- `get_supabase_context`, `get_schedule_memory`
- `resolve_topic` -- resolve names to UUIDs
- `create_business`, `create_agent`, `update_agent`, `create_schedule`
- `ask_followup` -- ask the user a question (renders as buttons in chat)
- `todo_set` -- update a todo list in the chat panel
- `open_ui_at` -- emit a navigation hint, user can click
- `remember_schedule_resource` -- log durable schedule state

Set `allowed_tools` to `null` to use the defaults for the agent's `kind`. Custom allow-list overrides.

## Skills (per agent)

`allowed_skills` is an array of skill IDs. The system prompt builder injects the skill bodies into the preamble. Skills come from the [Skills page](skills) in the workspace.

## Chains

Two fields for agent chaining:

- `next_agent_on_done` -- when this agent finishes, dispatch run for that agent
- `next_agent_on_fail` -- when this fails, dispatch run for that agent

Useful for pipelines: scraper > validator > publisher.

## MCP servers

Per agent a list of MCP servers you activate. The native MCP host spawns these servers, exposes their tools to the model and routes tool calls. Permissions per server:

- `filesystem`: off / ro / rw
- `aio`: off / ro / rw

`maxHops` sets a limit on how many consecutive tool calls the agent can make.

## Notification targets per agent

An agent can bind to:

- A Telegram target (channel or DM)
- A custom integration (own webhook)
- Slack or Discord notification targets
- An email address for `notify_email`

Reports and notifications from runs of this agent go to all these channels at once.

## Creating an agent

From the Agents tab of a business you click "New agent". A dialog asks:

- Name, kind, provider, model
- Default model is suggested based on provider (for example `claude-sonnet-4-6` for `claude`)
- System prompt (optional, otherwise inherits from workspace default)
- Endpoint (only for OpenClaw or Hermes)
- Tools allow-list
- Skills allow-list
- Notification bindings
- Topic pinning
- Chains

## Edit, duplicate, archive agent

Right-click on an agent card gives a context menu. Edit opens the same dialog pre-filled. Duplicate copies the agent with a new ID. Archiving hides without deleting data.

## Agent runtime status

In the Agents list you see per agent:

- Provider plus model
- Key status pill (green = key available, yellow = fallback, red = no key)
- Last run status
- Number of active schedules
