---
title: Eerste login en setup
description: Account, login, onboarding wizard, eerste business.
---

Deze pagina loopt het hele eerste-keer-traject af. Van signup tot uw eerste business met een werkende agent.

## Account aanmaken

1. Ga naar `/signup`. Vul email en wachtwoord in. Geen creditcard nodig.
2. U krijgt een bevestigingsmail. Klik de link.
3. Na bevestiging staat uw eerste workspace klaar.

## Inloggen

`/login` ondersteunt:

- Email + wachtwoord
- OAuth-providers (alleen zichtbaar als de gateway een provider biedt, gevraagd via `/api/auth/oauth-config`)
- Wachtwoord vergeten via reset-link

Inlog-events worden opgeslagen per 12u-window. U vindt uw login-history op de [profile-pagina](first-login).

## De onboarding wizard

Op het workspace dashboard verschijnt automatisch een 3-stappen wizard. Hij blijft zolang één van de drie gates niet klopt.

| Stap | Check | Waar vult u het in |
|------|-------|--------------------|
| 1. Maak een business | `businesses.length > 0` | Knop opent NewBusinessDialog |
| 2. Voeg een API key toe | `api_keys` count > 0 | Settings > API Keys |
| 3. Maak een agent | `agents.length > 0` | Vanuit business > Agents tab |

Zodra alle drie kloppen verdwijnt de wizard. Geen klik op een "klaar"-knop nodig.

## Uw eerste business

De `BusinessSetupWizard` heeft 7 stappen:

1. **Identity** -- naam plus appearance (variant + icon + logo)
2. **Intent** -- description, mission, eerste targets (KPI's of doelen)
3. **Topics** -- seed nav-nodes zoals "Content / Marketing / Sales"
4. **Main agent** -- naam, provider, model, key source
5. **Telegram** -- kies bestaande target of sla over
6. **Isolation** -- standalone of inherits-from-workspace
7. **Confirm** -- summary en create

Alles tot stap 7 is lokale state. Pas bij confirm wordt er iets in de database geschreven. U kunt vrij door de stappen klikken zonder iets te breken.

### Topic-presets die de wizard voorstelt

- Content / Marketing / Sales / Analytics
- Video / Thumbnails / Scripts / Publishing
- Listings / Customer service / Fulfillment
- Agents / Schedules / Integrations

## Daarna

Eenmaal de wizard door bent u op het [business dashboard](businesses). De rest van de docs loopt af welke acties u daar kunt nemen.
