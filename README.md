# AIO Control

> The solo operator's agent command center.

Multi-tenant Next.js 15 control panel for managing multiple AI-driven
mini-businesses (Faceless YouTube, Etsy POD, Blog Network, Fiverr gigs,
lead-gen) under one workspace. Self-hosted Supabase + multi-provider AI
agents (Claude API/CLI, OpenRouter, MiniMax, Ollama, OpenClaw, Hermes).
Cron schedules run hybrid — locally on the VPS for non-Claude agents,
on Claude Routines for Claude-subscription agents.

Lives at `https://aio.tromptech.life` (subdomain build) and
`https://tromptech.life/aio` (path build) in production.

## Status

✅ **Skeleton hardening pass v3 complete.** Auth + workspaces + RLS,
multi-provider chat, hybrid cron scheduler, workspace-global agents,
unified system-prompt builder (agents now know they live inside AIO
Control), tool-registry foundation. Modules (lead-mgmt, YT-content,
YT-intel zones) come next.

## URL structure

```
/                                            redirects → /[default-ws]/dashboard
/login   /signup   /auth/callback            public auth flows
/admin/marketplace                           super-admin only
/share/[slug]                                public marketplace listing

/[ws]/                                       workspace shell (rail + header)
├── dashboard                                cards of all businesses
├── profile                                  user identity + contact + login history
├── settings                                 workspace settings (general / team / appearance / api-keys / telegram / email / language / danger)
├── activity                                 cross-business audit feed
├── cost                                     spend overview + per-business limits
├── queue                                    cross-business HITL queue
├── runs                                     cross-business run history
├── marketplace                              public marketplace browse
├── agents                                   workspace-global agents (NEW v3)
└── business/[bizId]/                        business-scoped (with shared layout)
    ├── (root)                               business dashboard (KPIs + queue + agents + runs)
    ├── agents                               business-scoped agents
    ├── schedules                            cron + webhook + manual triggers
    ├── runs                                 business run history
    ├── integrations                         per-business external services
    └── n/[...path]                          deep drill into nav-node tree
                                             (path = chain of nav_node ids)

/api/
├── chat/[agent_id]                          AG-UI streaming chat (SSE)
├── runs                                     list runs
├── runs/[run_id]/dispatch                   internal dispatcher
├── runs/[run_id]/result                     legacy URL-param Routines callback
├── runs/result                              payload-based Routines callback (NEW v3)
├── runs/retry-sweep                         cron-tick retry queue
├── triggers/[secret]                        webhook trigger (rate-limited)
├── search                                   global search (workspaces / businesses / agents / runs)
├── notifications                            list + ack
├── push/{key,subscribe,test,queue-event}    Web Push (VAPID)
├── auth/oauth-config                        login form probes for available OAuth providers
├── integrations/{stripe,mollie,telegram/webhook}
├── admin/marketplace/preview
├── health                                   200/503 — used by Caddy probe
└── version                                  build SHA + timestamp
```

## Skeleton components

| Component | File / dir | Notes |
|-----------|-----------|-------|
| Auth + middleware | `apps/control/lib/supabase/{server,client,service,middleware}.ts`, `apps/control/middleware.ts` | `@supabase/ssr` direct; service role only server-side. Login events captured per 12h window. |
| Workspace shell | `apps/control/app/[workspace_slug]/layout.tsx` + `components/WorkspaceShell.tsx` | Rail + header + chat-panel mounted globally; drill-state derived from URL pathname |
| Business shell | `apps/control/app/[workspace_slug]/business/[bizId]/layout.tsx` | Mounts BusinessTabs once for ALL business sub-routes |
| Provider router | `packages/ai/src/router.ts` + `providers/*` | Streams every provider as AG-UI events. Smart-routing rules per agent. |
| AIO function-tools | `packages/ai/src/aio-tools.ts` | Read/write/meta tool registry; `defaultToolsForKind` per agent kind |
| System-prompt builder | `apps/control/lib/agents/system-prompt.ts` | Single source of truth for the preamble (platform / identity / tools / siblings / business / budget). Used by chat AND dispatcher. |
| Run dispatcher | `apps/control/lib/dispatch/runs.ts` | Pre-flight checks + retry with exponential backoff + chain-on-done/fail |
| Cron scheduler | `apps/control/lib/dispatch/cron-scheduler.ts` + `instrumentation.ts` | node-cron loop on the VPS Node process. Subscription-Claude routes to Anthropic Routines instead. |
| API key resolver | `apps/control/lib/api-keys/resolve.ts` | navnode → business → workspace → env-var fallback. Honours `businesses.isolated`. |
| Notify dispatch | `apps/control/lib/notify/{telegram,email,dispatch,push}.ts` | One entry-point fans out to all channels |
| Schema + RLS | `packages/db/supabase/migrations/*.sql` | All in `aio_control` schema. RLS on every user-data table. |

