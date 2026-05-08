---
title: Schedules and routines
description: Cron, webhook, manual triggers. Hybrid local + Routines.
---

URL per business: `/[ws]/business/[bizId]/schedules`

## Three types

| Type | Trigger |
|------|---------|
| **cron** | On time, defined via a cron expression |
| **webhook** | HTTP POST to `/api/triggers/[secret]` |
| **manual** | User clicks "Run now" |

## Building a cron schedule

The `ScheduleBuilder` has 5 modes:

| Mode | Example |
|------|-----------|
| **interval** | Every 30 minutes |
| **hourly** | On the hour |
| **daily** | Every day at 09:00 |
| **weekly** | Mon-Fri at 09:00 |
| **custom** | Hand-written cron expression |

The form translates to a 5-field cron string in UTC. Example: daily 09:00 NL = `0 7 * * *` UTC. AIO Control handles the offset.

## Fields on a cron schedule

- **Agent** -- which agent runs
- **Title** -- for yourself, for example "Daily Etsy listing scan"
- **Description** (optional) -- for yourself
- **Instructions** -- the prompt that goes to the agent
- **Topic pin** (optional) -- under which topic the runs fall
- **Telegram target** (optional) -- where the report goes to
- **Custom integration** (optional) -- webhook after done
- **Notification targets** -- Slack, Discord, email

## Webhook schedules

On creation you get a unique URL:

```
https://aio.tromptech.life/api/triggers/abc123def456
```

The secret in the URL gets sha256 hashed and constant-time compared with `webhook_secret_hash`. A POST in here places a queued run with the body as input.

```bash
curl -X POST https://aio.tromptech.life/api/triggers/abc123 \
  -H "Content-Type: application/json" \
  -d '{"trigger": "github_push", "repo": "myrepo"}'
```

Disabled schedules return 423. Wrong secret returns 401.

## Manual schedules

Click "Run now" on a manual schedule. Direct dispatch.

## Hybrid dispatch

- Subscription Claude agents > Anthropic Routines (happens on Claude's infra)
- Other agents > local node-cron on your VPS

Both write runs to the same table.

## Routine count badge

The Routines tab in the business header shows the count of enabled schedules as a badge.

## Editing a schedule

Right-click on a schedule row in the SchedulesPanel. Edit dialog opens with all fields.

## Pausing a schedule

Toggle the "Enabled" switch. Disabled schedules skip triggers without failing.

## Retry sweep

A background cron ticks every X minutes and restarts failed runs with exponential backoff. Endpoint: `/api/runs/retry-sweep`.
