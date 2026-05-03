# Plan v1 — implementatieontwerp

Synthese van brief + map + research. Drie features, één plan, gefaseerd.

## Feature 1 — Per-topic dashboards + routines

### Architectuur (gekozen)
**Optie B uit map** — `nav_node_id` (nullable) op `agents` / `schedules` / `runs` / `queue_items`. Geen backfill (bestaande rows blijven business-scoped via NULL); user kan rows handmatig aan een topic koppelen via right-click "Verplaats naar topic X".

### Schema (migration `042_nav_node_scoping.sql`)
```sql
alter table aio_control.agents       add column if not exists nav_node_id uuid references aio_control.nav_nodes(id) on delete set null;
alter table aio_control.schedules    add column if not exists nav_node_id uuid references aio_control.nav_nodes(id) on delete set null;
alter table aio_control.runs         add column if not exists nav_node_id uuid references aio_control.nav_nodes(id) on delete set null;
alter table aio_control.queue_items  add column if not exists nav_node_id uuid references aio_control.nav_nodes(id) on delete set null;

create index if not exists idx_agents_navnode      on aio_control.agents       (nav_node_id) where nav_node_id is not null;
create index if not exists idx_schedules_navnode   on aio_control.schedules    (nav_node_id) where nav_node_id is not null;
create index if not exists idx_runs_navnode        on aio_control.runs         (nav_node_id) where nav_node_id is not null;
create index if not exists idx_queue_navnode       on aio_control.queue_items  (nav_node_id) where nav_node_id is not null;
```

### Component-refactor
1. **Extract `<ScopedDashboard scope={{kind, id, includeDescendants}}>`** uit `BusinessDashboard.tsx`. Queries:
   - `kind=business`: `WHERE business_id=?` (huidig gedrag)
   - `kind=navnode + includeDescendants=true`: `WHERE nav_node_id IN (recursive cte van topic + alle children)` — voor de business-page roll-up óf voor een parent-topic
   - `kind=navnode + includeDescendants=false`: `WHERE nav_node_id=?` — voor leaf-topic dashboard
2. **Extract `<ScopedSchedulesPanel scope={...}>`** uit `SchedulesPanel.tsx` met dezelfde scope-prop.
3. **Per-topic page** (`apps/control/app/[workspace_slug]/business/[bizId]/n/[...path]/page.tsx`) gebruikt nu beide componenten met `kind="navnode", id=current.id, includeDescendants=true`.
4. **Business root page** (`/business/[bizId]/page.tsx`) ongewijzigd — `BusinessDashboard` blijft `WHERE business_id=?` doen (rollup van alles dat aan deze business hangt, inclusief nieuwe rijen met nav_node_id gezet).
5. **Right-click context** — voeg "Verplaats naar topic" submenu toe aan AgentsList + SchedulesPanel rows.

### Module concept (uitgesteld naar later)
- **Niet in deze ronde**: AI-genererende dashboards uit jsonb-config. Eerste eindversie = hardcoded layout met scope-filtering.
- Phase 2 (later): `nav_nodes.dashboard_config jsonb` met widget-definities; `<DynamicDashboard config={...}>` renderer die die widgets uit een gedeelde lib pakt.

### i18n
Hergebruik bestaande `biz.*` keys; voeg `topic.dashboard.*`, `topic.routines.*` toe waar copy verschilt (e.g. "Topic queue" ipv "Open queue").

---

## Feature 2 — Persistent runtime agents in Hermes/OpenClaw onboarding

### Wat de runtimes zelf bieden (uit research)
- **Hermes**: `hermes profile create <name>` → maakt `~/.hermes/profiles/<name>/` met config + state.db. Daarna `<name> chat` werkt als wrapper.
- **OpenClaw**: `openclaw init && openclaw agents add <name> --workspace <path>` → registreert agent in gateway. Daarna `openclaw agent <name> -m ...`.

