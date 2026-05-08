---
title: Cost und Spend Limits
description: Cost-Dashboard, Per-Business-Limits, Auto-Pause, Provider-Cooldowns.
---

URL: `/[ws]/cost`

## Cost-Dashboard

Drei Tabellen:

1. **Pro Business** -- runs, Cost, Failed pro 24h/7d/30d
2. **Pro Agent** -- gleiche Windows
3. **Pro Provider** -- Claude, MiniMax, OpenRouter, Ollama (gratis), usw.

Plus eine Sparkline des täglichen Totals über 30 Tage.

Period-Toggle: 24h / 7d / 30d. Kein Query-Trigger, sondern rein präsentational, da alle drei Windows bereits in der View pre-aggregated sind.

## Spend Limits

Settings > Spend Limits. Pro business oder workspace setzen Sie:

- **Daily Cap** in Cents
- **Weekly Cap** in Cents
- **Monthly Cap** in Cents
- **Aktion bei Überschreitung**: pause, notify-only oder pause-and-notify

Bei Pause werden alle agents dieses business automatisch auf disabled gesetzt. Sie erhalten eine Notifikation.

## Provider Cooldowns

Settings > Providers. Pro Provider setzen Sie einen Cooldown:

- **Min seconds between calls**
- **Max retries on rate-limit**

Verhindert Rate-Limit-Stürme.

## Provider Connection Logs

`/api/providers/[name]/models` triggert einen Test-Call. Logs werden in `provider_connection_logs` gespeichert. Praktisch zum Debuggen von Provider-Issues.

## Indikation der Kosten pro Provider

| Provider + Modell | Indikation pro 1K Output Tokens |
|------------------|-------------------------------|
| MiniMax-M2.7-Highspeed | ~ EUR 0,002 |
| Claude Haiku 4.5 | ~ EUR 0,002 |
| Claude Sonnet 4.6 | ~ EUR 0,015 |
| Ollama (lokal) | gratis |

Für 1000 runs pro Monat mit durchschnittlich 2K Input + 1K Output auf Sonnet: ~ EUR 30 pro Monat. MiniMax für dieselbe Workload: ~ EUR 5.
