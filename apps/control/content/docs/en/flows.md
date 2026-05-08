---
title: AI Flow Builder
description: Describe an automation, AI generates an executable plan.
---

URL: `/[ws]/flows`

Describe an automation or a whole business. An AI generates an executable plan with:

- Agents (kind, provider, model, system prompt)
- Schedules (cron, manual, webhook)
- Skills (which per agent)
- MCP servers (which per agent)
- Integrations (custom webhooks)

## Example input

```
I want to scrape Etsy listings daily for competitors in the
'soy candle' niche, compare prices with my store, and if I'm
cheaper than 80% of the top-10, raise my prices by 5%.
Reports to my Telegram.
```

## Output preview

AIO shows:

- 3 agents (scraper, comparator, price-updater)
- 2 schedules (daily 06:00 plus daily 06:30)
- 1 skill (Etsy listing parser)
- 1 integration (Telegram report)
- 1 custom integration (Etsy API call)

You review each entry, edit where needed, and click "Create everything". Resources are created in a single transaction.

## Targeting

First choose:

- **In which business** -- new or existing
- **Under which topics** -- new or existing

API endpoint: `/api/flows/generate`.