## Agent credential modes (`agents.key_source`)

| Value | Meaning |
|-------|---------|
| `subscription` | Claude Pro/Max/Team — runs on Claude's own infra (Routines for cron, claude-cli for chat). Claude-only. |
| `api_key` | Anthropic / OpenRouter / MiniMax / etc API key from the workspace api_keys table. Local cron + direct dispatcher. |
| `env` | Falls back to `process.env.<PROVIDER>_API_KEY`. Default for solo dev. |

## Tech stack

| Layer            | Choice                                              |
| ---------------- | --------------------------------------------------- |
| Monorepo         | Turborepo + pnpm                                    |
| Framework        | Next.js 16 (App Router) + TypeScript                |
| DB / Auth        | Self-hosted Supabase (Postgres + Auth + Realtime)   |
| ORM              | Drizzle ORM (typed schema + migrations)             |
| Auth helpers     | `@supabase/ssr` direct (no Auth.js layer)           |
| Chat UI          | Custom — AG-UI event format, multi-provider router  |
| Scheduling       | Hybrid: node-cron locally + Anthropic Routines for Claude-subscription |
| Deploy           | Caddy (TLS) → Next.js standalone via systemd on VPS |

## Repo layout

```
apps/
  control/                  Next.js 15 shell — what the user sees
packages/
  ui/                       Shared React components (rail, header, icons, context-menu)
  db/                       Drizzle schema + Supabase migrations (numbered 001-037)
  ai/                       Provider router + AG-UI event format + AIO tools registry + Routines client
  eslint-config/            Shared ESLint preset
  typescript-config/        Shared tsconfig presets
deploy/
  vps-deploy.sh             Dual-build deploy script (path + subdomain)
  aio-control.service       systemd unit for path build (port 3010)
  aio-control-root.service  systemd unit for subdomain build (port 3012)
  backup-supabase.sh        Daily pg_dump
  install-cron.sh           Sets up the backup cron entry
```

## Local development

```bash
pnpm install
cp .env.local.example .env.local   # then fill in Supabase URL + anon key
pnpm dev                            # starts apps/control on :3010
```

## Scripts

```bash
pnpm dev          # turbo run dev across all apps/packages
pnpm build        # production build (apps/control becomes .next/standalone)
pnpm lint         # eslint everywhere
pnpm check-types  # tsc --noEmit
```

## Deployment

Two builds run side-by-side on the VPS:

- **Path build** (`/aio/*`) — port 3010 — `aio-control.service`
- **Subdomain build** (`aio.tromptech.life/*`) — port 3012 — `aio-control-root.service`

Same `.env.production`, same Supabase, cookies scoped to `.tromptech.life`
so a session on one URL is valid on the other. Caddy fronts both with TLS.

Deploy from local machine after `git push`:

```bash
ssh jeremy@vps "bash /home/jeremy/aio-control/deploy/vps-deploy.sh"
```

That script: `git fetch+reset origin/main` → `pnpm install` → builds
both variants (different `BASE_PATH`) → wipes + restages each into
`.staged-aio/` and `.staged-root/` → restarts both systemd units →
waits for both `/api/health` to come up green.

## Migrations

Numbered SQL files under `packages/db/supabase/migrations/`. Apply on
the VPS Supabase Postgres container:

```bash
docker exec -i supabase-db psql -U postgres -d postgres \
  < packages/db/supabase/migrations/0NN_<name>.sql
```

Migrations are idempotent (`if not exists` guards). Apply in order;
the latest is `037_agent_tools.sql` (per-agent tool allow-list).

## Plans + history

- `~/.claude/plans/jaunty-conjuring-wave.md` — current ULTRAPLAN +
  the v3 skeleton-hardening pass that this codebase reflects.
