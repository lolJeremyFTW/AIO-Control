---
title: Agents
description: Provider, Kinds, Key Sources, Tools, Skills, Chains, MCP.
---

Ein agent ist eine AI-Instanz mit Namen, Provider, Modell, System Prompt und optionalen Telegram- oder E-Mail-Targets. Dies ist die zentrale Seite, auf der alles zusammenkommt.

## Drei Scopes

| Scope | `business_id` | Wo sichtbar |
|-------|---------------|----------------|
| Workspace-global | `NULL` | Auf `/[ws]/agents` unter der Überschrift "Workspace". Verfügbar im Chat über den gesamten workspace. |
| Business-scoped | gefüllt | Auf dem Agents-Tab dieses business |
| Topic-pinned | gefüllt plus `nav_node_id` gefüllt | Auf dem Topic-Dashboard. Praktisch, um kontextreich zu bauen. |

Ein agent kann über `nav_node_ids` (Array) an mehrere topics gepinnt werden. Das erste bleibt das "Home"-Topic.

## Agent Kinds

Beim Erstellen wählen Sie eine von fünf Optionen:

- **chat** -- conversational, mit dem Chat-Panel als Hauptinterface
- **worker** -- führt Aufgaben aus, ohne viel Hin und Her
- **reviewer** -- bewertet Output anderer agents (HITL-Helper)
- **generator** -- erstellt neuen Content (Posts, Skripte, Designs)
- **router** -- dispatcht zu anderen agents

Der `kind` bestimmt die Default-Tool-Allowlist (siehe unten).

## Provider

| Provider | Auth | Wo verwendet |
|----------|------|---------------|
| `claude` | Anthropic API Key | Direkt über die Anthropic API |
| `claude_cli` | Claude Pro/Max/Team Subscription | Über Claude CLI auf dem VPS, keine API-Kosten |
| `openrouter` | OpenRouter API Key | Zugriff auf hunderte Modelle |
| `minimax` | MiniMax Coder Plan Key | Günstiges MiniMax-M2.7-Highspeed (Default) |
| `ollama` | Keine, läuft lokal | Auf Ihrem VPS über Ollama-Endpoint |
| `openai_codex` | ChatGPT Login (OAuth) | Codex über OpenAI ChatGPT Subscription |
| `openclaw` | Keine | OpenClaw CLI Subprocess auf Ihrem VPS |
| `hermes` | Keine | Nous Research Hermes Agent CLI auf Ihrem VPS |
| `codex` | OpenAI API Key | Codex über OpenAI API |

## Key Source

Pro agent gibt `key_source` an, woher die Credential kommt:

| Wert | Bedeutung |
|--------|-----------|
| `subscription` | Claude-Subscription. Cron läuft auf Claude Routines, Chat über `claude-cli`. Keine API-Kosten. |
| `api_key` | Stammt aus der Workspace-Tabelle `api_keys`. Lokales Dispatch über VPS. |
| `env` | Fallback auf `process.env.<PROVIDER>_API_KEY`. Default für Solo Dev. |

Der Resolver `resolveApiKey()` prüft in folgender Reihenfolge: navnode > business > workspace > env. Bei `businesses.isolated = true` überspringen wir den Workspace-Fallback.

## Tools (Function Tools)

Jeder agent hat eine Allow-List von Platform-Tools. Drei Kategorien:

| Kategorie | Was | Confirmation |
|-----------|-----|--------------|
| **READ** | `list_*`, `get_*`, `resolve_*` | Keine Confirmation, immer direkt |
| **WRITE** | `create_*`, `update_*`, `set_*` | Fragt Approve im Chat-Panel, es sei denn der agent steht auf Auto-Approve |
| **META** | `ask_followup`, `todo_set`, `open_ui_at`, `remember_schedule_resource` | UI Side-Effects, kein Payload |

Bekannte Tools (Liste ist erweiterbar):

- `list_businesses`, `list_agents`, `list_schedules`, `list_runs`, `list_nav_nodes`, `list_integrations`, `list_review_learnings`
- `get_supabase_context`, `get_schedule_memory`
- `resolve_topic` -- löst Namen zu UUIDs auf
- `create_business`, `create_agent`, `update_agent`, `create_schedule`
- `ask_followup` -- stellt dem Benutzer eine Frage (rendert als Schaltflächen im Chat)
- `todo_set` -- aktualisiert eine Todo-Liste im Chat-Panel
- `open_ui_at` -- emittiert einen Navigations-Hint, der Benutzer kann klicken
- `remember_schedule_resource` -- loggt durable Schedule-State

Setzen Sie `allowed_tools` auf `null`, um die Defaults für den `kind` des agent zu verwenden. Eine Custom-Allow-List überschreibt.

## Skills (pro Agent)

`allowed_skills` ist ein Array von Skill-IDs. Der System-Prompt-Builder injiziert die Skill-Bodies in die Präambel. Skills stammen von der [Skills-Seite](skills) im workspace.

## Chains

Zwei Felder für Agent-Chaining:

- `next_agent_on_done` -- wenn dieser agent fertig ist, run für jenen agent dispatchen
- `next_agent_on_fail` -- wenn dieser fehlschlägt, run für jenen agent dispatchen

Praktisch für Pipelines: Scraper > Validator > Publisher.

## MCP Server

Pro agent eine Liste von MCP-Servern, die Sie aktivieren. Der native MCP-Host spawnt diese Server, exponiert ihre Tools an das Modell und routet Tool-Calls. Permissions pro Server:

- `filesystem`: off / ro / rw
- `aio`: off / ro / rw

`maxHops` setzt ein Limit, wie viele aufeinanderfolgende Tool-Calls der agent durchführen darf.

## Notification Targets pro Agent

Ein agent kann gebunden werden an:

- Ein Telegram-Target (Kanal oder DM)
- Eine Custom Integration (eigener Webhook)
- Slack- oder Discord-Notification-Targets
- Eine E-Mail-Adresse für `notify_email`

Reports und Notifikationen von runs dieses agent gehen an alle diese Kanäle gleichzeitig.

## Agent erstellen

Auf dem Agents-Tab eines business klicken Sie "Neuer Agent". Ein Dialog fragt:

- Name, Kind, Provider, Modell
- Default-Modell wird auf Basis des Provider vorgeschlagen (zum Beispiel `claude-sonnet-4-6` für `claude`)
- System Prompt (optional, andernfalls vom Workspace-Default vererbt)
- Endpoint (nur für OpenClaw oder Hermes)
- Tools-Allow-List
- Skills-Allow-List
- Notification-Bindings
- Topic-Pinning
- Chains

## Agent bearbeiten, duplizieren, archivieren

Rechtsklick auf eine Agent-Karte öffnet ein Kontextmenü. Edit öffnet denselben Dialog vorausgefüllt. Duplicate kopiert den agent mit neuer ID. Archivieren verbirgt, ohne Daten zu löschen.

## Agent Runtime Status

In der Agents-Liste sehen Sie pro agent:

- Provider plus Modell
- Key-Status-Pill (grün = Key verfügbar, gelb = Fallback, rot = kein Key)
- Last Run Status
- Anzahl aktiver schedules