### Schema (migration `041_runtime_agents.sql`)
```sql
alter table aio_control.workspaces
  add column if not exists hermes_agent_name        text,
  add column if not exists hermes_agent_initialized_at  timestamptz,
  add column if not exists openclaw_agent_name      text,
  add column if not exists openclaw_agent_initialized_at timestamptz;
```

### UX (in `ProvidersOnboardingPanel.tsx`)
Onder de bestaande EndpointForm per Hermes/OpenClaw card, nieuwe **"Persistent runtime agent"** sectie:

```
[Status pill: "Niet geïnitialiseerd" | "Klaar voor verificatie" | "Geïnitialiseerd ✓ aio-{slug}"]

  ► Wat is dit?
    Korte uitleg: Hermes/OpenClaw kan een named agent draaien die conversatie-state
    over runs heen onthoudt. Wij maken één per workspace.

  Agent name: aio-{workspaceSlug}                          [Edit]

  Run dit op je Hermes/OpenClaw machine:
  ┌─────────────────────────────────────────────────────────┐
  │ hermes profile create aio-jeremy && aio-jeremy setup    │ [Copy]
  └─────────────────────────────────────────────────────────┘

  [Verify agent exists]   [Mark as initialized]
```

### Server actions (nieuw, `app/actions/providers.ts`)
- `generateAgentName(workspaceSlug)` — utility (`aio-` + slug, sanitized)
- `verifyHermesAgent({workspaceId, name})` — spawnt `hermes profile list` (of `${HERMES_BIN} profile list`), grep voor name → success/fail
- `verifyOpenClawAgent({workspaceId, name})` — spawnt `openclaw agents list`, grep voor name → success/fail
- `markRuntimeAgentInitialized({workspaceId, provider, name})` — set workspace columns

### Provider router updates
- **`packages/ai/src/router.ts`**: tenant context krijgt nu ook `hermesAgentName?: string`, `openclawAgentName?: string` (gehydrateerd uit workspace row in `lib/dispatch/runs.ts` + `app/api/chat/[agent_id]/route.ts`).
- **`packages/ai/src/providers/hermes.ts`**: als `tenant.hermesAgentName` set → spawn `${HERMES_BIN_DIR}/${tenant.hermesAgentName} chat --json --session <id> --message "<prompt>"`. Anders fallback naar huidige `hermes chat ...`.
- **`packages/ai/src/providers/openclaw.ts`**: als `tenant.openclawAgentName` set → spawn `openclaw agent ${tenant.openclawAgentName} --json -m "<prompt>"`. Anders fallback.

### Verificatie pad
Na "Verify" klik:
1. Spawn de list-command (5s timeout, dezelfde `probeBinary` pattern uit `app/actions/providers.ts`).
2. Filter stdout op de agent name.
3. Found → call `markRuntimeAgentInitialized` → stamp DB → revalidatePath → pill flipt naar groen.
4. Not found → tonen "Agent niet gevonden in `hermes profile list` output. Heb je het commando hierboven al gerund?"

---

## Feature 3 — Custom API keys

### Schema (migration `043_api_keys_kind.sql`)
```sql
alter table aio_control.api_keys
  add column if not exists kind text not null default 'provider'
    check (kind in ('provider', 'custom'));

create index if not exists idx_api_keys_kind on aio_control.api_keys (workspace_id, kind);
```

`provider` kolom blijft vrij text (al onbeperkt). `kind='custom'` markeert user-defined keys voor UI-filtering.

### UI uitbreiding (`ApiKeysPanel.tsx`)
- Provider-`<select>` krijgt aan de bodem een extra optie **"+ Custom secret…"**
- Selectie van die optie → toont extra `<input>` voor key name (validatie: `[A-Z][A-Z0-9_]*`, lowercase wordt auto-uppercased, alleen letters/cijfers/underscore, geen spaties)
- Op `setApiKey` server-action wordt `kind: 'custom'` meegegeven
- Lijst-weergave: gegroepeerd op kind ("Provider keys" sectie + "Custom secrets" sectie) of een filter-tab

