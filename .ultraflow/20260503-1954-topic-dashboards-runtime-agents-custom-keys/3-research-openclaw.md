# OpenClaw CLI Research: Persistent Runtime Agent Creation

## Vraag 1: Bestaat er een "registered agent" concept in OpenClaw die je eenmalig opstart en daarna refereert?

**Ja.** OpenClaw heeft een **multi-agent architecture** met `openclaw agents add <name>` waarmee je agents registreert in een registry. Deze agents zijn persistent en kunnen via naam worden gerefereerd in plaats van opnieuw te worden opgezet per turn.

Bron: [Meta Intelligence — OpenClaw Agents Commands Guide](https://www.meta-intelligence.tech/en/insight-openclaw-agents-guide) (2026-05-03)

## Vraag 2: Wat is de exacte CLI-syntax voor `openclaw agents add`?

```bash
openclaw agents add <agent-name> [options]
```

Beschikbare opties:
- `--workspace <path>` — specifieke werkruimte voor deze agent
- `--model <model-id>` — LLM-model voor deze agent (overschrijft default)
- `--identity <file>` — laden van IDENTITY.md voor agent-instellingen (naam, emoji, avatar)
- `--tools <list>` — tooling exposure
- `--template <name>` — template-aanduiding
- `--non-interactive` — skip wizard, volledig non-interactive

Voorbeeld: `openclaw agents add content-writer --workspace ./agents/content-writer --non-interactive`

Agent-registratie duurt onder de 30 seconden. Agents erven automatisch instellingen van globale defaults wanneer niet expliciet geconfigureerd.

Bron: [Meta Intelligence — OpenClaw Agents Commands Guide](https://www.meta-intelligence.tech/en/insight-openclaw-agents-guide) + [CrewClaw — OpenClaw CLI Commands Reference](https://www.crewclaw.com/blog/openclaw-cli-commands-reference) (2026-05-03)

## Vraag 3: Waar wordt agent-configuratie opgeslagen?

**Twee-laags architectuur:**
1. **Globale config:** `~/.config/openclaw/` (user-level defaults)
2. **Project-level config:** `openclaw.json` in de projectroot

Het systeem gebruikt een "nearest-first" override-mechanisme: project-level instellingen superseden globale defaults.

Per-agent configuratie kan ook in `~/.openclaw/agents/<agentId>/` worden opgeslagen, inclusief per-agent sessions onder `~/.openclaw/agents/<agentId>/sessions/`.

Bron: [Meta Intelligence — OpenClaw Agents Commands Guide](https://www.meta-intelligence.tech/en/insight-openclaw-agents-guide) + [OpenClaw Config Agents Documentation](https://docs.openclaw.ai/gateway/config-agents) (2026-05-03)

## Vraag 4: Bestaat er een `openclaw agent create` of `openclaw init` voor agent-setup?

**Nee.** `openclaw agent create` bestaat niet. De commands zijn:

- **`openclaw init`** — scaffolds een nieuw OpenClaw-project (global setup, workspace, templates). Dit is stap 1.
  Syntax: `openclaw init` (interactieve wizard) of `npx openclaw init`

- **`openclaw agents add <name>`** — registreert een *nieuwe* agent in de registry.
  Dit is de command voor agent-registratie.

- **`openclaw onboard`** — aanbevolen: all-in-one wizard die gateway, workspace, credentials, channels, en skills in één keer instelt.

`openclaw init` is NOT voor agent-creatie; het is voor project-scaffolding. Gebruik `openclaw agents add` voor agent-registratie.

Bron: [Meta Intelligence — OpenClaw Agents Commands Guide](https://www.meta-intelligence.tech/en/insight-openclaw-agents-guide) + [explain-openclaw — CLI Commands](https://github.com/centminmod/explain-openclaw) (2026-05-03)

## Vraag 5: Exists there a daemon or background service for persistent agent runtime?

**Ja.** OpenClaw ondersteunt een daemon/gateway service met beide legacy en moderne commando's:

**Legacy (daemon):**
```bash
openclaw daemon status
openclaw daemon install [--port <port>] [--runtime <node|bun>] [--token <token>]
openclaw daemon start
openclaw daemon stop
openclaw daemon restart
openclaw daemon uninstall
```

**Modern (gateway, aanbevolen):**
```bash
openclaw gateway run         # foreground
openclaw gateway start       # background service
openclaw gateway stop
openclaw gateway restart
openclaw gateway status
openclaw gateway --install-daemon
```

Key option: `--force` om bestaande installatie te overschrijven.

De daemon/gateway fungeert als **control plane** voor alle agents; agents persisten via deze service.

Bron: [OpenClaw Daemon Documentation](https://docs.openclaw.ai/cli/daemon) + [Meta Intelligence — OpenClaw Gateway](https://www.meta-intelligence.tech/en/insight-openclaw-gateway) (2026-05-03)

## Vraag 6: Hoe beheert AIO Control een "registered agent" na onboarding?

**Workflow:**
1. Onboarding-stap: gebruiker voert `openclaw agents add my-agent --workspace <path> --non-interactive` uit
   → Agent wordt in registry opgeslagen (config: `~/.config/openclaw/` + `openclaw.json`)

2. Gateway daemon blijft lopen (via `openclaw gateway install/start`)

3. AIO Control kan daarna agents referen via **agent-ID** in plaats van spawning:
   ```bash
   openclaw agent <agent-name> --json --session-id <id> -m "<prompt>"
   ```
   → Agent wordt opgehaald uit registry + sessions persisten onder `~/.openclaw/agents/<agent-id>/sessions/`

4. **Alternatief voor per-turn sessions:** gebruik de **gateway API** (WebSocket) voor persistent session-context in plaats van CLI-spawning per turn.

Dit elimineert de noodzaak voor `--local --json --session-id` per turn; de session persists in de daemon.

Bron: [OpenClaw Sessions Documentation](https://docs.openclaw.ai/concepts/session) + [OpenClaw CLI Reference](https://github.com/centminmod/explain-openclaw) (2026-05-03)

## Vraag 7: Kan een "named profile" of config-file een agent zó configureren dat AIO Control minder state hoeft te beheren?

**Ja, deels.** OpenClaw biedt:

1. **Global defaults** via `openclaw config set agents.defaults.model.primary <model-id>`
2. **Per-agent overrides** in `openclaw.json` of agent-workspace
3. **Per-agent model routing:** individuele agents kunnen hun eigen model hebben

Echter: **session state** (conversatiecontext) persists nog steeds op de gateway, niet in een config-file. AIO Control moet dus nog steeds session-IDs trackeren voor context-continuïteit.

**Beter alternatief:** Gebruik de **Gateway WebSocket API** in plaats van CLI-spawning. Dit handelt persistence automatisch af.

Bron: [OpenClaw Agent Configuration](https://docs.openclaw.ai/gateway/config-agents) (2026-05-03)

---

## Samenvatting

| Aspect | Bevinding |
|--------|-----------|
| **Named agent registry** | ✓ Ja, via `openclaw agents add <name>` |
| **Persistent storage** | ✓ `~/.config/openclaw/` + `openclaw.json` + per-agent sessions |
| **Daemon support** | ✓ `openclaw gateway start/install` |
| **Config-based initialization** | ✓ `--workspace`, `--model`, `--identity` opties |
| **One-time setup** | ✓ `openclaw init` + `openclaw agents add` + `openclaw gateway install` |
| **Avoid per-turn spawning** | ✓ Referen via agent-ID na eenmalige registratie; daemon houd sessions |

**Voor AIO Control:** onboarding = `openclaw init` → `openclaw agents add my-agent` → `openclaw gateway install`. Daarna geen spawning meer nodig; simpelweg agent-ID gebruiken.
