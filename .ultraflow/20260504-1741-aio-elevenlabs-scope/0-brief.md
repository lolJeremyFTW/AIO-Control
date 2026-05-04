# Brief — aio-elevenlabs-scope

**Datum**: 2026-05-04
**Mode**: AUDIT (phase 1-7) + IMPROVE (fix ElevenLabs)
**Workspace**: `.ultraflow/20260504-1741-aio-elevenlabs-scope/`

## User's verzoek

"Do a full scope before changing anything, fix speaking to agents module. ive added api key for elevenlabs but does not seem to do or log anything"

## Context

- App draait op VPS (87.106.146.35) — aio.tromptech.life
- **Supabase draait lokaal op de VPS** (self-hosted, niet cloud) — DB connectie via lokaal netwerk
- User werkt met CLAUDE aan deze app
- ElevenLabs API key toegevoegd maar: geen effect, geen logging
- "Speaking to agents" module werkt niet / is niet aangesloten

## Doel in één zin

Full scope van de aio app (structuur, architectuur, voice module, ElevenLabs integratie), daarna ElevenLabs fix zodat voice werkt + logging.

## Bekende constraints

- Geen wijzigingen voordat full scope klaar is
- VPS toegang via Tailscale (87.106.146.35)
- App edits verlopen via claude (codex/claude)

## Open vragen voor phase 1 plan

1. Waar zit de "speaking to agents" / voice module in de codebase?
2. Hoe is ElevenLabs geconfigureerd en aangesloten?
3. Wat is de deployment structuur op de VPS?
