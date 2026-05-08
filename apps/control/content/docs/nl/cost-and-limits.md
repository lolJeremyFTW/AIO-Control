---
title: Cost en spend limits
description: Cost dashboard, per-business limits, auto-pause, provider cooldowns.
---

URL: `/[ws]/cost`

## Cost dashboard

Drie tabellen:

1. **Per business** -- runs, cost, failed per 24h/7d/30d
2. **Per agent** -- zelfde windows
3. **Per provider** -- claude, minimax, openrouter, ollama (gratis), enz.

Plus een sparkline van dagelijks totaal over 30 dagen.

Periode toggle: 24h / 7d / 30d. Niet een query-trigger maar puur presentational, want alle drie de windows zijn al pre-aggregated in de view.

## Spend limits

Settings > Spend Limits. Per business of workspace zet u:

- **Daily cap** in cents
- **Weekly cap** in cents
- **Monthly cap** in cents
- **Action bij overschrijding**: pause, notify-only, of pause-and-notify

Bij pause worden alle agents van die business automatisch op disabled gezet. U krijgt een notificatie.

## Provider cooldowns

Settings > Providers. Per provider zet u een cooldown:

- **Min seconds between calls**
- **Max retries on rate-limit**

Voorkomt rate-limit storms.

## Provider connection logs

`/api/providers/[name]/models` triggert een test-call. Logs worden opgeslagen in `provider_connection_logs`. Handig om provider-issues te debuggen.

## Indicatie van kosten per provider

| Provider + Model | Indicatie per 1K output tokens |
|------------------|-------------------------------|
| MiniMax-M2.7-Highspeed | ~ EUR 0,002 |
| Claude Haiku 4.5 | ~ EUR 0,002 |
| Claude Sonnet 4.6 | ~ EUR 0,015 |
| Ollama (lokaal) | gratis |

Voor 1000 runs per maand met gemiddeld 2K input + 1K output op Sonnet: ~ EUR 30 per maand. MiniMax voor zelfde workload: ~ EUR 5.
