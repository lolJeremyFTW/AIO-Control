# Plan v2 — final

User-keuzes verwerkt:

| Vraag | Antwoord |
|---|---|
| Topic scope | **Rollup** (eigen + alle subtopics) |
| Custom-key access | **Open** voor alle agents in workspace |
| Module imports | **Skip** deze ronde (geen AI-dashboards, geen ports) |
| Agent naam template | `aio-{workspaceSlug}` |

## Scope deze build (in volgorde)

### Sprint A — Custom API keys (kleinste, eerst)
- Migration `041_api_keys_kind.sql`: `api_keys.kind text default 'provider' check ('provider'|'custom')` + index
- `ApiKeysPanel.tsx`: provider-select krijgt "+ Custom secret…" optie + name input (uppercase, A-Z0-9_ only)
- Lijst-rendering: groep per kind
- `app/actions/api-keys.ts`: `setApiKey` accepteert `kind` + valideert custom-name format
- `packages/ai/src/aio-tools.ts`: nieuwe `read_secret(name)` read-tool
- `lib/notify/custom-integration.ts`: extend Mustache resolver met `{{secret.<NAME>}}`
- i18n keys (`keys.custom.*`) NL/EN/DE

### Sprint B — Persistent runtime agents (mid)
- Migration `042_runtime_agents.sql`: `workspaces.{hermes,openclaw}_agent_name + _agent_initialized_at`
- `ProvidersOnboardingPanel.tsx`: nieuwe sectie per Hermes/OpenClaw card met copy-cmd + verify
- `app/actions/providers.ts`: `verifyHermesAgent`, `verifyOpenClawAgent`, `setRuntimeAgentName`, `markRuntimeAgentInitialized`
- `packages/ai/src/router.ts`: tenant context + `hermesAgentName?`, `openclawAgentName?`
- `packages/ai/src/providers/hermes.ts`: switch naar `<name> chat` als name set
- `packages/ai/src/providers/openclaw.ts`: switch naar `openclaw agent <name>` als name set
- `lib/dispatch/runs.ts` + `app/api/chat/[agent_id]/route.ts`: hydraat workspace row
- i18n keys (`providers.runtime.*`) NL/EN/DE

### Sprint C — Per-topic dashboards + routines (grootste)
- Migration `043_nav_node_scoping.sql`: nullable `nav_node_id` op agents/schedules/runs/queue_items + indexes
- Recursive CTE helper `lib/queries/nav-nodes.ts:listDescendantNavNodeIds(rootId)`
- Refactor `BusinessDashboard.tsx` → `<ScopedDashboard scope={...}>` (kind, id, includeDescendants)
- Refactor `SchedulesPanel.tsx` → scope-aware (`scopedSchedules` query)
- Per-topic page (`/business/[bizId]/n/[...path]/page.tsx`): rendert `<ScopedDashboard>` + `<ScopedSchedulesPanel>` met `kind=navnode, id=current.id, includeDescendants=true`
- Right-click context "Verplaats naar topic" op AgentsList rows + SchedulesPanel rows
- i18n keys (`topic.dashboard.*`) NL/EN/DE

## Verificatie per sprint

**A**: maak custom key `AIRTABLE_TEST` aan, chat met agent: `read_secret("AIRTABLE_TEST")` → krijg waarde terug. Custom integration met `{{secret.AIRTABLE_TEST}}` in body → resolved.

**B**: Onboarding-card pill = "Niet geïnitialiseerd". Run command op VPS (`hermes profile create aio-admin`). Verify klikt → pill flipt naar groen + DB column gestamped. Volgende chat → `aio-admin chat` ipv `hermes chat` (verifyen via `ps aux` of `lsof`).

**C**: maak topic "Faceless YT > Reels" aan. Create agent in Reels-topic (right-click → assign). Topic-page toont die agent in z'n dashboard + schedule. Parent topic ("Faceless YT") rolt 't op via descendants CTE. Business root toont alles.

## Deploy strategie

Eén commit + deploy per sprint. Tussendoor live smoke-test in Chrome.
