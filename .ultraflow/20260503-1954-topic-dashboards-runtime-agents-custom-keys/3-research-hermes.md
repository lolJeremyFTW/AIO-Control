# Research: Hermes-Agent CLI — Persistent Runtime Agent Creation

**Onderzoeksdatum:** 2026-05-03  
**Status:** Voldoende informatie verzameld om AIO Control integratie in te richten

---

## Vraag 1: Welk CLI-commando registreert een named persistent agent in Hermes?

**Antwoord:**

Het commando is **`hermes profile create <name>`**, gevolgd door configuratie via `<name> setup`.

```bash
hermes profile create coder
coder setup
coder chat
```

Dit maakt automatisch een named agent "coder" aan met een eigen wrapper-script. Elk profiel krijgt:
- Eigen `~/.hermes/profiles/<name>/` directory
- Geïsoleerde `config.yaml`, `.env`, `SOUL.md`
- Aparte sessionhistorie en state database
- Commands zoals `coder chat`, `coder setup`, `coder gateway start`

Hermes-documenten stellen: *"Create a profile called coder and you immediately have coder chat, coder setup, coder gateway start, etc."*

**Bron:** [Profiles: Running Multiple Agents - Hermes Agent Docs](https://hermes-agent.nousresearch.com/docs/user-guide/profiles) (fetched 2026-05-03)  
**GitHub:** [hermes-agent/website/docs/user-guide/profiles.md](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/profiles.md)

---

## Vraag 2: Welke bestanden en directory-structuur ontstaan voor een persistent agent?

**Antwoord:**

Elk profiel in Hermes krijgt een own home directory: `~/.hermes/profiles/<profilenaam>/`

**Bestanden in het profiel:**
- `config.yaml` — agent-instellingen, model, terminal, gateway
- `.env` — API-sleutels, bot-tokens, credentials
- `SOUL.md` — persoonlijkheid, system prompt, gedrag
- `state.db` — SQLite database met sessie-metadata en FTS5 volledige tekst
- `sessions/` — JSONL transcripts van alle gesprekken
- `memories/` — opgeslagen kennisbestanden
- `skills/` — custom tools en acties
- `cron/` — geplande taken
- `gateway.pid` — gateway-procesnummer

Alle paden worden opgelost via `HERMES_HOME=~/.hermes/profiles/<name>` waardoor elk profiel volledig geïsoleerd is.

**Bron:** [Profiles: Running Multiple Agents - Hermes Agent Docs](https://hermes-agent.nousresearch.com/docs/user-guide/profiles) (fetched 2026-05-03)  
**Referentie:** *"Hermes state automatically scopes to the profile's directory — config, sessions, memory, skills, state database, gateway PID, logs, and cron jobs."*

---

## Vraag 3: Wat zijn de config.yaml opties voor persistent runtime agents?

**Antwoord:**

De `~/.hermes/profiles/<name>/config.yaml` bevat agent-gedrag en runtime-instellingen:

```yaml
agent:
  max_turns: 60                    # Max tool-calling iterations
  verbose: true                    # Logging inschakelen
  reasoning_effort: "high"         # Denkniveau (xhigh/high/medium/low/minimal/none)
  gateway_timeout: 3600            # Inactiviteitstijd in seconden
  personalities: ["helpful"]       # Voorgedefinieerde persoonlijkheid

memory:
  memory_enabled: true             # Agent's notities activeren
  user_profile_enabled: true       # Gebruikersprofiel opslaan
  memory_char_limit: 800           # Tokens per notitieboek
  user_char_limit: 500             # Tokens per gebruikersprofiel
  nudge_interval: 10               # Herinnering elke N beurten

session_reset:
  mode: "idle"                     # "both", "idle", "daily", of "none"
  idle_minutes: 1440               # Inactiviteit voor reset
  at_hour: 4                       # Dagelijks reset-uur (0-23)
  compression: true                # Automatische contextcompressie
  streaming: true                  # Token streaming naar platforms
```

Sessions met actieve background-processen worden nooit auto-reset: *"Sessions with active background processes are never auto-reset"* — dit ondersteunt langlopende taken.

**Bron:** [CLI Config Example](https://github.com/NousResearch/hermes-agent/blob/main/cli-config.yaml.example) (fetched 2026-05-03)  
**Documentatie:** [Configuration - Hermes Agent](https://hermes-agent.nousresearch.com/docs/user-guide/configuration)

---

## Vraag 4: Bestaat er een mechanisme om een session als persistent runtime agent te registreren?

**Antwoord:**

**Geen direct mechanisme voor session-registratie als persistent agent.**

Hermes slaat alle sessies automatisch op (`~/.hermes/state.db` en `~/.hermes/sessions/`), maar er is geen commando om een bestaande session om te zetten in een named persistent agent. De workflow is:

1. **Profile aanmaken:** `hermes profile create <name>` → instelt een **nieuw** isolated agent met lege state
2. **Sessies herladen:** `hermes --continue` → hervat eerdere gesprekken, maar creëert geen apart profiel
3. **Background-processen:** Agents kunnen background-taken uitvoeren (`sessions... are never auto-reset`) maar dit is geen registratiemechanisme

Voor langlopende agents past u beter **profile-creatie** toe, niet session-registratie.

**Documentatie:** [Sessions - Hermes Agent](https://hermes-agent.nousresearch.com/docs/user-guide/sessions) (fetched 2026-05-03)  
**GitHub:** [Session Storage - developer guide](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/developer-guide/session-storage.md)

---

## Vraag 5: Hoe ziet de YAML/JSON agent-definitie eruit?

**Antwoord:**

Agent-definities zijn **YAML, niet JSON**. De opmaak is `~/.hermes/profiles/<name>/config.yaml`:

```yaml
# Agent-gedrag
agent:
  name: "ProductionCoder"
  description: "Dedicated agent for code refactoring tasks"
  max_turns: 60
  reasoning_effort: "high"

# Model-keuze
model:
  provider: "openrouter"  # OR: openai, anthropic, nousportal, etc.
  name: "meta-llama/llama-3.3-70b-instruct"
  temperature: 0.7
  max_tokens: 8000

# Persoonlijkheid en system prompt
personality:
  system_prompt: |
    You are a senior code architect...
  style: "technical"
  tone: "professional"

# Gateway (voor Telegram/Discord/etc.)
gateway:
  enabled: true
  platforms:
    telegram: true
    discord: false
  allowed_users:
    - "user123"
    - "user456"

# Persistent memory
memory:
  memory_enabled: true
  user_profile_enabled: true
  nudge_interval: 10

# Session beheer
session_reset:
  mode: "idle"
  idle_minutes: 1440
```

Dit is een **YAML single-file agent-definitie** — geen separate JSON of registratie-bestand nodig.

**Bron:** [cli-config.yaml.example](https://github.com/NousResearch/hermes-agent/blob/main/cli-config.yaml.example) (fetched 2026-05-03)

---

## Vraag 6: Hoe integreert dit met AIO Control's huidige `hermes chat --json` aanpak?

**Antwoord:**

**Huidge aanpak (per-turn):**
```bash
hermes chat --json --session <id> --message "<prompt>"
```
→ Spawnt transient hermes-proces per beurt.

**Nieuwe aanpak met persistent agents:**

```bash
# Eenmalige setup (onboarding)
hermes profile create "aio-agent"
aio-agent setup  # Interactieve wizard voor API-sleutels, model, etc.

# Per-turn daarna (reuses persistent state)
aio-agent chat --json --session <id> --message "<prompt>"
```

**Voordelen:**
1. Agent behoudt `~/.hermes/profiles/aio-agent/state.db` — geen context-verlies
2. Skills die agent leert persisten automatisch
3. Memories en SOUL opgebouwd over sessies
4. Memory-nudges stimuleren agent om inzichten op te slaan

**Integratie-stappen:**
1. Onboarding-prompt laat user `hermes profile create` uitvoeren
2. Bewaar `aio-agent` als reference in AIO Control database
3. Vervang `hermes chat` calls door `{profile-name} chat` calls
4. Voeg `--json` flag toe voor structured output

**Opmerking:** Hermes documentation beperkt zich tot CLI usage — geen API-wrapper gevonden. Directe shell-spawning is de standaard integratiewijze.

**Bronnen:**  
- [Profiles docs](https://hermes-agent.nousresearch.com/docs/user-guide/profiles)
- [CLI Commands Reference](https://hermes-agent.nousresearch.com/docs/reference/cli-commands)

---

## Samenvatting

| Vraag | Antwoord |
|-------|----------|
| **CLI-commando voor persistent agent** | `hermes profile create <name>` → genereert named agent met eigen config |
| **Directory-structuur** | `~/.hermes/profiles/<name>/` met config.yaml, .env, state.db, sessions, skills |
| **Config-opties** | YAML: agent.max_turns, memory_enabled, session_reset.mode, reasoning_effort, etc. |
| **Session-registratie** | Niet mogelijk. Sessions zijn auto-persistent, maar niet als aparte named agents registreerbaar. |
| **Agent-definitie-formaat** | YAML (config.yaml), niet JSON. Geen separate agents.json bestand. |
| **AIO Control integratie** | Profile-setup in onboarding; daarna `{profile-name} chat --json --message` per turn |

---

## Aanbevelingen voor AIO Control

1. **Onboarding-flow:** Guided setup via `hermes profile create` + `{profile} setup` interactief
2. **Profile-naamgeving:** `aio-{workspace-id}` of `aio-control-{user-id}`
3. **Config-sjabloon:** Pre-vul `~/.hermes/profiles/{name}/config.yaml` met AIO defaults (reasoning_effort, max_turns, personality)
4. **Persistent state:** Verwijder niet `~/.hermes/profiles/{name}/state.db` tussen sessies
5. **Memory-nudging:** Laat agent elke 10-15 beurten herinneringen opslaan via `nudge_interval: 10`

---

**Onderzoekspagina:** Hermes-agent v0.11+ (mei 2026)  
**Rechercheur:** Claude Code Agent  
**Feedback:** Geen gaps gevonden in Hermes-documentatie. Alle informatie actueel.
