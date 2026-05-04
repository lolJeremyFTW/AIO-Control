# Brief — TrompTechDesigns Notification Audit

**Datum**: 2026-05-04
**Mode**: AUDIT
**Workspace**: `.ultraflow/20260504-1749-tromptech-notifications/`

## User's verzoek (1-3 zinnen)

"please check why i still have 28 notifications on tromptechdesigns, i have checked everything, fix it. its running on our vps and we need to push to vps and github after every big change"

## Context

- **Trigger phrase die ultraflow afvuurde**: "check why", "fix it" → AUDIT
- **TrompTechDesigns VPS**: 87.106.146.35 (Tailscale: vps)
- **Stack**: waarschijnlijk Supabase + Next.js/React (based on this codebase)
- User heeft zelf al geprobeerd te fixen → notification bug zit diep of op onverwachte plek

## Doel in één zin

Root cause vinden van 28 persistente notifications op TrompTechDesigns en fix implementeren.

## Bekende constraints

- TrompTechDesigns draait op VPS (niet localhost)
- Na elke grote change moet zowel naar VPS als GitHub gepusht worden
- User heeft al "alles gechecked" → niet de voor de hand liggende plekken

## Open vragen voor phase 1 plan

1. Waar komen notifications vandaan? (Supabase Realtime? DB polling? Zelf-gebouwde notif widget?)
2. Wat voor type notifications zijn het? (unread counts, toast messages, database records?)
3. Zijn ze zichtbaar in de UI of alleen in de backend/data layer?
4. Is het TrompTechDesigns specifiek of een generiek probleem in aio-control?

## Niet-doelen

- De VPS push-workflow refactoren (tenzij direct gerelateerd aan notifications)
- Nieuwe features bouwen
- Security audit van de hele app
