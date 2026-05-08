---
title: Wat AIO Control doet
description: Command center voor solo-operators met meerdere AI-businesses.
---

AIO Control beheert meerdere AI-gedreven mini-businesses vanuit één paneel. Bedoeld voor solo-operators. U bouwt per business uw eigen agents, schedules, integraties en dashboards.

Voorbeelden uit de praktijk:

- Faceless YouTube-kanaal met daily script + thumbnail generatie
- Etsy print-on-demand met listing-scraper en prijs-optimizer
- Blog-netwerk met SEO-onderzoek en publish-pipeline
- Fiverr gigs met intake-bot en delivery-template
- Lead-generatie met outreach-pipeline en HITL approval

## De stack onder de motorkap

| Laag | Keuze |
|------|-------|
| Framework | Next.js 16 (App Router) |
| Database | Self-hosted Supabase (Postgres + Auth + Realtime) |
| AI providers | Claude API, Claude CLI subscription, OpenRouter, MiniMax, Ollama, OpenClaw, Hermes, OpenAI Codex |
| Scheduling | Hybride. Lokale node-cron op uw VPS plus Anthropic Routines voor subscription-Claude. |
| Deploy | Caddy (TLS) > Next.js standalone via systemd op VPS |

## Twee URLs voor dezelfde app

- `https://aio.tromptech.life` -- subdomein build (poort 3012)
- `https://tromptech.life/aio` -- path build onder hoofddomein (poort 3010)

Cookies zijn scoped op `.tromptech.life`. Een sessie op één URL geldt op de andere. U kunt vrij switchen.

## Voor wie het is

- **Solo founders** die meerdere zijprojecten parallel runnen
- **Agencies** die per client een geïsoleerde workspace willen
- **Indie operators** die niet aan elke tool een aparte cron-job willen koppelen

## Voor wie het niet is

- Teams die een full-blown ERP nodig hebben
- Bedrijven die enterprise-grade audit en compliance willen
- Klanten die geen eigen VPS willen draaien (we hosten alles op één Hetzner-machine)
