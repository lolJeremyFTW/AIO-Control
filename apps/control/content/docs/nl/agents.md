---
title: Agents
description: Providers, kinds, key sources, tools, skills, chains, MCP.
---

Een agent is een AI-instantie met een naam, provider, model, system prompt, en optionele Telegram of email targets. Dit is de centrale pagina waar alles bij elkaar komt.

## Drie scopes

| Scope | `business_id` | Waar zichtbaar |
|-------|---------------|----------------|
| Workspace-globaal | `NULL` | Op `/[ws]/agents` onder kop "Workspace". Beschikbaar in chat over de hele workspace. |
| Business-scoped | gevuld | Op de Agents-tab van die business |
| Topic-pinned | gevuld plus `nav_node_id` gevuld | Op het topic-dashboard. Handig om context-rijk te bouwen. |

Een agent kan op meerdere topics worden gepind via `nav_node_ids` (array). De eerste blijft de "home" topic.

## Agent kinds

Bij het aanmaken kiest u één van de vijf:

- **chat** -- conversational, met chat-panel als hoofd-interface
- **worker** -- voert taken uit zonder veel terug-en-weer
- **reviewer** -- beoordeelt output van andere agents (HITL helpers)
- **generator** -- maakt nieuwe content (posts, scripts, designs)
- **router** -- dispatcht naar andere agents

De `kind` bepaalt de default tool-allowlist (zie hieronder).

## Providers

| Provider | Auth | Waar gebruikt |
|----------|------|---------------|
| `claude` | Anthropic API key | Direct via Anthropic API |
| `claude_cli` | Claude Pro/Max/Team subscription | Via Claude CLI op de VPS, geen API-kosten |
| `openrouter` | OpenRouter API key | Toegang tot honderden modellen |
| `minimax` | MiniMax Coder Plan key | Goedkope MiniMax-M2.7-Highspeed (default) |
| `ollama` | Geen, draait lokaal | Op uw VPS via Ollama-endpoint |
| `openai_codex` | ChatGPT login (OAuth) | Codex via OpenAI ChatGPT subscription |
| `openclaw` | Geen | OpenClaw CLI subprocess op uw VPS |
| `hermes` | Geen | Nous Research Hermes Agent CLI op uw VPS |
| `codex` | OpenAI API key | Codex via OpenAI API |

## Key source

Per agent zegt `key_source` waar de credential vandaan komt:

| Waarde | Betekenis |
|--------|-----------|
| `subscription` | Claude-subscription. Cron loopt op Claude Routines, chat via `claude-cli`. Geen API-kosten. |
| `api_key` | Komt uit de workspace `api_keys` tabel. Lokale dispatch via VPS. |
| `env` | Fallback op `process.env.<PROVIDER>_API_KEY`. Default voor solo dev. |

De resolver `resolveApiKey()` checkt in volgorde: navnode > business > workspace > env. Bij `businesses.isolated = true` slaan we de workspace fallback over.

## Tools (function tools)

Elke agent heeft een allow-list van platform-tools. Drie categorieën:

| Categorie | Wat | Confirmation |
|-----------|-----|--------------|
| **READ** | `list_*`, `get_*`, `resolve_*` | Geen confirmation, altijd direct |
| **WRITE** | `create_*`, `update_*`, `set_*` | Vraagt approve in chat-panel, tenzij agent op auto-approve staat |
| **META** | `ask_followup`, `todo_set`, `open_ui_at`, `remember_schedule_resource` | UI side-effects, geen payload |

Bekende tools (lijst is uitbreidbaar):

- `list_businesses`, `list_agents`, `list_schedules`, `list_runs`, `list_nav_nodes`, `list_integrations`, `list_review_learnings`
- `get_supabase_context`, `get_schedule_memory`
- `resolve_topic` -- los namen op naar UUIDs
- `create_business`, `create_agent`, `update_agent`, `create_schedule`
- `ask_followup` -- vraag de gebruiker een vraag (rendert als knoppen in chat)
- `todo_set` -- update een todo-list in de chat-panel
- `open_ui_at` -- emit een navigatie-hint, gebruiker kan klikken
- `remember_schedule_resource` -- log durable schedule-state

Set `allowed_tools` op `null` om de defaults voor de agent's `kind` te gebruiken. Custom allow-list overschrijft.

## Skills (per agent)

`allowed_skills` is een array van skill-IDs. De system-prompt builder injecteert de skill-bodies in het preamble. Skills komen uit de [Skills-pagina](skills) in de workspace.

## Chains

Twee velden voor agent-chaining:

- `next_agent_on_done` -- als deze agent klaar is, dispatch run voor die agent
- `next_agent_on_fail` -- als deze faalt, dispatch run voor die agent

Handig voor pipelines: scraper > validator > publisher.

## MCP servers

Per agent een lijst MCP servers die u activeert. De native MCP host spawnt deze servers, exposeert hun tools aan het model en routet tool-calls. Permissions per server:

- `filesystem`: off / ro / rw
- `aio`: off / ro / rw

`maxHops` zet een limiet op hoeveel achtereenvolgende tool-calls de agent mag doen.

## Notification targets per agent

Een agent kan binden aan:

- Een Telegram-target (kanaal of DM)
- Een custom integration (eigen webhook)
- Slack of Discord notification targets
- Een email-adres voor `notify_email`

Reports en notificaties van runs van deze agent gaan naar al deze kanalen tegelijk.

## Agent aanmaken

Vanuit de Agents-tab van een business klikt u "Nieuwe agent". Een dialoog vraagt:

- Naam, kind, provider, model
- Default model wordt voorgesteld op basis van provider (bijvoorbeeld `claude-sonnet-4-6` voor `claude`)
- System prompt (optioneel, anders erft van workspace default)
- Endpoint (alleen voor OpenClaw of Hermes)
- Tools allow-list
- Skills allow-list
- Notification bindings
- Topic-pinning
- Chains

## Agent bewerken, dupliceren, archiveren

Rechter-klik op een agent-kaart geeft een context-menu. Edit opent dezelfde dialog vooraf-ingevuld. Duplicate kopieert de agent met nieuwe ID. Archiveren verbergt zonder data te verwijderen.

## Agent runtime status

In de Agents-lijst ziet u per agent:

- Provider plus model
- Key status pill (groen = key beschikbaar, geel = fallback, rood = geen key)
- Last run status
- Aantal actieve schedules