### Read API
- **Server-side**: bestaande `resolveApiKey(name, scope)` werkt al — geen wijziging nodig (provider kolom is al free text).
- **Voor agents**: nieuwe AIO tool `read_secret` in `packages/ai/src/aio-tools.ts`:
  ```ts
  {
    name: "read_secret",
    description: "Read a workspace secret by name (e.g. AIRTABLE_API_KEY). Returns the value or null if not set.",
    parameters: { name: { type: "string" } },
    kind: "read",   // auto-allowed, no plan-mode approval needed
    handler: async (args, ctx) => {
      const v = await resolveApiKey(args.name, { workspaceId: ctx.workspaceId, businessId: ctx.businessId });
      return v ? { value: v } : { value: null };
    },
  }
  ```
- **Voor custom integrations**: extend de Mustache template-resolver in `lib/notify/custom-integration.ts` om `{{secret.<NAME>}}` placeholders te ondersteunen.

### Security
- **Workspace-scoped read**: tool ctx heeft `workspaceId` → tier-resolution houdt scope-isolation.
- **Per-business / per-topic later**: keys kunnen al business/navnode scope hebben in `api_keys`; resolver pakt 't beste match. Geen extra werk.
- **Allowlist per agent**: defer naar later. Eerste pass: alle agents in een workspace mogen alle workspace-custom-keys lezen. Logging in audit_logs voor traceability.

---

## Volgorde van uitvoering

1. **#3 (custom keys) eerst** — kleinste change, low-risk, schema-only.
2. **#2 (persistent runtime agents)** — mid-size, schema + UX + provider-router updates.
3. **#1 (per-topic dashboards)** — grootste, raakt 4 tabellen + 2 panels + nieuwe page-content.

Tussendoor: typecheck + deploy per feature, smoke-test live in Chrome.

---

## Verificatie (per feature)

### Feature 1
- New agent op een topic aanmaken via right-click "Verplaats naar topic X"
- Topic page rendert dashboard met dat agent's metrics
- Business root page blijft alle agents tonen (rollup)
- Topic schedules-panel rendert alleen de schedules met `nav_node_id = topic.id`

### Feature 2
- Onboarding-card toont "Niet geïnitialiseerd" pill voor Hermes/OpenClaw
- Copy-button kopieert correct command
- Na user run + Verify → pill flipt naar groen, agent name in DB
- Volgende chat in een Hermes/OpenClaw agent gebruikt `<name> chat` ipv `hermes chat`

### Feature 3
- "Custom secret" optie in dropdown → toont name input
- Save → row in `api_keys` met `kind='custom'`
- Agent met `read_secret` tool kan de key lezen (test via chat: "use read_secret to read AIRTABLE_API_KEY and show first 4 chars")
- Custom integration met `{{secret.AIRTABLE_API_KEY}}` in body resolved correct

---

## Open vragen (voor user)

Vraag ik via AskUserQuestion vóór ik bouw.

1. **Topic dashboard scope** — Topic-pagina toont alleen ZIJN eigen agents/schedules, of óók die van alle subtopics (rollup)?
2. **Custom-key allowlist per agent** — Eerste pass open-by-default voor alle agents in workspace? Of meteen per-agent allowlist UI?
3. **Module imports** — User noemde "existing modules importeren of recreëren". Bedoel je: (a) externe Next.js apps via `nav_node.href` linken (al bestaand), (b) hun datamodel naar AIO Control porten (groot), of (c) AI-gegenereerde mini-dashboards per business module die gewoon onze tile-style hergebruiken?
4. **Agent name template** — `aio-{workspaceSlug}` of mag user 'm zelf kiezen? Voorbeeld voor user "jeremy" met workspace slug "admin": `aio-admin` of `aio-jeremy-admin`?
