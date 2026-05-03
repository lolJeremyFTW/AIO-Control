# Phase 2 (map) — Codebase mapping

## A. Per-topic dashboards (Explore agent output)

### Schema
- **`nav_nodes`** (`packages/db/supabase/migrations/012_nav_nodes.sql:17-74`) — `id, workspace_id, business_id, parent_id, name, sub, letter, variant, icon, href, sort_order, archived_at, created_at, updated_at`. Indexes: `(workspace_id, business_id)`, `(parent_id)`. RLS: workspace member read, editor+ write.
- **business_id nullability** on operational tables:
  | Table | nullable | FK action |
  |---|---|---|
  | `schedules` | YES | SET NULL (`004_scheduling.sql:9`) |
  | `agents` | YES | CASCADE (`002_domain.sql:31`) |
  | `runs` | YES | SET NULL (`003_chat.sql:12`) |
  | `queue_items` | NO | CASCADE (`002_domain.sql:64`) |

### Per-topic page surface
- **`apps/control/app/[workspace_slug]/business/[bizId]/n/[...path]/page.tsx`** rendert nu: breadcrumb, h1+sub, externe href-link (zone absorption), child-grid + "Nieuw subtopic" button. **Geen** dashboard-content. Veel ruimte om Dashboard + RoutinesPanel onder te hangen.

### Componenten — server vs client
| Component | Type | Parametriseerbaar? |
|---|---|---|
| `BusinessDashboard` | Server async (`components/BusinessDashboard.tsx`) | Ja — accepteert nu `business`; kan `scope: { kind:"business"|"navnode", id }` worden |
| `BusinessKpiGrid` | Server async | Ja — werkt met summaries-map |
| `AgentsDashboard` | Client | Al workspace-wide; topic-filter triviaal |
| `SchedulesPanel` | Client | Vereist `topicId` ipv `businessId` + WHERE-aanpassing |

### Module concept
**Niet aanwezig.** Geen `dashboardConfig` jsonb, geen widget-template-systeem. Alles hardcoded in `BusinessDashboard.tsx`. Voor AI-genererend dashboard moet er nog een config-laag komen (jsonb met widget-list).

### Zone-apps
**Geen** rewrites in `apps/control/next.config.js`. Lead-mgmt / YT content / YT intel zijn externe apps; nav_nodes hebben een `href` kolom voor "open external" links (geen reverse-proxy).

### Design tokens (in `apps/control/app/globals.css`)
`--app-bg / --app-fg / --app-fg-2 / --app-fg-3 / --app-border / --app-card / --tt-green / --rose / --amber / --hand / --type`. Tile-style sits inline in `BusinessDashboard.tsx:236-286`.

### Architecturale opties

