---
title: Marketplace
description: Install curated agent presets or share your own agent.
---

URL: `/[ws]/marketplace`

## Public agents

Curated list of agent presets you can install in a business with one click. Each entry has:

- Name plus description
- Provider plus model
- System prompt
- Tool allowlist
- Skills
- Author

Pick a business to install. AIO copies the agent with a new ID. No credentials carry over.

## Sharing your own agent

On an agent there is a "Share" button. AIO creates a public listing at `/share/[slug]`. Others can view (without your API key) and install in their workspace.

Settings: make listing public or private. Edit description. Track installs.

## Marketplace kinds

Filtered by kind: chat / worker / generator / reviewer / router. Plus category tags like "outreach", "youtube", "etsy".

## Admin marketplace

Super-admin only: `/admin/marketplace`. Review curated submissions plus set featured or non-featured. Preview via `/api/admin/marketplace/preview`.
