---
title: First login and setup
description: Account, login, onboarding wizard, first business.
---

This page walks through the entire first-time path. From signup to your first business with a working agent.

## Create an account

1. Go to `/signup`. Enter email and password. No credit card needed.
2. You get a confirmation email. Click the link.
3. After confirmation your first workspace is ready.

## Logging in

`/login` supports:

- Email + password
- OAuth providers (only visible if the gateway offers a provider, requested via `/api/auth/oauth-config`)
- Forgot password via reset link

Login events are stored per 12h window. You find your login history on the [profile page](first-login).

## The onboarding wizard

A 3-step wizard automatically appears on the workspace dashboard. It stays as long as one of the three gates is not satisfied.

| Step | Check | Where you fill it in |
|------|-------|--------------------|
| 1. Create a business | `businesses.length > 0` | Button opens NewBusinessDialog |
| 2. Add an API key | `api_keys` count > 0 | Settings > API Keys |
| 3. Create an agent | `agents.length > 0` | From business > Agents tab |

Once all three are satisfied the wizard disappears. No need to click a "done" button.

## Your first business

The `BusinessSetupWizard` has 7 steps:

1. **Identity** -- name plus appearance (variant + icon + logo)
2. **Intent** -- description, mission, first targets (KPIs or goals)
3. **Topics** -- seed nav nodes like "Content / Marketing / Sales"
4. **Main agent** -- name, provider, model, key source
5. **Telegram** -- pick existing target or skip
6. **Isolation** -- standalone or inherits-from-workspace
7. **Confirm** -- summary and create

Everything up to step 7 is local state. Only at confirm is anything written to the database. You can click through the steps freely without breaking anything.

### Topic presets the wizard suggests

- Content / Marketing / Sales / Analytics
- Video / Thumbnails / Scripts / Publishing
- Listings / Customer service / Fulfillment
- Agents / Schedules / Integrations

## After that

Once through the wizard you land on the [business dashboard](businesses). The rest of the docs walk through the actions you can take there.