| | Optie A (zero schema) | Optie B (nav_node_id kolom) |
|---|---|---|
| Schema | None | ADD COLUMN `nav_node_id UUID` op agents/schedules + index |
| Backfill | None | Voor bestaande rows: NULL (alleen new rows krijgen 't) |
| Query simpliciteit | Complex (parent-chain JOINs) | Simpel (`WHERE nav_node_id = ?`) |
| KPI rollup business | Werkt al | Vereist `WHERE nav_node_id IN (recursive cte topic-chain)` |
| Aanbeveling | POC | Production |

---

## B. API keys + custom keys (Explore agent output)

### Schema
- **`api_keys`** (`packages/db/supabase/migrations/015_api_keys.sql:17-44`) — `provider TEXT` is **vrije tekst** (geen ENUM, geen CHECK). Encryption via `pgp_sym_encrypt`. Index: `(workspace_id, scope, scope_id, provider)`. View `api_keys_metadata` strips encrypted_value. RLS: members read metadata, editors+ write.
- Scope `CHECK ('workspace'|'business'|'navnode')` (line 23).

### Server actions + resolver
- `apps/control/app/actions/api-keys.ts:setApiKey` — accepteert élk `provider` string (geen validatie). Tier resolution `lib/api-keys/resolve.ts` — navnode → business → workspace → env-fallback. Isolated business override.
- Env-fallback: hardcoded map provider→envvar (anthropic→ANTHROPIC_API_KEY, etc.).

### UI
- `components/ApiKeysPanel.tsx:24-38` — `PROVIDERS` is hardcoded array van 9 entries (anthropic, minimax, openrouter, openai, telegram, custom_webhook, smtp_*). **`<select>` heeft geen vrij-tekst option.** = User-facing barrier voor custom keys.

### Reads (call-sites van `resolveApiKey`)
- `app/api/chat/[agent_id]/route.ts:161` — agent's provider key
- `lib/notify/email.ts:25-37` — smtp_*
- `lib/notify/telegram.ts:47, 114, 159, 193, 226` — telegram tokens
- `lib/dispatch/runs.ts` — provider keys voor runs
- **Geen** agent-tool om secrets te lezen op runtime.

### Custom integrations  
- `custom_integrations` tabel (`016_telegram_and_integrations.sql:77-99`) — Mustache `{{run.*}}` templates. **Geen `{{secret.*}}` resolver** op dit moment.

### Schema-opties

**A. ADD `key_kind` column to api_keys (minimal)**
- Pros: 1 migration, hergebruikt resolve-logica
- Cons: provider="my_token" leest semantisch als provider

**B. Aparte `custom_secrets` tabel (cleaner)**
- Pros: scheiden semantiek (provider-keys vs eigen secrets); andere RLS mogelijk
- Cons: dubbele tier-resolution code

**Aanbeveling:** Provider lijst in UI uitbreiden met "Custom" option + free-text name. Maakt schema niet uit (provider is vrije text al), alleen UI-validatie en het `_kind` veld voor filtering.

---

## C. Hermes / OpenClaw runtime agents (Explore agent output)

### Huidige onboarding
- **`ProvidersOnboardingPanel.tsx:51-309`** — 3 cards (Ollama / Hermes / OpenClaw). Per card: tagline + collapsible install-checklist + EndpointForm (URL + Test + Save).
- **DB:** `workspaces.{hermes,openclaw}_endpoint + _last_test_at` (migratie 040). Geen runtime-agent state.

### Hoe AIO Control de CLIs nu aanroept
- **Hermes** (`packages/ai/src/providers/hermes.ts:44-56`) → spawnt `hermes chat --json --session <session_id> --message "<prompt>"` per turn.
- **OpenClaw** (`packages/ai/src/providers/openclaw.ts:53-65`) → spawnt `openclaw agent --local --json --session-id <session_id> -m "<prompt>"` per turn.
- `--session` / `--session-id` houdt context vast in de runtime — dat is het "persistent" mechanisme dat al bestaat aan de runtime-side.

### Nodig om "persistent runtime agent" te ondersteunen
**Niet duidelijk uit code alleen.** Hangt af van wat Hermes-agent en OpenClaw zelf bieden voor "create agent" / "register agent" prompts. Phase 3 research nodig.

### Bestaande UX-pattern voor copy-to-clipboard
- `components/ShareLinkButton.tsx:16-24` — `navigator.clipboard.writeText(url)` + "✓ Gekopieerd" 1.8s. Simpel, hergebruikbaar.
- `components/TelegramPanel.tsx:308-340` — collapsible disclosure met install steps. Patroon werkt.

### Mogelijke schema-uitbreidingen
- **Optie A** — kolommen op workspaces: `hermes_agent_name TEXT`, `hermes_agent_initialized BOOLEAN`, `openclaw_agent_name TEXT`, `openclaw_agent_initialized BOOLEAN`
- **Optie B** — aparte tabel `provider_runtime_agents (id, workspace_id, provider, agent_name, initialized_at, last_verified_at)` voor multi-agent-per-provider in toekomst.

---

## Open vragen na map-fase

1. **Topic dashboards — rollup vs zelfstandig.** Moet topic Dashboard alleen óf eigen runs/agents tonen óf ook alle subtopics rollup-en?
2. **Topic schedules.** Schedules per topic óf blijven business-scoped (filter op topic via agent.business_id chain)?
3. **Custom keys scope.** Workspace-only of ook per-business / per-topic? Allowlist per agent of open-by-default?
4. **Hermes/OpenClaw "persistent agent".** Bedoelt user een named profile/session-name die AIO Control altijd reused, of een long-lived daemon die de user moet starten?
5. **Module imports.** Bestaande externe Next-apps die ge-import moeten worden — bedoelt user een UI-link via `href` (al bestaande zone-absorption), of een datamodel-port naar AIO Control?
