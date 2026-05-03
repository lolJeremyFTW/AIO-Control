# Brief — topic dashboards + runtime agents + custom keys

**Task ID:** 20260503-1954-topic-dashboards-runtime-agents-custom-keys
**Mode:** IMPROVE (overruled van auto-detect "build" — bestaande monorepo, 3 features toevoegen)
**Datum:** 2026-05-03
**Repo:** C:\Users\jerem\Desktop\jaapproject\aio-control

## User's verzoek (verbatim)

1. **Per-topic dashboards + routines** — "It should have a new dashboard and new routines and everything per topic, and the business dashboard and routines should be the top layer that shows all of them and their relevant information (i probably need the dashboard to be created with ai per business module but make them with our template so it stays without our design. And i have a lot of existing modules that i want to import or recreate within im not sure)"

2. **Persistent runtime agents in OpenClaw + Hermes** — "In openclaw and hermes-agent i should have a new persistent runtime agent creation in the onboarding i think the most efficient and easy way for other users would be to give them a prompt to create the persistent runtime agent within openclaw and hermes agent and it should be super easy to connect them"

3. **Custom API keys** — "API Keys moet ook een custom key in gezet kunnen worden die de agent of dashboard of module weer kan lezen"

## Mijn samenvatting + interpretatie

| # | Wat | Hoe ik het lees |
|---|---|---|
| 1 | Per-topic dashboards | Elke nav_node (topic, subtopic, module) krijgt zijn eigen dashboard + routines-view. Business-page wordt een roll-up van alle topics eronder. AI mag per business/module een dashboard genereren met onze design-tokens als template. User heeft bestaande externe modules (lead-mgmt, YT content, YT intel) die ge-import of ge-recreeerd moeten worden. |
| 2 | Persistent runtime agents | Onboarding van Hermes/OpenClaw is nu "installeer CLI". User wil dat onboarding óók een persistent agent CREATES binnen Hermes/OpenClaw — bv. een prompt-template die je copy-paste in Hermes om een long-lived agent te initialiseren. Doel: zero-friction connect. |
| 3 | Custom API keys | ApiKeysPanel heeft nu een hardcoded provider-lijst (anthropic, minimax, openrouter, etc.). User wil arbitrary key-namen ("AIRTABLE_API_KEY", "MIJN_INTERNAL_TOKEN", etc.) kunnen toevoegen, en die vanuit een agent's tool / een module / een dashboard kunnen lezen. |

## Open vragen voor de user (kom ik later op terug via AskUserQuestion)

- **#1**: "AI per business module" — bedoel je dat we een dashboard-config (jsonb met widgets/queries) AI-laten-genereren per nav_node, en dat onze front-end die config rendert met onze tile/card components? Of bedoel je iets anders?
- **#1**: "existing modules importeren" — gaat 't om de bestaande Next.js apps (lead-mgmt, YT content, YT intel) als multi-zones, of om hun **datamodel** dat we recreëren binnen aio-control?
- **#2**: "prompt to create persistent runtime agent" — moet AIO Control de prompt genereren + de user knoppe om 'm naar Hermes/OpenClaw te sturen? Of moet AIO Control via subprocess/SSH zelf de install-stap automatisch doen?
- **#3**: Scope van custom keys — workspace-only? Of ook per-business / per-topic? Hoe gateway-en we welke agent welke key mag lezen (allowlist per agent? open-by-default voor agents in dezelfde scope?)

## Mode-keuze

**IMPROVE** — bestaande monorepo, 3 onafhankelijke features toevoegen. Niet BUILD (geen lege repo) en niet AUDIT (geen review-vraag).

## Scope-grens

In scope:
- DB-schema uitbreiden waar nodig (migraties)
- Nieuwe routes / panels / components
- Server-actions voor save/read flows
- i18n keys (NL/EN/DE) voor nieuwe copy
- Onboarding-prompts genereren voor Hermes/OpenClaw
- Read-API voor custom keys (server-side, met permission check)

Niet in scope:
- Bestaande zone-apps daadwerkelijk hergebouwen (volgt uit #1 nadat we 't datamodel hebben)
- Stripe / billing wiring (apart traject)
- Mobile UI tweaks

## Volgende stap

Phase 1: Explore-agents in parallel om de relevante surfaces in kaart te brengen vóór we plannen.
