---
title: What AIO Control does
description: Command center for solo operators running multiple AI businesses.
---

AIO Control manages multiple AI-driven mini businesses from a single panel. Built for solo operators. You build your own agents, schedules, integrations and dashboards per business.

Real-world examples:

- Faceless YouTube channel with daily script + thumbnail generation
- Etsy print-on-demand with listing scraper and price optimizer
- Blog network with SEO research and publish pipeline
- Fiverr gigs with intake bot and delivery template
- Lead generation with outreach pipeline and HITL approval

## The stack under the hood

| Layer | Choice |
|------|-------|
| Framework | Next.js 16 (App Router) |
| Database | Self-hosted Supabase (Postgres + Auth + Realtime) |
| AI providers | Claude API, Claude CLI subscription, OpenRouter, MiniMax, Ollama, OpenClaw, Hermes, OpenAI Codex |
| Scheduling | Hybrid. Local node-cron on your VPS plus Anthropic Routines for subscription Claude. |
| Deploy | Caddy (TLS) > Next.js standalone via systemd on VPS |

## Two URLs for the same app

- `https://aio.tromptech.life` -- subdomain build (port 3012)
- `https://tromptech.life/aio` -- path build under the main domain (port 3010)

Cookies are scoped to `.tromptech.life`. A session on one URL works on the other. You can switch freely.

## Who it is for

- **Solo founders** running multiple side projects in parallel
- **Agencies** that want an isolated workspace per client
- **Indie operators** who don't want to wire up a separate cron job for every tool

## Who it is not for

- Teams that need a full-blown ERP
- Companies that want enterprise-grade audit and compliance
- Customers who don't want to run their own VPS (we host everything on a single Hetzner machine)
