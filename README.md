# AIO Control

> The solo operator's agent command center.

Multi-tenant Next.js 15 control panel that manages multiple AI-driven mini-businesses (Faceless YouTube, Etsy POD, Blog Network, Fiverr gigs, lead-gen) for a single owner. Built on self-hosted Supabase with Notion-style multi-workspaces, multi-provider AI workers (Claude, OpenRouter, MiniMax, Ollama, OpenClaw, Hermes), and Claude Routines for scheduled runs.

Lives at `tromptech.life/aio` in production.

## Status

🚧 **Phase 0 — repo skeleton.** Design CSS + fonts + shared UI packages render an empty-state dashboard. Auth, DB schema, and the rest land in subsequent phases (see `docs/PLAN.md` once added, or the approved plan at `~/.claude/plans/`).

## Tech stack

| Layer            | Choice                                              |
| ---------------- | --------------------------------------------------- |
| Monorepo         | Turborepo + pnpm                                    |
| Framework        | Next.js 16 (App Router) + TypeScript                |
| DB / Auth        | Self-hosted Supabase (Postgres + Auth + Realtime)   |
| ORM              | Drizzle ORM (typed schema + migrations)             |
| Auth helpers     | `@supabase/ssr` direct (no Auth.js layer)           |
| Chat UI          | Custom — AG-UI event format, multi-provider router  |
| Scheduling       | Claude Routines (cron + bearer-token webhooks)      |
| Deploy           | Caddy (TLS) → Next.js standalone via systemd on VPS |

## Repo layout

```
apps/
  control/           Next.js 15 shell (this is what users see at /aio)
packages/
  ui/                Shared React components (rail, header, icons, …)
  db/                Drizzle schema + Supabase client
  ai/                Provider router + AG-UI event format + pricing
  eslint-config/     Shared ESLint preset
  typescript-config/ Shared tsconfig presets
```

## Local development

```bash
pnpm install
cp .env.local.example .env.local   # then fill in Supabase URL + anon key
pnpm dev                            # starts apps/control on :3010
```

The dev server listens on **port 3010** (matches the production reverse-proxy target).

## Scripts

```bash
pnpm dev          # turbo run dev across all apps/packages
pnpm build        # production build (apps/control becomes .next/standalone)
pnpm lint         # eslint everywhere
pnpm check-types  # tsc --noEmit
pnpm format       # prettier --write
```

## Deployment

Production target is `tromptech.life/aio` behind Caddy on a Hetzner VPS reachable via Tailscale (`vps`). Detailed deploy notes will land in phase 6.
