---
title: Skills
description: Reusable procedural knowledge for agents.
---

URL: `/[ws]/skills`

Skills are reusable procedural knowledge. Pattern taken from OpenClaw's `SKILL.md`.

## Anatomy of a skill

```yaml
name: "Outreach copywriter"
description: "When you need to write an outreach email to a prospect."
body: |
  ## Step plan
  1. First read the prospect's homepage.
  2. Find one concrete pain point that AIO Control solves.
  3. ...
```

## Assign per agent

In the agent edit dialog you choose which skills it can load. Only selected skills end up in its system prompt.

## Creating a skill

Click "New skill". Fill in name plus description plus body. Body is markdown. AIO supports code blocks, lists, tables.

## Generating a skill via AI

On the skills page there is also an "AI generate" button. You describe the skill in one sentence, an agent makes the body for you. Endpoint: `/api/skills/generate`.

## Archiving a skill

Edit > Archive. Hides without deleting data. Agents that reference it get a warning.

## Admin skills

`/admin/skills` for super-admin. Share skills on the marketplace. Preview rendering.

## Skills versus long system prompts

Split long procedural knowledge into skills. Per agent you choose which skills can load. Makes prompts more compact and pseudo-modular.
