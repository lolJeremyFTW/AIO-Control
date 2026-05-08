---
title: Frequently asked questions
description: The most common issues and how to solve them.
---

## My agent doesn't use the skill I assigned

Check that the skill is in `allowed_skills` of the agent. The system prompt builder only injects assigned skills. If you toggle skills on/off via a checkbox you also have to save the agent edit.

## A schedule doesn't run at the time I set

Cron expressions are in UTC. NL is UTC+1 (winter) or UTC+2 (summer). Example: "every day 09:00 NL time in winter" = `0 8 * * *` UTC. AIO shows an explanation line under the cron builder that shows when it runs.

## I'm not getting Telegram notifications

Three checks:

1. Is your bot token filled in Settings > Telegram?
2. Did you send your bot a `/start` from the chat where notifications should go?
3. Is the telegram target bound to the right agent?

## My run has been on `running` for hours

The worker process may have crashed. Stop the run via `/api/runs/[id]/stop` and check the VPS logs (`sudo journalctl -u aio-control-root --since '1 hour ago'`).

## How much does an average run cost?

Depends on provider and model. Indication:

- MiniMax-M2.7-Highspeed: ~ EUR 0.002 per 1k tokens out
- Claude Sonnet 4.6: ~ EUR 0.015 per 1k tokens out
- Claude Haiku 4.5: ~ EUR 0.002 per 1k tokens out
- Ollama: free (runs on your VPS)

For 1,000 runs/month with average 2k input + 1k output on Sonnet: ~ EUR 30/month in tokens. MiniMax for the same workload: ~ EUR 5.

## Can I use AIO Control offline?

Not entirely. The Next.js app needs Supabase. But if you run Ollama agents, your agents themselves don't need internet. The UI does need a connection to your VPS.

## What if my VPS is down?

- Subscription Claude agents keep working (run on Anthropic).
- Webhook triggers and cron schedules on the VPS fail until back up.
- Failed runs are automatically retried as soon as the retry sweep runs again.

## Can an agent see another workspace?

No. Row Level Security (RLS) is on every user-data table. An agent only has access to its own workspace. Workspace isolation is hard.

## Can I export my data?

On Team plan: yes, via audit log export and GDPR DSR helpers. On Free or Pro: not via UI. Directly from the database via your VPS.

## Are my API keys shared if I put an agent on the marketplace?

No. Marketplace listings contain the agent config but no credentials. The installer has to add their own keys.

## Does the iOS app work?

Capacitor build is in production. Push notifications work. The Talk feature works on iOS Safari (after add-to-home-screen) or the native app.

## How do I link AIO Control to other TrompTech projects?

Two options:

1. **Custom integration** -- AIO POSTs to your other project's webhook
2. **Inbound webhook** -- your other project POSTs to `/api/triggers/[secret]`

For automation pipelines with n8n, Zapier or Make: use those as a bridge.
