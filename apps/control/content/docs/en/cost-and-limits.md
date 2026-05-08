---
title: Cost and spend limits
description: Cost dashboard, per-business limits, auto-pause, provider cooldowns.
---

URL: `/[ws]/cost`

## Cost dashboard

Three tables:

1. **Per business** -- runs, cost, failed per 24h/7d/30d
2. **Per agent** -- same windows
3. **Per provider** -- claude, minimax, openrouter, ollama (free), etc.

Plus a sparkline of daily total over 30 days.

Period toggle: 24h / 7d / 30d. Not a query trigger but purely presentational, since all three windows are already pre-aggregated in the view.

## Spend limits

Settings > Spend Limits. Per business or workspace you set:

- **Daily cap** in cents
- **Weekly cap** in cents
- **Monthly cap** in cents
- **Action on overrun**: pause, notify-only, or pause-and-notify

On pause all agents of that business are automatically set to disabled. You get a notification.

## Provider cooldowns

Settings > Providers. Per provider you set a cooldown:

- **Min seconds between calls**
- **Max retries on rate-limit**

Prevents rate-limit storms.

## Provider connection logs

`/api/providers/[name]/models` triggers a test call. Logs are stored in `provider_connection_logs`. Useful for debugging provider issues.

## Cost indication per provider

| Provider + Model | Indication per 1K output tokens |
|------------------|-------------------------------|
| MiniMax-M2.7-Highspeed | ~ EUR 0.002 |
| Claude Haiku 4.5 | ~ EUR 0.002 |
| Claude Sonnet 4.6 | ~ EUR 0.015 |
| Ollama (local) | free |

For 1,000 runs per month with average 2K input + 1K output on Sonnet: ~ EUR 30 per month. MiniMax for the same workload: ~ EUR 5.
