---
title: Was AIO Control macht
description: Command Center für Solo-Operators mit mehreren AI-Businesses.
---

AIO Control verwaltet mehrere AI-gesteuerte Mini-Businesses aus einem einzigen Panel. Gedacht für Solo-Operators. Sie bauen pro Business Ihre eigenen Agents, Schedules, Integrationen und Dashboards.

Beispiele aus der Praxis:

- Faceless YouTube-Kanal mit täglicher Skript- und Thumbnail-Generierung
- Etsy Print-on-Demand mit Listing-Scraper und Preis-Optimizer
- Blog-Netzwerk mit SEO-Recherche und Publish-Pipeline
- Fiverr-Gigs mit Intake-Bot und Delivery-Template
- Lead-Generierung mit Outreach-Pipeline und HITL-Approval

## Der Stack unter der Haube

| Schicht | Wahl |
|------|-------|
| Framework | Next.js 16 (App Router) |
| Datenbank | Self-hosted Supabase (Postgres + Auth + Realtime) |
| AI Providers | Claude API, Claude CLI Subscription, OpenRouter, MiniMax, Ollama, OpenClaw, Hermes, OpenAI Codex |
| Scheduling | Hybrid. Lokales node-cron auf Ihrem VPS plus Anthropic Routines für Subscription-Claude. |
| Deploy | Caddy (TLS) > Next.js standalone via systemd auf VPS |

## Zwei URLs für dieselbe Anwendung

- `https://aio.tromptech.life` -- Subdomain-Build (Port 3012)
- `https://tromptech.life/aio` -- Path-Build unter der Hauptdomain (Port 3010)

Cookies sind auf `.tromptech.life` gescoped. Eine Sitzung auf einer URL gilt auch auf der anderen. Sie können frei wechseln.

## Für wen es ist

- **Solo Founders**, die mehrere Nebenprojekte parallel betreiben
- **Agencies**, die pro Kunde einen isolierten workspace wollen
- **Indie Operators**, die nicht für jedes Tool einen separaten Cron-Job einrichten wollen

## Für wen es nicht ist

- Teams, die ein vollwertiges ERP benötigen
- Unternehmen, die Enterprise-Audit und Compliance wollen
- Kunden, die keinen eigenen VPS betreiben wollen (wir hosten alles auf einer einzigen Hetzner-Maschine)
