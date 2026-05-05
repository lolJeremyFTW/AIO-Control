// Minimal hand-rolled i18n. We have three locales (NL primary, EN, DE) and
// the UI strings fit in a flat dict — heavy lifting like message
// pluralisation can come later if we ever ship a use-case that needs it.
//
// Usage:
//   const t = await getDict();              // server component
//   const t = useDict();                    // client component
//   t("dashboard.empty.title")
//
// Falls back to NL (the source language) when a key is missing in the
// active locale.

export type Locale = "nl" | "en" | "de";
export const LOCALES: Locale[] = ["nl", "en", "de"];
export const DEFAULT_LOCALE: Locale = "nl";

export const LOCALE_LABEL: Record<Locale, string> = {
  nl: "NL",
  en: "EN",
  de: "DE",
};

type Dict = Record<string, string>;

// Source of truth: NL. Everything else is a translation map; missing keys
// fall through to NL automatically via the t() lookup.
const nl: Dict = {
  "common.cancel": "Annuleren",
  "common.save": "Opslaan",
  "common.loading": "Laden…",
  "common.busy": "Bezig…",
  "common.delete": "Verwijderen",
  "common.archive": "Archiveren",
  "common.create": "Aanmaken",
  "common.edit": "Bewerken",
  "common.signOut": "Uitloggen",

  "auth.login.title": "Inloggen",
  "auth.login.sub": "Log in op je AIO Control workspace.",
  "auth.signup.title": "Account aanmaken",
  "auth.signup.sub":
    "Maak een account aan; je krijgt automatisch een eigen workspace.",
  "auth.field.username": "Gebruikersnaam of e-mail",
  "auth.field.email": "E-mail",
  "auth.field.name": "Naam",
  "auth.field.password": "Wachtwoord",
  "auth.cta.login": "Log in",
  "auth.cta.signup": "Account aanmaken",
  "auth.no_account": "Nog geen account?",
  "auth.have_account": "Heb je al een account?",
  "auth.cta.register": "Registreer",
  "auth.divider": "of via",
  "auth.oauth.google": "Doorgaan met Google",
  "auth.oauth.github": "Doorgaan met GitHub",

  "nav.profile": "Profiel",
  "nav.settings": "Instellingen",
  "nav.signOut": "Uitloggen",
  "nav.newBusiness": "Nieuwe business",
  "nav.newTopic": "Nieuw topic",
  "nav.newSubtopic": "Nieuw subtopic",
  "nav.allBusinesses": "Alle businesses",
  "nav.workspaceAgents": "Workspace agents",
  "nav.queue": "Wachtrij",
  "nav.runs": "Runs",
  "nav.activity": "Activiteit",
  "nav.cost": "Kosten & spend",
  "nav.marketplace": "Marketplace",
  "nav.marketplaceAdmin": "Marketplace admin",

  "page.dashboard": "Dashboard",
  "page.settings": "Instellingen",
  "page.profile": "Profiel",
  "page.subscription": "Abonnement",
  "page.subscription.sub": "Plan, betaalmethode en facturen voor {workspace}",
  "page.talk": "Talk to AI",
  "page.talk.sub":
    "Provider · stem · log voor de microfoon-knop in de header",
  "page.workspaceAgents": "Workspace agents",
  "page.workspaceAgents.sub":
    "Agenda · revenue · alle agents in deze workspace, gegroepeerd per business.",
  "page.workspaceAgents.empty":
    "Nog geen agents in deze workspace. Maak er één aan via een business of via de \"+ Nieuwe agent\" knop in een lege groep.",
  "page.workspaceAgents.workspaceGroup": "Workspace",
  "page.workspaceAgents.workspaceGroupSub": "Niet aan een business gekoppeld",
  "page.workspaceAgents.businessGroupSub": "Business agents",
  "page.workspaceAgents.countSingular": "agent",
  "page.workspaceAgents.countPlural": "agents",

  "page.queue": "Wachtrij",
  "page.queue.sub": "HITL items over alle businesses — open + opgelost",
  "page.runs": "Runs",
  "page.runs.sub": "Alle runs over alle businesses",
  "page.activity": "Activiteit",
  "page.activity.sub": "Audit log van alle wijzigingen",
  "page.cost": "Kosten & spend",
  "page.cost.sub":
    "Spend per business · per agent · per provider — laatste 30 dagen",
  "page.marketplace": "Marketplace",
  "page.marketplace.sub": "Curated AI agent presets",

  "page.business.overview.sub": "Per-business overzicht",
  "page.business.agents.title": "{business} — agents",
  "page.business.agents.sub": "Providers · prompts · schedules",
  "page.business.schedules.title": "{business} — schedules",
  "page.business.schedules.sub": "Cron · webhooks · run-historie",
  "page.business.integrations.title": "{business} — integraties",
  "page.business.integrations.sub":
    "Externe services die deze business gebruikt",
  "page.business.runs.title": "{business} — runs",
  "page.business.runs.sub": "Volledige run-historie van alle agents",
  "page.business.subnav": "Sub-navigatie",

  "page.business.runs.h1": "{business} — runs",
  "page.business.agents.h1": "{business} — agents",
  "page.business.schedules.h1": "{business} — routines",
  "page.business.integrations.h1": "{business} — integraties",

  "wizard.business.title": "Nieuwe business · stap {current} / {total}",
  "wizard.step.identity": "Identiteit",
  "wizard.step.intent": "Doel",
  "wizard.step.topics": "Topics",
  "wizard.step.mainAgent": "Main agent",
  "wizard.step.telegram": "Telegram",
  "wizard.step.isolation": "Isolatie",
  "wizard.step.confirm": "Bevestig",
  "wizard.cta.next": "Volgende →",
  "wizard.cta.back": "← Terug",
  "wizard.cta.create": "Business aanmaken",

  "agent.dialog.title": "Nieuwe agent",
  "agent.dialog.workspaceGlobal":
    "Workspace-global agent — niet aan een specifieke business gekoppeld. Beschikbaar vanuit de chat en als hop in agent-chains over de hele workspace.",
  "agent.dialog.businessScoped":
    "Een agent verbindt een provider (Claude, MiniMax, …) aan deze business.",
  "agent.field.name": "Naam",
  "agent.field.kind": "Soort",
  "agent.field.provider": "Provider",
  "agent.field.model": "Model",
  "agent.field.modelDefault": "Model (default: {model})",
  "agent.field.endpoint": "Endpoint URL (optioneel — env default als leeg)",
  "agent.field.systemPrompt": "System prompt (optioneel)",
  "agent.field.telegramTarget": "Telegram channel (optioneel)",
  "agent.field.customIntegration": "Custom integration (optioneel)",
  "agent.field.workspaceDefault": "— Workspace default —",
  "agent.field.credentials": "Credentials",
  "agent.kind.chat": "Chat (interactief)",
  "agent.kind.worker": "Worker (scheduled / event-driven)",
  "agent.kind.reviewer": "Reviewer (HITL gate)",
  "agent.kind.generator": "Generator (content)",
  "agent.kind.router": "Router (smart-select)",
  "agent.creds.subscription": "Claude Pro/Max/Team subscription",
  "agent.creds.subscription.desc":
    "Cron-runs draaien als Claude Routines op Claude's eigen infra. Geen API key nodig. Quotum: 5/15/25 routine runs per dag.",
  "agent.creds.apiKey": "Anthropic API key (per token)",
  "agent.creds.apiKey.desc":
    "Cron-runs draaien lokaal via onze scheduler. Vereist een ANTHROPIC_API_KEY in je workspace api-keys. Betaalt per token, geen routine quotum.",
  "agent.creds.env": "Env var fallback",
  "agent.creds.env.desc":
    "Pakt ANTHROPIC_API_KEY uit de process env als fallback. Handig voor solo dev — niet aanbevolen voor multi-tenant.",
  "agent.routing.title": "Smart routing rules (advanced)",
  "agent.routing.desc":
    "Voeg regels toe die op runtime de provider+model kiezen op basis van de input. Eerste matching regel wint. Voorbeeld: korte inputs naar Haiku, lange naar Opus.",
  "agent.cta.create": "Aanmaken",
  "agent.cta.save": "Opslaan",

  "agent.edit.title": "Agent bewerken",
  "agent.edit.sub": "Pas naam, provider, system prompt en reporting targets aan.",
  "agent.field.notifyEmail": "Email (override workspace default)",
  "agent.field.topic": "Topic (optioneel)",
  "agent.field.topic.business": "Geen topic — gehele business",
  "agent.tools.title": "AIO Control tools — wat mag deze agent aanroepen",
  "agent.tools.desc":
    "Read-tools (list_*, get_*) zijn veilig + nooit destructief. Write-tools (create_*, update_*) vereisen je bevestiging in de chat vóór ze daadwerkelijk uitgevoerd worden. Meta-tools (ask_followup, todo_set, open_ui_at) zijn UI-side-effects.",
  "agent.tools.useDefault":
    "Standaard set voor \"{kind}\"-agents gebruiken ({count} tools)",
  "agent.chain.title": "Chain — wat draait er na deze agent?",
  "agent.chain.onDone": "Bij DONE → run agent",
  "agent.chain.onFail": "Bij FAIL → run agent (triage)",
  "agent.chain.noChain": "— Geen chain —",
  "agent.chain.noTriage": "— Geen triage —",
  "agent.chain.note":
    "De volgende agent ontvangt deze run's output als input prompt — perfect voor extract → translate → publish chains.",

  "tg.intro": "Bot-token zet je in Settings → API Keys als provider \"Telegram\". Hier definieer je waar reports heen gaan: chat_id + optioneel topic_id voor forum-style groepen.",
  "tg.topology.title": "Topology — hoe wil je Telegram structureren?",
  "tg.topology.manual": "Manueel",
  "tg.topology.manual.desc":
    "Jij zet voor elke business / topic zelf welke chat_id + topic_id de reports moeten hebben.",
  "tg.topology.perBiz": "Auto-topic per business",
  "tg.topology.perBiz.desc":
    "Eén supergroup met topics. Iedere nieuwe business krijgt zijn eigen forum topic.",
  "tg.topology.perBizAndNode": "Auto-topic per business + per nav-node",
  "tg.topology.perBizAndNode.desc":
    "Zelfde supergroup; nieuwe businesses + nieuwe topics in onze rail krijgen elk een forum topic.",
  "tg.empty": "Geen Telegram-channels nog. Klik \"+ Channel toevoegen\".",
  "tg.add": "+ Channel toevoegen",
  "tg.row.test": "Test",
  "tg.row.delete": "Verwijder",
  "tg.row.on": "aan",
  "tg.row.off": "uit",
  "tg.row.autoTopics": "AUTO-TOPICS",
  "tg.row.autoCreateLabel":
    "Auto-create forum topic per nieuwe business",
  "tg.field.name": "Naam",
  "tg.field.scope": "Scope",
  "tg.field.scope.workspace": "Workspace default",
  "tg.field.scope.business": "Business",
  "tg.field.scope.navnode": "Topic",
  "tg.field.chatId": "Chat ID (start met -100… voor groups)",
  "tg.field.topicId": "Topic ID (optioneel — alleen voor forum-groups)",
  "tg.field.allowlist":
    "Allowlist (komma-gescheiden usernames, optioneel)",
  "tg.field.denylist":
    "Denylist (komma-gescheiden usernames, optioneel)",
  "tg.disclosure.title": "🪄 Auto-create topic per business — setup",
  "tg.disclosure.step1":
    "Maak een Telegram supergroup en zet onder Manage → Topics de optie Topics AAN.",
  "tg.disclosure.step2":
    "Voeg je bot toe als admin met de permissie Manage Topics (en Send Messages, Edit, Delete).",
  "tg.disclosure.step3":
    "Pak de chat_id (start met -100…) via @RawDataBot, voeg hier een nieuwe channel toe scope = Workspace default, laat topic_id leeg.",
  "tg.disclosure.step4":
    "Vink hieronder \"Auto-create forum topic per nieuwe business\" aan op die row.",
  "tg.disclosure.step5":
    "Klaar — vanaf nu krijgt élke nieuwe business automatisch een eigen forum topic met dezelfde naam (+ emoji als je die set). Bestaande businesses krijgen NIET automatisch een topic; maak ze handmatig of dupliceer ze.",

  "keys.intro":
    "Stel API keys in op workspace-niveau (default voor alle agents) of overschrijf per business of per topic. Resolution: topic → business → workspace → env-var fallback.",
  "keys.empty": "Nog geen keys ingesteld. Klik \"+ Key toevoegen\" om te starten.",
  "keys.add": "+ Key toevoegen",
  "keys.row.set": "set",
  "keys.row.empty": "leeg",
  "keys.row.delete": "Verwijder",
  "keys.scope.workspace": "Workspace default",
  "keys.scope.business": "Business · {name}",
  "keys.scope.businessDeleted": "(verwijderd)",
  "keys.scope.topic": "Topic · {name}",
  "keys.scope.businessOverride": "Business override",
  "keys.scope.topicOverride": "Topic override",
  "keys.scope.none": "(geen)",
  "keys.field.provider": "Provider",
  "keys.field.scope": "Scope",
  "keys.field.business": "Business",
  "keys.field.topic": "Topic",
  "keys.field.value": "Key (wordt encrypted opgeslagen)",
  "keys.field.label": "Label (optioneel)",
  "keys.field.customSecret": "+ Custom secret…",
  "keys.field.customName": "Secret naam",
  "keys.field.customName.hint":
    "Alleen UPPERCASE A-Z, 0-9 en _ — bv. AIRTABLE_API_KEY. Wordt door agents/modules opgevraagd via deze naam.",
  "keys.group.providers": "Provider keys",
  "keys.group.custom": "Custom secrets",

  "rail.empty": "Geen businesses nog",
  "rail.emptyTopics": "Nog geen subtopics — maak er een aan ↓",

  "ctx.newBusiness": "Nieuwe business",
  "ctx.open": "Open",
  "ctx.openNewTab": "Open in nieuw tabblad",
  "ctx.newTopic": "Nieuw topic",
  "ctx.newSubtopic": "Nieuw subtopic",
  "ctx.agents": "Agents",
  "ctx.schedules": "Schedules",
  "ctx.settings": "Instellingen…",
  "ctx.duplicate": "Dupliceer",
  "ctx.copyLink": "Kopieer link",
  "ctx.archive": "Archiveer",
  "ctx.moveUp": "↑ Naar boven",
  "ctx.moveDown": "↓ Naar beneden",
  "ctx.moveToRoot": "Verplaats naar root",
  "ctx.moveUnder": "Verplaats onder {name}",
  "ctx.confirmArchiveBiz": "Weet je zeker dat je \"{name}\" wilt archiveren?",
  "ctx.confirmArchiveTopic": "Topic \"{name}\" archiveren?",
  "ctx.newTopicTitle": "Nieuw topic in {parent}",
  "ctx.newSubtopicTitle": "Nieuw subtopic in {parent}",

  "topic.queue": "Wachtrij",
  "topic.agents": "Agents",
  "topic.schedules": "Schedules",
  "topic.integrations": "Integrations",

  "biztabs.overview": "Overzicht",
  "biztabs.agents": "Agents",
  "biztabs.routines": "Routines",
  "biztabs.runs": "Runs",
  "biztabs.integrations": "Integraties",
  "biztabs.topics": "Topics",
  "biztabs.lastRun": "Laatste run",

  "dashboard.title": "{workspace} — overzicht",
  "dashboard.sub": "Marge per business · auto + HITL",
  "dashboard.empty.title": "Maak je eerste business →",
  "dashboard.empty.body":
    "Hier verschijnen straks je automated mini-businesses. Maak er één aan om door te gaan.",
  "dashboard.queueEmpty.title": "Lege wachtrij ✓",
  "dashboard.queueEmpty.body":
    "Geen items te reviewen. Zodra een agent iets oppakt verschijnt het hier — auto-publish bij hoge confidence, anders HITL.",
  "dashboard.queueEmpty.cta": "Nieuwe agent",

  "kpi.margin": "MARGE 30D",
  "kpi.revenue": "REVENUE",
  "kpi.cost": "AI KOSTEN",
  "kpi.runs24h": "{count} runs · 24u",

  "biz.kpi.revenue30d": "REVENUE 30D",
  "biz.kpi.cost30d": "AI KOSTEN 30D",
  "biz.kpi.revenue7d": "REVENUE 7D",
  "biz.kpi.runs24h": "RUNS 24U",
  "biz.kpi.successFail": "SUCCESS / FAIL",
  "biz.openQueue": "Open queue",
  "biz.viewAll": "Bekijk alles",
  "biz.queueEmpty.title": "Wachtrij leeg ✓",
  "biz.queueEmpty.body":
    "Geen items te reviewen. Trigger een run of wacht tot een agent iets oppakt.",
  "biz.agentsCount": "Agents · {count}",
  "biz.manage": "Beheer",
  "biz.noAgents.title": "Geen agents",
  "biz.noAgents.body": "Voeg een agent toe om runs te starten.",
  "biz.recentRuns": "Recente runs",
  "biz.history": "History",
  "biz.noRuns.title": "Nog geen runs",
  "biz.noRuns.body": "Trigger een agent via Run-now of een webhook.",

  "header.searchPlaceholder":
    "Zoek of vraag aan AI: \"hoeveel verdiende YouTube vandaag?\"",
  "header.crumbBackToWorkspace": "Terug naar workspace dashboard",
  "header.crumbBackToBusinesses": "Terug naar alle businesses",

  "search.placeholder":
    "Zoek businesses, agents, queue items, marketplace…",
  "search.scope.all": "Alles",
  "search.scope.business": "Deze business",
  "search.scope.global": "Workspace-global",
  "search.quickActions": "Snelle acties",
  "search.empty": "Geen resultaten in deze scope.",
  "search.searching": "Zoeken…",
  "search.footer.open": "↵ open",
  "search.footer.close": "Esc sluiten",
  "search.footer.shortcut": "Ctrl+K opent overal",
  "search.footer.workspace": "workspace: {slug}",
  "search.tpl.openQueue": "Open wachtrij",
  "search.tpl.openQueue.hint": "HITL items te reviewen",
  "search.tpl.failedRuns": "Mislukte runs (24u)",
  "search.tpl.failedRuns.hint": "Failed status laatst 24u",
  "search.tpl.workspaceAgents": "Workspace agents",
  "search.tpl.workspaceAgents.hint": "Alle agents per business",
  "search.tpl.activity": "Activiteit",
  "search.tpl.activity.hint": "Audit log alle wijzigingen",
  "search.tpl.cost": "Kosten & spend",
  "search.tpl.cost.hint": "Per provider / business / agent",
  "search.tpl.marketplace": "Marketplace",
  "search.tpl.marketplace.hint": "Curated agent presets",
  "search.tpl.profile": "Profile",
  "search.tpl.profile.hint": "Account voorkeuren",
  "search.tpl.settingsTelegram": "Settings · Telegram",
  "search.tpl.settingsTelegram.hint": "Bot targets configureren",
  "search.tpl.settingsApiKeys": "Settings · API keys",
  "search.tpl.settingsApiKeys.hint": "Provider keys + overrides",
  "search.tpl.settingsSpendLimits": "Settings · Spend limits",
  "search.tpl.settingsSpendLimits.hint": "Daag/maand caps",
  "search.tpl.settingsProviders": "Settings · Providers",
  "search.tpl.settingsProviders.hint": "Hermes/OpenClaw/Ollama setup",
  "search.tpl.bizAgents": "Deze business: agents",
  "search.tpl.bizAgents.hint": "Per-business agents lijst",
  "search.tpl.bizRoutines": "Deze business: routines",
  "search.tpl.bizRoutines.hint": "Cron + webhook schedules",
  "search.tpl.bizRuns": "Deze business: runs",
  "search.tpl.bizRuns.hint": "Volledige run-historie",

  "pause.live": "Live · auto",
  "pause.paused": "Gepauzeerd",
  "pause.clickToPause": "→ klik om te pauzeren",
  "pause.clickToStart": "→ klik om te starten",

  "ollama.field.host": "Host",
  "ollama.field.port": "Poort",
  "ollama.host.placeholder": "localhost · 192.168.0.42 · vps.tail-scale.ts.net",
  "ollama.btn.scan": "Scan models",
  "ollama.btn.scanning": "Scannen…",
  "ollama.btn.saving": "Opslaan…",
  "ollama.savedNotice": "✓ Opgeslagen",
  "ollama.endpointLabel": "Endpoint",
  "ollama.lastScan": "laatst gescand {when}",
  "ollama.modelsCount": "{count} models beschikbaar",
  "ollama.empty":
    "Nog geen models gescand. Vul host + poort in en klik \"Scan models\".",
  "rel.now": "net",
  "rel.s": "{n}s geleden",
  "rel.m": "{n}m geleden",
  "rel.h": "{n}u geleden",
  "rel.d": "{n}d geleden",

  "providers.docs": "docs ↗",
  "providers.howInstall": "Hoe installeer ik {name}?",
  "providers.lastTested": "Laatst getest {when}",
  "providers.btn.test": "Test connection",
  "providers.btn.testing": "Testen…",
  "providers.btn.save": "Opslaan",
  "providers.btn.saving": "Opslaan…",
  "providers.status.ready": "Klaar voor gebruik ✓",
  "providers.status.partial.url": "URL ingevuld, nog niet getest",
  "providers.status.partial.cli": "CLI niet getest — klik Test",
  "providers.status.cliReady": "CLI getest ✓",
  "providers.status.httpReady": "HTTP wrapper getest ✓",
  "providers.status.notConfigured": "Niet ingesteld",
  "providers.status.partial.scan": "Endpoint ingevuld, nog geen scan",
  "providers.status.cliDefault": "CLI default — geen URL nodig",

  "providers.ollama.tagline":
    "Lokale LLM. Gratis, snel als je een GPU hebt, geen api-keys.",
  "providers.ollama.modelsAvailable": "{count} models beschikbaar",
  "providers.ollama.gotoSettings": "Naar Ollama-instellingen",
  "providers.ollama.step1":
    "Installeer Ollama op de machine die je modellen draait (laptop, VPS, andere server).",
  "providers.ollama.step2":
    "Start Ollama. Default luistert hij op poort 11434.",
  "providers.ollama.step3":
    "Pull een model — bijvoorbeeld: ollama pull llama3.2",
  "providers.ollama.step4":
    "Vul host + poort in op de Ollama-instellingen page en klik Scan.",

  "providers.hermes.tagline":
    "Self-hosted Hermes runner. AIO Control praat met de hermes CLI via subprocess (default) of een HTTP-wrapper als je die zelf draait.",
  "providers.hermes.step1":
    "Installeer de hermes CLI op deze server: clone github.com/NousResearch/hermes-agent en volg de README (Python entrypoint).",
  "providers.hermes.step2":
    "Zorg dat 'hermes --version' werkt vanaf de shell waarin de Node-server draait. Anders: zet HERMES_BIN in de env naar het absolute pad.",
  "providers.hermes.step3":
    "Klaar — geen URL invullen nodig. AIO Control spawnt de CLI per chat / run.",
  "providers.hermes.step4":
    "Optioneel: draai je een eigen HTTP-wrapper voor Hermes? Plak die URL hieronder en klik Test (verwacht /healthz → 200).",

  "providers.openclaw.tagline":
    "Local agent runtime — eigen tools + custom MCP. Spawned als CLI subprocess (default) of via HTTP-wrapper als je die zelf draait.",
  "providers.openclaw.step1":
    "Installeer OpenClaw — npm i -g @tromptech/openclaw, of clone + npm link.",
  "providers.openclaw.step2":
    "Bevestig dat 'openclaw --version' werkt in de shell waarin Node draait. Anders: zet OPENCLAW_BIN naar het absolute pad.",
  "providers.openclaw.step3":
    "Klaar — AIO Control spawnt de CLI per chat / run.",
  "providers.openclaw.step4":
    "Optioneel: draai je openclaw als HTTP-daemon? Plak de URL hieronder en klik Test (verwacht /healthz).",

  "providers.runtime.title": "Persistent runtime agent",
  "providers.runtime.desc":
    "Maak één named profile/agent in de runtime aan zodat sessies, memory en skills tussen runs blijven leven. AIO Control switcht dan automatisch naar deze named-spawn ipv per-turn ad-hoc.",
  "providers.runtime.nameLabel": "Agent naam",
  "providers.runtime.cmdLabel": "Run dit commando op de runtime-host:",
  "providers.runtime.copy": "Kopieer",
  "providers.runtime.copied": "✓ Gekopieerd",
  "providers.runtime.copyFailed": "Kon niet naar clipboard kopiëren — selecteer + Ctrl+C handmatig.",
  "providers.runtime.verify": "Verify",
  "providers.runtime.savedNotice": "Naam opgeslagen. Run het commando, dan klik Verify.",
  "providers.runtime.verifiedNotice": "✓ Agent \"{name}\" gevonden in runtime — toekomstige chats gebruiken deze profile.",
  "providers.runtime.initializedAgo": "Geïnitialiseerd {when}",
  "providers.status.runtimeReady": "Runtime ready · {name} ✓",

  "topic.kpi.agents": "Agents",
  "topic.kpi.activeRoutines": "Actieve routines",
  "topic.kpi.runs24h": "Runs 24u",
  "topic.kpi.successFail24h": "Success / fail 24u",
  "topic.kpi.cost30d": "Cost 30d",
  "topic.openQueue": "Open queue",
  "topic.queueEmpty": "Geen items te reviewen voor dit topic.",
  "topic.recentRuns": "Recente runs",
  "topic.runsEmpty": "Nog geen runs in de afgelopen 24 uur.",
  "topic.history": "History",
  "topic.routines": "Routines",
  "topic.routines.manage": "Beheer schedules",
  "topic.routines.empty":
    "Nog geen routines voor dit topic. Ga naar Schedules om er één aan te maken en koppel 'm aan dit topic.",
  "topic.routines.on": "AAN",
  "topic.routines.off": "UIT",
  "topic.routines.neverFired": "—",

  "dash.kpi.agents": "Agents",
  "dash.kpi.activeRoutines": "Actieve routines",
  "dash.kpi.runsToday": "Runs vandaag",
  "dash.kpi.cost30d": "Cost 30d",
  "dash.kpi.revenue30d": "Revenue 30d",
  "dash.calendar": "Agenda",
  "dash.today": "Vandaag",
  "dash.day": "Dag",
  "dash.week": "Week",
  "dash.month": "Maand",
  "dash.cell.empty": "geen",
  "dash.unknownAgent": "Onbekende agent",
  "dash.perBusiness.title": "Per business · 30 dagen",
  "dash.perBusiness.desc":
    "AI-cost komt uit de runs-tabel. Revenue volgt zodra Stripe of Mollie hooks per business zijn aangesloten — de plekken zijn al gereserveerd.",
  "dash.perBusiness.empty": "Nog geen businesses in deze workspace.",
  "dash.perBusiness.revenue": "Revenue",
  "dash.perBusiness.aiCost": "AI cost",
  "dash.perBusiness.runsToday": "{count} runs vandaag",

  "settings.title": "Instellingen",
  "settings.sub": "Account · workspace · automations",
  "settings.section.general": "Algemeen",
  "settings.section.general.desc":
    "Workspace-naam, e-mail, tijdzone en uitloggen.",
  "settings.section.providers": "Providers",
  "settings.section.providers.desc":
    "Stap-voor-stap onboarding voor self-hosted providers (Hermes-agent, OpenClaw, Ollama). Geen handmatig prutsen meer.",
  "settings.section.subscription.desc":
    "Plan, betaalmethode, facturen.",
  "settings.section.notifications": "Notificaties",
  "settings.section.team": "Team & rollen",
  "settings.section.integrations": "Integraties",
  "settings.section.integrations.desc": "Verbindingen per business.",
  "settings.section.danger": "Gevarenzone",
  "settings.section.appearance": "Uiterlijk",
  "settings.section.language": "Taal",
  "settings.lang.desc":
    "Kies je interface-taal. Wijzigt direct na het submitten.",
  "settings.section.agentDefaults": "Agent defaults",
  "settings.section.agentDefaults.desc":
    "Wat krijgt élke nieuwe agent als provider / model / system prompt? Per business of agent kun je nog overschrijven.",
  "settings.section.weather": "Weather chip",
  "settings.section.weather.desc":
    "De rechterbovenhoek van de header toont een weer-chip per workspace.",
  "settings.section.ollama": "Lokale Ollama",
  "settings.section.ollama.desc":
    "Vul host + poort van je eigen Ollama-server in. Klik \"Scan models\" om de beschikbare modellen op te halen — die zijn dan overal in de app selecteerbaar (chat-panel, talk-page, agents).",
  "settings.section.apiKeys": "API Keys",
  "settings.section.apiKeys.desc":
    "Workspace-defaults of overrides per business of topic. Encryptie via pgcrypto.",
  "settings.section.spendLimits": "Spend limits",
  "settings.section.spendLimits.desc":
    "Daag/maand caps per workspace; auto-pause als gewenst.",
  "settings.section.telegram": "Telegram",
  "settings.section.telegram.desc":
    "Stuur run-rapporten naar één of meer Telegram-channels.",
  "settings.section.email": "Email notifications",
  "settings.section.email.desc":
    "Run-rapporten via SMTP. Per-business / per-agent overrides via right-click.",
  "settings.section.customIntegrations": "Custom integrations",
  "settings.section.customIntegrations.desc":
    "Algemene HTTP webhooks / API calls. Mustache placeholders voor run-data.",
  "settings.section.notifs.desc":
    "Web Push voor HITL-items op dit apparaat.",
  "settings.section.team.desc":
    "Wie mag wat. Owner is altijd jij; je kunt admins/editors/viewers toevoegen.",
  "settings.section.danger.desc":
    "Data exporteren of de workspace permanent verwijderen.",
  "settings.section.talk": "Talk to AI",
  "settings.section.subscription": "Abonnement",
  "settings.field.workspaceName": "Workspace naam",
  "settings.field.email": "Email",
  "settings.field.timezone": "Tijdzone",

  "danger.export.title": "Data exporteren",
  "danger.export.body":
    "Download een JSON-dump van alles in deze workspace.",
  "danger.export.cta": "Download JSON dump",
  "danger.delete.title": "Workspace verwijderen",
  "danger.delete.body": "Definitief. Cascade-delete van alles erin.",
  "danger.delete.cta": "Verwijder",

  "team.invite.title": "Lid uitnodigen",
  "team.invite.cta": "Uitnodigen",
  "team.members.title": "Huidige leden",

  "agents.title": "{business} — agents",
  "agents.empty.title": "Nog geen agents",
  "agents.empty.body":
    "Een agent koppelt een provider aan deze business. Maak er één aan om te kunnen chatten.",
  "agents.cta.new": "Nieuwe agent",

  "schedules.title": "{business} — schedules",
  "schedules.section.new": "Nieuwe schedule",
  "schedules.section.existing": "Bestaande schedules",
  "schedules.section.runs": "Recente runs",

  "integrations.title": "{business} — integraties",
  "integrations.section.new": "Nieuwe integratie",
  "integrations.section.connected": "Verbonden services",

  "profile.title": "Profiel",
  "profile.sub": "Account · voorkeuren · sessies",
  "profile.section.identity": "Identiteit",
  "profile.section.identity.desc": "Naam en avatar zoals anderen je zien.",
  "profile.section.account": "Account",
  "profile.section.account.desc": "Email + wachtwoord van je login.",
  "profile.section.contact": "Contact + facturatie",
  "profile.section.contact.desc":
    "Adres, telefoon, KvK-nummer en BTW-ID. Wordt gebruikt voor facturen en GDPR-correspondentie. Allemaal optioneel.",
  "profile.section.prefs": "Voorkeuren",
  "profile.section.prefs.desc": "Tijdzone + interface taal.",
  "profile.section.history": "Login-historie",
  "profile.section.history.desc":
    "Recente logins op je account. Zie je iets verdachts? Wijzig je wachtwoord en log overal uit.",
  "profile.section.security": "Sessions / security",
  "profile.section.security.desc":
    "Logt overal uit (alle apparaten + browsers). Handig na een verloren laptop.",
  "profile.history.empty":
    "Nog geen logins gelogd. (Het audit-systeem is net live — volgende login verschijnt hier.)",
  "profile.history.col.when": "Wanneer",
  "profile.history.col.device": "Apparaat",
  "profile.history.col.ip": "IP",
  "profile.history.col.method": "Methode",
  "profile.history.refresh": "Verversen",
  "profile.security.signOutAll": "Overal uitloggen",
  "profile.security.signOutAll.confirm":
    "Logt uit op ALLE apparaten + browsers waar je nu bent ingelogd. Doorgaan?",
};

const en: Partial<Dict> = {
  "common.cancel": "Cancel",
  "common.save": "Save",
  "common.loading": "Loading…",
  "common.busy": "Working…",
  "common.delete": "Delete",
  "common.archive": "Archive",
  "common.create": "Create",
  "common.edit": "Edit",
  "common.signOut": "Sign out",

  "auth.login.title": "Sign in",
  "auth.login.sub": "Sign in to your AIO Control workspace.",
  "auth.signup.title": "Create account",
  "auth.signup.sub":
    "Sign up — you'll automatically get your own workspace.",
  "auth.field.username": "Username or email",
  "auth.field.email": "Email",
  "auth.field.name": "Name",
  "auth.field.password": "Password",
  "auth.cta.login": "Sign in",
  "auth.cta.signup": "Create account",
  "auth.no_account": "No account yet?",
  "auth.have_account": "Already have an account?",
  "auth.cta.register": "Sign up",
  "auth.divider": "or with",
  "auth.oauth.google": "Continue with Google",
  "auth.oauth.github": "Continue with GitHub",

  "rail.empty": "No businesses yet",
  "rail.emptyTopics": "No subtopics yet — create one below ↓",

  "ctx.newBusiness": "New business",
  "ctx.open": "Open",
  "ctx.openNewTab": "Open in new tab",
  "ctx.newTopic": "New topic",
  "ctx.newSubtopic": "New subtopic",
  "ctx.agents": "Agents",
  "ctx.schedules": "Schedules",
  "ctx.settings": "Settings…",
  "ctx.duplicate": "Duplicate",
  "ctx.copyLink": "Copy link",
  "ctx.archive": "Archive",
  "ctx.moveUp": "↑ Move up",
  "ctx.moveDown": "↓ Move down",
  "ctx.moveToRoot": "Move to root",
  "ctx.moveUnder": "Move under {name}",
  "ctx.confirmArchiveBiz": "Are you sure you want to archive \"{name}\"?",
  "ctx.confirmArchiveTopic": "Archive topic \"{name}\"?",
  "ctx.newTopicTitle": "New topic in {parent}",
  "ctx.newSubtopicTitle": "New subtopic in {parent}",

  "topic.queue": "Queue",
  "topic.agents": "Agents",
  "topic.schedules": "Schedules",
  "topic.integrations": "Integrations",

  "biztabs.overview": "Overview",
  "biztabs.agents": "Agents",
  "biztabs.routines": "Routines",
  "biztabs.runs": "Runs",
  "biztabs.integrations": "Integrations",
  "biztabs.topics": "Topics",
  "biztabs.lastRun": "Last run",

  "dashboard.title": "{workspace} — overview",
  "dashboard.sub": "Margin per business · auto + HITL",
  "dashboard.empty.title": "Create your first business →",
  "dashboard.empty.body":
    "Your automated mini-businesses will show up here. Create one to continue.",
  "dashboard.queueEmpty.title": "Empty queue ✓",
  "dashboard.queueEmpty.body":
    "Nothing to review. As soon as an agent picks something up it'll show up here — auto-publish on high confidence, otherwise HITL.",
  "dashboard.queueEmpty.cta": "New agent",

  "kpi.margin": "MARGIN 30D",
  "kpi.revenue": "REVENUE",
  "kpi.cost": "AI COST",
  "kpi.runs24h": "{count} runs · 24h",

  "biz.kpi.revenue30d": "REVENUE 30D",
  "biz.kpi.cost30d": "AI COST 30D",
  "biz.kpi.revenue7d": "REVENUE 7D",
  "biz.kpi.runs24h": "RUNS 24H",
  "biz.kpi.successFail": "SUCCESS / FAIL",
  "biz.openQueue": "Open queue",
  "biz.viewAll": "View all",
  "biz.queueEmpty.title": "Empty queue ✓",
  "biz.queueEmpty.body":
    "Nothing to review. Trigger a run or wait for an agent to pick something up.",
  "biz.agentsCount": "Agents · {count}",
  "biz.manage": "Manage",
  "biz.noAgents.title": "No agents",
  "biz.noAgents.body": "Add an agent to start running.",
  "biz.recentRuns": "Recent runs",
  "biz.history": "History",
  "biz.noRuns.title": "No runs yet",
  "biz.noRuns.body": "Trigger an agent via Run-now or a webhook.",

  "header.searchPlaceholder":
    "Search or ask the AI: \"how much did YouTube earn today?\"",
  "header.crumbBackToWorkspace": "Back to workspace dashboard",
  "header.crumbBackToBusinesses": "Back to all businesses",

  "search.placeholder":
    "Search businesses, agents, queue items, marketplace…",
  "search.scope.all": "All",
  "search.scope.business": "This business",
  "search.scope.global": "Workspace-global",
  "search.quickActions": "Quick actions",
  "search.empty": "No results in this scope.",
  "search.searching": "Searching…",
  "search.footer.open": "↵ open",
  "search.footer.close": "Esc close",
  "search.footer.shortcut": "Ctrl+K opens anywhere",
  "search.footer.workspace": "workspace: {slug}",
  "search.tpl.openQueue": "Open queue",
  "search.tpl.openQueue.hint": "HITL items to review",
  "search.tpl.failedRuns": "Failed runs (24h)",
  "search.tpl.failedRuns.hint": "Failed status last 24h",
  "search.tpl.workspaceAgents": "Workspace agents",
  "search.tpl.workspaceAgents.hint": "All agents per business",
  "search.tpl.activity": "Activity",
  "search.tpl.activity.hint": "Audit log of all changes",
  "search.tpl.cost": "Cost & spend",
  "search.tpl.cost.hint": "Per provider / business / agent",
  "search.tpl.marketplace": "Marketplace",
  "search.tpl.marketplace.hint": "Curated agent presets",
  "search.tpl.profile": "Profile",
  "search.tpl.profile.hint": "Account preferences",
  "search.tpl.settingsTelegram": "Settings · Telegram",
  "search.tpl.settingsTelegram.hint": "Configure bot targets",
  "search.tpl.settingsApiKeys": "Settings · API keys",
  "search.tpl.settingsApiKeys.hint": "Provider keys + overrides",
  "search.tpl.settingsSpendLimits": "Settings · Spend limits",
  "search.tpl.settingsSpendLimits.hint": "Daily/monthly caps",
  "search.tpl.settingsProviders": "Settings · Providers",
  "search.tpl.settingsProviders.hint": "Hermes/OpenClaw/Ollama setup",
  "search.tpl.bizAgents": "This business: agents",
  "search.tpl.bizAgents.hint": "Per-business agent list",
  "search.tpl.bizRoutines": "This business: routines",
  "search.tpl.bizRoutines.hint": "Cron + webhook schedules",
  "search.tpl.bizRuns": "This business: runs",
  "search.tpl.bizRuns.hint": "Full run history",

  "pause.live": "Live · auto",
  "pause.paused": "Paused",
  "pause.clickToPause": "→ click to pause",
  "pause.clickToStart": "→ click to start",

  "ollama.field.host": "Host",
  "ollama.field.port": "Port",
  "ollama.host.placeholder": "localhost · 192.168.0.42 · vps.tail-scale.ts.net",
  "ollama.btn.scan": "Scan models",
  "ollama.btn.scanning": "Scanning…",
  "ollama.btn.saving": "Saving…",
  "ollama.savedNotice": "✓ Saved",
  "ollama.endpointLabel": "Endpoint",
  "ollama.lastScan": "last scanned {when}",
  "ollama.modelsCount": "{count} models available",
  "ollama.empty":
    "No models scanned yet. Fill host + port and click \"Scan models\".",
  "rel.now": "just now",
  "rel.s": "{n}s ago",
  "rel.m": "{n}m ago",
  "rel.h": "{n}h ago",
  "rel.d": "{n}d ago",

  "providers.docs": "docs ↗",
  "providers.howInstall": "How do I install {name}?",
  "providers.lastTested": "Last tested {when}",
  "providers.btn.test": "Test connection",
  "providers.btn.testing": "Testing…",
  "providers.btn.save": "Save",
  "providers.btn.saving": "Saving…",
  "providers.status.ready": "Ready ✓",
  "providers.status.partial.url": "URL filled, not tested yet",
  "providers.status.partial.cli": "CLI not tested — click Test",
  "providers.status.cliReady": "CLI tested ✓",
  "providers.status.httpReady": "HTTP wrapper tested ✓",
  "providers.status.notConfigured": "Not configured",
  "providers.status.partial.scan": "Endpoint set, not scanned yet",
  "providers.status.cliDefault": "CLI default — no URL needed",

  "providers.ollama.tagline":
    "Local LLM. Free, fast with a GPU, no API keys.",
  "providers.ollama.modelsAvailable": "{count} models available",
  "providers.ollama.gotoSettings": "Go to Ollama settings",
  "providers.ollama.step1":
    "Install Ollama on the machine that runs your models (laptop, VPS, another server).",
  "providers.ollama.step2":
    "Start Ollama. Default port is 11434.",
  "providers.ollama.step3":
    "Pull a model — for example: ollama pull llama3.2",
  "providers.ollama.step4":
    "Fill host + port on the Ollama settings page and click Scan.",

  "providers.hermes.tagline":
    "Self-hosted Hermes runner. AIO Control talks to the hermes CLI via subprocess (default) or an HTTP wrapper if you run one.",
  "providers.hermes.step1":
    "Install the hermes CLI on this server: clone github.com/NousResearch/hermes-agent and follow the README (Python entrypoint).",
  "providers.hermes.step2":
    "Make sure 'hermes --version' works in the shell the Node server runs in. Otherwise: set HERMES_BIN in env to the absolute path.",
  "providers.hermes.step3":
    "Done — no URL needed. AIO Control spawns the CLI per chat / run.",
  "providers.hermes.step4":
    "Optional: running an HTTP wrapper for Hermes? Paste the URL below and click Test (expects /healthz → 200).",

  "providers.openclaw.tagline":
    "Local agent runtime — own tools + custom MCP. Spawned as a CLI subprocess (default) or via HTTP wrapper if you run one.",
  "providers.openclaw.step1":
    "Install OpenClaw — npm i -g @tromptech/openclaw, or clone + npm link.",
  "providers.openclaw.step2":
    "Confirm 'openclaw --version' works in the shell Node runs in. Otherwise: set OPENCLAW_BIN to the absolute path.",
  "providers.openclaw.step3":
    "Done — AIO Control spawns the CLI per chat / run.",
  "providers.openclaw.step4":
    "Optional: running openclaw as an HTTP daemon? Paste the URL below and click Test (expects /healthz).",

  "providers.runtime.title": "Persistent runtime agent",
  "providers.runtime.desc":
    "Register a named profile/agent in the runtime so sessions, memory and skills persist across runs. AIO Control then auto-switches to the named-spawn path instead of ad-hoc per-turn invocations.",
  "providers.runtime.nameLabel": "Agent name",
  "providers.runtime.cmdLabel": "Run this command on the runtime host:",
  "providers.runtime.copy": "Copy",
  "providers.runtime.copied": "✓ Copied",
  "providers.runtime.copyFailed": "Couldn't write to clipboard — select + Ctrl+C manually.",
  "providers.runtime.verify": "Verify",
  "providers.runtime.savedNotice": "Name saved. Run the command, then click Verify.",
  "providers.runtime.verifiedNotice": "✓ Agent \"{name}\" found in runtime — future chats use this profile.",
  "providers.runtime.initializedAgo": "Initialized {when}",
  "providers.status.runtimeReady": "Runtime ready · {name} ✓",

  "topic.kpi.agents": "Agents",
  "topic.kpi.activeRoutines": "Active routines",
  "topic.kpi.runs24h": "Runs 24h",
  "topic.kpi.successFail24h": "Success / fail 24h",
  "topic.kpi.cost30d": "Cost 30d",
  "topic.openQueue": "Open queue",
  "topic.queueEmpty": "Nothing to review for this topic.",
  "topic.recentRuns": "Recent runs",
  "topic.runsEmpty": "No runs in the last 24 hours.",
  "topic.history": "History",
  "topic.routines": "Routines",
  "topic.routines.manage": "Manage schedules",
  "topic.routines.empty":
    "No routines for this topic yet. Head to Schedules to create one and pin it to this topic.",
  "topic.routines.on": "ON",
  "topic.routines.off": "OFF",
  "topic.routines.neverFired": "—",

  "dash.kpi.agents": "Agents",
  "dash.kpi.activeRoutines": "Active routines",
  "dash.kpi.runsToday": "Runs today",
  "dash.kpi.cost30d": "Cost 30d",
  "dash.kpi.revenue30d": "Revenue 30d",
  "dash.calendar": "Calendar",
  "dash.today": "Today",
  "dash.day": "Day",
  "dash.week": "Week",
  "dash.month": "Month",
  "dash.cell.empty": "none",
  "dash.unknownAgent": "Unknown agent",
  "dash.perBusiness.title": "Per business · 30 days",
  "dash.perBusiness.desc":
    "AI cost comes from the runs table. Revenue follows once Stripe or Mollie hooks per business are wired — slots are already reserved.",
  "dash.perBusiness.empty": "No businesses in this workspace yet.",
  "dash.perBusiness.revenue": "Revenue",
  "dash.perBusiness.aiCost": "AI cost",
  "dash.perBusiness.runsToday": "{count} runs today",

  "settings.title": "Settings",
  "settings.section.general": "General",
  "settings.section.general.desc":
    "Workspace name, email, timezone and sign-out.",
  "settings.section.providers": "Providers",
  "settings.section.providers.desc":
    "Step-by-step onboarding for self-hosted providers (Hermes-agent, OpenClaw, Ollama). No more manual fiddling.",
  "settings.section.subscription.desc":
    "Plan, payment method, invoices.",
  "settings.section.notifications": "Notifications",
  "settings.section.team": "Team & roles",
  "settings.section.integrations": "Integrations",
  "settings.section.integrations.desc": "Connections per business.",
  "settings.section.danger": "Danger zone",
  "settings.section.appearance": "Appearance",
  "settings.section.language": "Language",
  "settings.lang.desc": "Pick your interface language. Applies immediately.",

  "danger.export.title": "Export data",
  "danger.export.body": "Download a JSON dump of everything in this workspace.",
  "danger.export.cta": "Download JSON dump",
  "danger.delete.title": "Delete workspace",
  "danger.delete.body": "Permanent. Cascades to everything inside.",
  "danger.delete.cta": "Delete",

  "team.invite.title": "Invite member",
  "team.invite.cta": "Invite",
  "team.members.title": "Current members",

  "agents.title": "{business} — agents",
  "agents.empty.title": "No agents yet",
  "agents.empty.body":
    "An agent wires a provider into this business. Create one to start chatting.",
  "agents.cta.new": "New agent",

  "schedules.title": "{business} — schedules",
  "schedules.section.new": "New schedule",
  "schedules.section.existing": "Existing schedules",
  "schedules.section.runs": "Recent runs",

  "integrations.title": "{business} — integrations",
  "integrations.section.new": "New integration",
  "integrations.section.connected": "Connected services",

  "nav.allBusinesses": "All businesses",
  "nav.profile": "Profile",
  "nav.settings": "Settings",
  "nav.signOut": "Sign out",
  "nav.newBusiness": "New business",
  "nav.newTopic": "New topic",
  "nav.newSubtopic": "New subtopic",
  "nav.workspaceAgents": "Workspace agents",
  "nav.queue": "Queue",
  "nav.runs": "Runs",
  "nav.activity": "Activity",
  "nav.cost": "Cost & spend",
  "nav.marketplace": "Marketplace",
  "nav.marketplaceAdmin": "Marketplace admin",

  "page.dashboard": "Dashboard",
  "page.settings": "Settings",
  "page.profile": "Profile",
  "page.subscription": "Subscription",
  "page.subscription.sub": "Plan, payment method and invoices for {workspace}",
  "page.talk": "Talk to AI",
  "page.talk.sub":
    "Provider · voice · log for the microphone button in the header",
  "page.workspaceAgents": "Workspace agents",
  "page.workspaceAgents.sub":
    "Calendar · revenue · every agent in this workspace, grouped by business.",
  "page.workspaceAgents.empty":
    "No agents yet in this workspace. Create one through a business or with the \"+ New agent\" button in an empty group.",
  "page.workspaceAgents.workspaceGroup": "Workspace",
  "page.workspaceAgents.workspaceGroupSub": "Not tied to a business",
  "page.workspaceAgents.businessGroupSub": "Business agents",
  "page.workspaceAgents.countSingular": "agent",
  "page.workspaceAgents.countPlural": "agents",

  "page.queue": "Queue",
  "page.queue.sub": "HITL items across every business — open + resolved",
  "page.runs": "Runs",
  "page.runs.sub": "Every run across every business",
  "page.activity": "Activity",
  "page.activity.sub": "Audit log of every change",
  "page.cost": "Cost & spend",
  "page.cost.sub":
    "Spend per business · per agent · per provider — last 30 days",
  "page.marketplace": "Marketplace",
  "page.marketplace.sub": "Curated AI agent presets",

  "page.business.overview.sub": "Per-business overview",
  "page.business.agents.title": "{business} — agents",
  "page.business.agents.sub": "Providers · prompts · schedules",
  "page.business.schedules.title": "{business} — schedules",
  "page.business.schedules.sub": "Cron · webhooks · run history",
  "page.business.integrations.title": "{business} — integrations",
  "page.business.integrations.sub": "External services this business uses",
  "page.business.runs.title": "{business} — runs",
  "page.business.runs.sub": "Full run history across every agent",
  "page.business.subnav": "Sub-navigation",

  "wizard.business.title": "New business · step {current} / {total}",
  "wizard.step.identity": "Identity",
  "wizard.step.intent": "Intent",
  "wizard.step.topics": "Topics",
  "wizard.step.mainAgent": "Main agent",
  "wizard.step.telegram": "Telegram",
  "wizard.step.isolation": "Isolation",
  "wizard.step.confirm": "Confirm",
  "wizard.cta.next": "Next →",
  "wizard.cta.back": "← Back",
  "wizard.cta.create": "Create business",

  "agent.dialog.title": "New agent",
  "agent.dialog.workspaceGlobal":
    "Workspace-global agent — not tied to a specific business. Available from chat and as a hop in agent chains across the whole workspace.",
  "agent.dialog.businessScoped":
    "An agent wires a provider (Claude, MiniMax, …) into this business.",
  "agent.field.name": "Name",
  "agent.field.kind": "Kind",
  "agent.field.provider": "Provider",
  "agent.field.model": "Model",
  "agent.field.modelDefault": "Model (default: {model})",
  "agent.field.endpoint": "Endpoint URL (optional — env default when empty)",
  "agent.field.systemPrompt": "System prompt (optional)",
  "agent.field.telegramTarget": "Telegram channel (optional)",
  "agent.field.customIntegration": "Custom integration (optional)",
  "agent.field.workspaceDefault": "— Workspace default —",
  "agent.field.credentials": "Credentials",
  "agent.kind.chat": "Chat (interactive)",
  "agent.kind.worker": "Worker (scheduled / event-driven)",
  "agent.kind.reviewer": "Reviewer (HITL gate)",
  "agent.kind.generator": "Generator (content)",
  "agent.kind.router": "Router (smart-select)",
  "agent.creds.subscription": "Claude Pro/Max/Team subscription",
  "agent.creds.subscription.desc":
    "Cron runs go through Claude Routines on Claude's own infra. No API key. Quota: 5/15/25 routine runs per day.",
  "agent.creds.apiKey": "Anthropic API key (per-token)",
  "agent.creds.apiKey.desc":
    "Cron runs go through our local scheduler. Requires an ANTHROPIC_API_KEY in your workspace api-keys. Pay-per-token, no routine quota.",
  "agent.creds.env": "Env var fallback",
  "agent.creds.env.desc":
    "Reads ANTHROPIC_API_KEY from the process env as a fallback. Handy for solo dev — not recommended for multi-tenant.",
  "agent.routing.title": "Smart routing rules (advanced)",
  "agent.routing.desc":
    "Add rules that pick provider+model at runtime based on the input. First match wins. Example: short inputs → Haiku, long → Opus.",
  "agent.cta.create": "Create",
  "agent.cta.save": "Save",

  "agent.edit.title": "Edit agent",
  "agent.edit.sub": "Adjust name, provider, system prompt and reporting targets.",
  "agent.field.notifyEmail": "Email (override workspace default)",
  "agent.field.topic": "Topic (optional)",
  "agent.field.topic.business": "No topic — whole business",
  "agent.tools.title": "AIO Control tools — what is this agent allowed to call",
  "agent.tools.desc":
    "Read tools (list_*, get_*) are safe + never destructive. Write tools (create_*, update_*) require your confirmation in the chat before they execute. Meta tools (ask_followup, todo_set, open_ui_at) are UI side-effects.",
  "agent.tools.useDefault":
    "Use the standard set for \"{kind}\" agents ({count} tools)",
  "agent.chain.title": "Chain — what runs after this agent?",
  "agent.chain.onDone": "On DONE → run agent",
  "agent.chain.onFail": "On FAIL → run agent (triage)",
  "agent.chain.noChain": "— No chain —",
  "agent.chain.noTriage": "— No triage —",
  "agent.chain.note":
    "The next agent receives this run's output as its input prompt — ideal for extract → translate → publish chains.",

  "tg.intro": "Set the bot token in Settings → API Keys as provider \"Telegram\". Here you configure where reports go: chat_id + optional topic_id for forum-style groups.",
  "tg.topology.title": "Topology — how do you want Telegram structured?",
  "tg.topology.manual": "Manual",
  "tg.topology.manual.desc":
    "You set chat_id + topic_id per business / topic yourself.",
  "tg.topology.perBiz": "Auto-topic per business",
  "tg.topology.perBiz.desc":
    "One supergroup with topics. Every new business gets its own forum topic.",
  "tg.topology.perBizAndNode": "Auto-topic per business + per nav-node",
  "tg.topology.perBizAndNode.desc":
    "Same supergroup; new businesses + new topics in the rail each get a forum topic.",
  "tg.empty": "No Telegram channels yet. Click \"+ Add channel\".",
  "tg.add": "+ Add channel",
  "tg.row.test": "Test",
  "tg.row.delete": "Delete",
  "tg.row.on": "on",
  "tg.row.off": "off",
  "tg.row.autoTopics": "AUTO-TOPICS",
  "tg.row.autoCreateLabel":
    "Auto-create forum topic per new business",
  "tg.field.name": "Name",
  "tg.field.scope": "Scope",
  "tg.field.scope.workspace": "Workspace default",
  "tg.field.scope.business": "Business",
  "tg.field.scope.navnode": "Topic",
  "tg.field.chatId": "Chat ID (starts with -100… for groups)",
  "tg.field.topicId": "Topic ID (optional — for forum-groups)",
  "tg.field.allowlist":
    "Allowlist (comma-separated usernames, optional)",
  "tg.field.denylist":
    "Denylist (comma-separated usernames, optional)",
  "tg.disclosure.title": "🪄 Auto-create topic per business — setup",
  "tg.disclosure.step1":
    "Create a Telegram supergroup and turn ON Topics under Manage → Topics.",
  "tg.disclosure.step2":
    "Add your bot as admin with the Manage Topics permission (and Send Messages, Edit, Delete).",
  "tg.disclosure.step3":
    "Get the chat_id (starts with -100…) via @RawDataBot, add a new channel here with scope = Workspace default, leave topic_id empty.",
  "tg.disclosure.step4":
    "Tick \"Auto-create forum topic per new business\" on that row below.",
  "tg.disclosure.step5":
    "Done — every new business now gets its own forum topic with the same name. Existing businesses are NOT auto-topiced; create them manually or duplicate.",

  "keys.intro":
    "Set API keys at workspace level (default for all agents) or override per business or topic. Resolution: topic → business → workspace → env-var fallback.",
  "keys.empty": "No keys yet. Click \"+ Add key\" to get started.",
  "keys.add": "+ Add key",
  "keys.row.set": "set",
  "keys.row.empty": "empty",
  "keys.row.delete": "Delete",
  "keys.scope.workspace": "Workspace default",
  "keys.scope.business": "Business · {name}",
  "keys.scope.businessDeleted": "(deleted)",
  "keys.scope.topic": "Topic · {name}",
  "keys.scope.businessOverride": "Business override",
  "keys.scope.topicOverride": "Topic override",
  "keys.scope.none": "(none)",
  "keys.field.provider": "Provider",
  "keys.field.scope": "Scope",
  "keys.field.business": "Business",
  "keys.field.topic": "Topic",
  "keys.field.value": "Key (stored encrypted)",
  "keys.field.label": "Label (optional)",
  "keys.field.customSecret": "+ Custom secret…",
  "keys.field.customName": "Secret name",
  "keys.field.customName.hint":
    "UPPERCASE A-Z, 0-9 and _ only — e.g. AIRTABLE_API_KEY. Agents/modules read it by this name.",
  "keys.group.providers": "Provider keys",
  "keys.group.custom": "Custom secrets",

  "settings.sub": "Account · workspace · automations",
  "settings.section.agentDefaults": "Agent defaults",
  "settings.section.agentDefaults.desc":
    "What does every new agent get for provider / model / system prompt? Per business or agent you can still override.",
  "settings.section.weather": "Weather chip",
  "settings.section.weather.desc":
    "The top-right corner of the header shows a per-workspace weather chip.",
  "settings.section.ollama": "Local Ollama",
  "settings.section.ollama.desc":
    "Set host + port for your own Ollama server. Click \"Scan models\" to enumerate the models — they then become selectable everywhere in the app (chat panel, talk page, agents).",
  "settings.section.apiKeys": "API Keys",
  "settings.section.apiKeys.desc":
    "Workspace defaults or overrides per business or topic. Encrypted via pgcrypto.",
  "settings.section.spendLimits": "Spend limits",
  "settings.section.spendLimits.desc":
    "Daily/monthly caps per workspace; auto-pause if you want.",
  "settings.section.telegram": "Telegram",
  "settings.section.telegram.desc":
    "Send run reports to one or more Telegram channels.",
  "settings.section.email": "Email notifications",
  "settings.section.email.desc":
    "Run reports via SMTP. Per-business / per-agent overrides via right-click.",
  "settings.section.customIntegrations": "Custom integrations",
  "settings.section.customIntegrations.desc":
    "Generic HTTP webhooks / API calls. Mustache placeholders for run data.",
  "settings.section.notifs.desc":
    "Web Push for HITL items on this device.",
  "settings.section.team.desc":
    "Who can do what. You're always owner; you can add admins / editors / viewers.",
  "settings.section.danger.desc":
    "Export data or delete the workspace permanently.",
  "settings.section.talk": "Talk to AI",
  "settings.section.subscription": "Subscription",
  "settings.field.workspaceName": "Workspace name",
  "settings.field.email": "Email",
  "settings.field.timezone": "Timezone",

  "profile.title": "Profile",
  "profile.sub": "Account · preferences · sessions",
  "profile.section.identity": "Identity",
  "profile.section.identity.desc": "Name and avatar — how others see you.",
  "profile.section.account": "Account",
  "profile.section.account.desc": "Login email + password.",
  "profile.section.contact": "Contact + invoicing",
  "profile.section.contact.desc":
    "Address, phone, business number and Tax-ID. Used for invoices and GDPR correspondence. All optional.",
  "profile.section.prefs": "Preferences",
  "profile.section.prefs.desc": "Timezone + interface language.",
  "profile.section.history": "Login history",
  "profile.section.history.desc":
    "Recent logins to your account. See anything suspicious? Change your password and sign out everywhere.",
  "profile.section.security": "Sessions / security",
  "profile.section.security.desc":
    "Signs you out on ALL devices + browsers. Handy after a lost laptop.",
  "profile.history.empty":
    "No logins recorded yet. (The audit system just went live — your next login will show up here.)",
  "profile.history.col.when": "When",
  "profile.history.col.device": "Device",
  "profile.history.col.ip": "IP",
  "profile.history.col.method": "Method",
  "profile.history.refresh": "Refresh",
  "profile.security.signOutAll": "Sign out everywhere",
  "profile.security.signOutAll.confirm":
    "Signs you out on ALL devices + browsers where you're currently signed in. Continue?",
};

const de: Partial<Dict> = {
  "common.cancel": "Abbrechen",
  "common.save": "Speichern",
  "common.loading": "Lädt…",
  "common.busy": "Bitte warten…",
  "common.delete": "Löschen",
  "common.archive": "Archivieren",
  "common.create": "Erstellen",
  "common.edit": "Bearbeiten",
  "common.signOut": "Abmelden",

  "auth.login.title": "Anmelden",
  "auth.login.sub": "Melde dich bei deinem AIO Control Workspace an.",
  "auth.signup.title": "Konto erstellen",
  "auth.signup.sub":
    "Registriere dich — du bekommst automatisch deinen eigenen Workspace.",
  "auth.field.username": "Benutzername oder E-Mail",
  "auth.field.email": "E-Mail",
  "auth.field.name": "Name",
  "auth.field.password": "Passwort",
  "auth.cta.login": "Anmelden",
  "auth.cta.signup": "Konto erstellen",
  "auth.no_account": "Noch kein Konto?",
  "auth.have_account": "Schon ein Konto?",
  "auth.cta.register": "Registrieren",
  "auth.divider": "oder mit",
  "auth.oauth.google": "Mit Google fortfahren",
  "auth.oauth.github": "Mit GitHub fortfahren",

  "rail.empty": "Noch keine Businesses",

  "ctx.newBusiness": "Neues Business",
  "ctx.open": "Öffnen",
  "ctx.openNewTab": "In neuem Tab öffnen",
  "ctx.newTopic": "Neues Topic",
  "ctx.newSubtopic": "Neues Subtopic",
  "ctx.agents": "Agents",
  "ctx.schedules": "Zeitpläne",
  "ctx.settings": "Einstellungen…",
  "ctx.duplicate": "Duplizieren",
  "ctx.copyLink": "Link kopieren",
  "ctx.archive": "Archivieren",
  "ctx.moveUp": "↑ Nach oben",
  "ctx.moveDown": "↓ Nach unten",
  "ctx.moveToRoot": "Auf Root verschieben",
  "ctx.moveUnder": "Verschieben unter {name}",
  "ctx.confirmArchiveBiz": "Bist du sicher, dass du \"{name}\" archivieren willst?",
  "ctx.confirmArchiveTopic": "Topic \"{name}\" archivieren?",
  "ctx.newTopicTitle": "Neues Topic in {parent}",
  "ctx.newSubtopicTitle": "Neues Subtopic in {parent}",

  "topic.queue": "Warteschlange",
  "topic.agents": "Agents",
  "topic.schedules": "Zeitpläne",
  "topic.integrations": "Integrationen",

  "biztabs.overview": "Übersicht",
  "biztabs.agents": "Agents",
  "biztabs.routines": "Routinen",
  "biztabs.runs": "Runs",
  "biztabs.integrations": "Integrationen",
  "biztabs.topics": "Topics",
  "biztabs.lastRun": "Letzter Run",

  "dashboard.title": "{workspace} — Übersicht",
  "dashboard.sub": "Marge pro Business · auto + HITL",
  "dashboard.empty.title": "Erstes Business anlegen →",
  "dashboard.empty.body":
    "Hier landen deine automatisierten Mini-Businesses. Erstelle eins, um loszulegen.",
  "dashboard.queueEmpty.title": "Warteschlange leer ✓",
  "dashboard.queueEmpty.body":
    "Nichts zum Prüfen. Sobald ein Agent etwas aufnimmt, erscheint es hier — auto-publish bei hoher Confidence, sonst HITL.",
  "dashboard.queueEmpty.cta": "Neuer Agent",

  "kpi.margin": "MARGE 30T",
  "kpi.revenue": "UMSATZ",
  "kpi.cost": "AI KOSTEN",
  "kpi.runs24h": "{count} Runs · 24h",

  "biz.kpi.revenue30d": "UMSATZ 30T",
  "biz.kpi.cost30d": "AI KOSTEN 30T",
  "biz.kpi.revenue7d": "UMSATZ 7T",
  "biz.kpi.runs24h": "RUNS 24H",
  "biz.kpi.successFail": "SUCCESS / FAIL",
  "biz.openQueue": "Offene Warteschlange",
  "biz.viewAll": "Alle ansehen",
  "biz.queueEmpty.title": "Warteschlange leer ✓",
  "biz.queueEmpty.body":
    "Nichts zu prüfen. Trigger einen Run oder warte bis ein Agent etwas aufnimmt.",
  "biz.agentsCount": "Agents · {count}",
  "biz.manage": "Verwalten",
  "biz.noAgents.title": "Keine Agents",
  "biz.noAgents.body": "Füge einen Agent hinzu, um Runs zu starten.",
  "biz.recentRuns": "Letzte Runs",
  "biz.history": "History",
  "biz.noRuns.title": "Noch keine Runs",
  "biz.noRuns.body": "Triggere einen Agent via Run-now oder Webhook.",

  "header.searchPlaceholder":
    "Suche oder frag die KI: \"wieviel hat YouTube heute eingebracht?\"",
  "header.crumbBackToWorkspace": "Zurück zum Workspace-Dashboard",
  "header.crumbBackToBusinesses": "Zurück zu allen Businesses",

  "search.placeholder":
    "Suche Businesses, Agents, Queue-Items, Marketplace…",
  "search.scope.all": "Alle",
  "search.scope.business": "Dieses Business",
  "search.scope.global": "Workspace-global",
  "search.quickActions": "Schnellaktionen",
  "search.empty": "Keine Ergebnisse in diesem Scope.",
  "search.searching": "Suche…",
  "search.footer.open": "↵ öffnen",
  "search.footer.close": "Esc schließen",
  "search.footer.shortcut": "Ctrl+K öffnet überall",
  "search.footer.workspace": "Workspace: {slug}",
  "search.tpl.openQueue": "Offene Warteschlange",
  "search.tpl.openQueue.hint": "HITL-Items zu prüfen",
  "search.tpl.failedRuns": "Fehlgeschlagene Runs (24h)",
  "search.tpl.failedRuns.hint": "Failed-Status letzte 24h",
  "search.tpl.workspaceAgents": "Workspace-Agents",
  "search.tpl.workspaceAgents.hint": "Alle Agents pro Business",
  "search.tpl.activity": "Aktivität",
  "search.tpl.activity.hint": "Audit-Log aller Änderungen",
  "search.tpl.cost": "Kosten & Verbrauch",
  "search.tpl.cost.hint": "Pro Provider / Business / Agent",
  "search.tpl.marketplace": "Marketplace",
  "search.tpl.marketplace.hint": "Kuratierte Agent-Presets",
  "search.tpl.profile": "Profil",
  "search.tpl.profile.hint": "Konto-Einstellungen",
  "search.tpl.settingsTelegram": "Settings · Telegram",
  "search.tpl.settingsTelegram.hint": "Bot-Ziele konfigurieren",
  "search.tpl.settingsApiKeys": "Settings · API-Keys",
  "search.tpl.settingsApiKeys.hint": "Provider-Keys + Overrides",
  "search.tpl.settingsSpendLimits": "Settings · Spend-Limits",
  "search.tpl.settingsSpendLimits.hint": "Tages-/Monats-Caps",
  "search.tpl.settingsProviders": "Settings · Providers",
  "search.tpl.settingsProviders.hint": "Hermes/OpenClaw/Ollama Setup",
  "search.tpl.bizAgents": "Dieses Business: Agents",
  "search.tpl.bizAgents.hint": "Per-Business Agent-Liste",
  "search.tpl.bizRoutines": "Dieses Business: Routinen",
  "search.tpl.bizRoutines.hint": "Cron + Webhook-Zeitpläne",
  "search.tpl.bizRuns": "Dieses Business: Runs",
  "search.tpl.bizRuns.hint": "Vollständige Run-History",

  "pause.live": "Live · auto",
  "pause.paused": "Pausiert",
  "pause.clickToPause": "→ klick zum Pausieren",
  "pause.clickToStart": "→ klick zum Starten",

  "ollama.field.host": "Host",
  "ollama.field.port": "Port",
  "ollama.host.placeholder": "localhost · 192.168.0.42 · vps.tail-scale.ts.net",
  "ollama.btn.scan": "Modelle scannen",
  "ollama.btn.scanning": "Scanne…",
  "ollama.btn.saving": "Speichern…",
  "ollama.savedNotice": "✓ Gespeichert",
  "ollama.endpointLabel": "Endpoint",
  "ollama.lastScan": "zuletzt gescannt {when}",
  "ollama.modelsCount": "{count} Modelle verfügbar",
  "ollama.empty":
    "Noch keine Modelle gescannt. Host + Port ausfüllen und \"Scan models\" klicken.",
  "rel.now": "gerade eben",
  "rel.s": "vor {n}s",
  "rel.m": "vor {n}m",
  "rel.h": "vor {n}h",
  "rel.d": "vor {n}d",

  "providers.docs": "Docs ↗",
  "providers.howInstall": "Wie installiere ich {name}?",
  "providers.lastTested": "Zuletzt getestet {when}",
  "providers.btn.test": "Verbindung testen",
  "providers.btn.testing": "Teste…",
  "providers.btn.save": "Speichern",
  "providers.btn.saving": "Speichern…",
  "providers.status.ready": "Bereit ✓",
  "providers.status.partial.url": "URL eingegeben, noch nicht getestet",
  "providers.status.partial.cli": "CLI nicht getestet — klick Test",
  "providers.status.cliReady": "CLI getestet ✓",
  "providers.status.httpReady": "HTTP-Wrapper getestet ✓",
  "providers.status.notConfigured": "Nicht konfiguriert",
  "providers.status.partial.scan": "Endpoint gesetzt, noch nicht gescannt",
  "providers.status.cliDefault": "CLI-Default — keine URL nötig",

  "providers.ollama.tagline":
    "Lokale LLM. Kostenlos, schnell mit GPU, keine API-Keys.",
  "providers.ollama.modelsAvailable": "{count} Modelle verfügbar",
  "providers.ollama.gotoSettings": "Zu Ollama-Einstellungen",
  "providers.ollama.step1":
    "Installiere Ollama auf der Maschine, die die Modelle ausführt (Laptop, VPS, anderer Server).",
  "providers.ollama.step2":
    "Starte Ollama. Default-Port ist 11434.",
  "providers.ollama.step3":
    "Hole ein Modell — z.B.: ollama pull llama3.2",
  "providers.ollama.step4":
    "Trag Host + Port auf der Ollama-Settings-Seite ein und klicke Scan.",

  "providers.hermes.tagline":
    "Self-hosted Hermes-Runner. AIO Control spricht mit der hermes CLI via Subprocess (default) oder HTTP-Wrapper.",
  "providers.hermes.step1":
    "Installiere die hermes CLI auf diesem Server: clone github.com/NousResearch/hermes-agent und folge der README.",
  "providers.hermes.step2":
    "Stelle sicher dass 'hermes --version' in der Shell funktioniert in der Node läuft. Sonst: setze HERMES_BIN auf den absoluten Pfad.",
  "providers.hermes.step3":
    "Fertig — keine URL nötig. AIO Control spawnt die CLI pro Chat / Run.",
  "providers.hermes.step4":
    "Optional: HTTP-Wrapper für Hermes? Plak die URL unten und klick Test (erwartet /healthz → 200).",

  "providers.openclaw.tagline":
    "Local agent runtime — eigene Tools + Custom MCP. Subprocess oder HTTP-Wrapper.",
  "providers.openclaw.step1":
    "Installiere OpenClaw — npm i -g @tromptech/openclaw, oder clone + npm link.",
  "providers.openclaw.step2":
    "Stelle sicher dass 'openclaw --version' in der Shell funktioniert in der Node läuft. Sonst: setze OPENCLAW_BIN.",
  "providers.openclaw.step3":
    "Fertig — AIO Control spawnt die CLI pro Chat / Run.",
  "providers.openclaw.step4":
    "Optional: openclaw als HTTP-Daemon? Plak die URL unten und klick Test (erwartet /healthz).",

  "providers.runtime.title": "Persistent Runtime-Agent",
  "providers.runtime.desc":
    "Registriere ein named profile/agent in der Runtime, damit Sessions, Memory und Skills run-übergreifend bestehen bleiben. AIO Control schaltet dann automatisch auf den named-spawn-Pfad.",
  "providers.runtime.nameLabel": "Agent-Name",
  "providers.runtime.cmdLabel": "Führe dieses Kommando auf dem Runtime-Host aus:",
  "providers.runtime.copy": "Kopieren",
  "providers.runtime.copied": "✓ Kopiert",
  "providers.runtime.copyFailed": "Konnte nicht in Clipboard schreiben — markiere + Ctrl+C manuell.",
  "providers.runtime.verify": "Verifizieren",
  "providers.runtime.savedNotice": "Name gespeichert. Kommando ausführen, dann Verify klicken.",
  "providers.runtime.verifiedNotice": "✓ Agent \"{name}\" in Runtime gefunden — künftige Chats nutzen dieses Profil.",
  "providers.runtime.initializedAgo": "Initialisiert {when}",
  "providers.status.runtimeReady": "Runtime ready · {name} ✓",

  "topic.kpi.agents": "Agents",
  "topic.kpi.activeRoutines": "Aktive Routinen",
  "topic.kpi.runs24h": "Runs 24h",
  "topic.kpi.successFail24h": "Success / fail 24h",
  "topic.kpi.cost30d": "Kosten 30T",
  "topic.openQueue": "Offene Warteschlange",
  "topic.queueEmpty": "Nichts zu prüfen für dieses Topic.",
  "topic.recentRuns": "Letzte Runs",
  "topic.runsEmpty": "Keine Runs in den letzten 24 Stunden.",
  "topic.history": "History",
  "topic.routines": "Routinen",
  "topic.routines.manage": "Schedules verwalten",
  "topic.routines.empty":
    "Noch keine Routinen für dieses Topic. Erstelle eine in Schedules und binde sie an dieses Topic.",
  "topic.routines.on": "AN",
  "topic.routines.off": "AUS",
  "topic.routines.neverFired": "—",

  "dash.kpi.agents": "Agents",
  "dash.kpi.activeRoutines": "Aktive Routinen",
  "dash.kpi.runsToday": "Runs heute",
  "dash.kpi.cost30d": "Kosten 30T",
  "dash.kpi.revenue30d": "Umsatz 30T",
  "dash.calendar": "Kalender",
  "dash.today": "Heute",
  "dash.day": "Tag",
  "dash.week": "Woche",
  "dash.month": "Monat",
  "dash.cell.empty": "leer",
  "dash.unknownAgent": "Unbekannter Agent",
  "dash.perBusiness.title": "Pro Business · 30 Tage",
  "dash.perBusiness.desc":
    "AI-Kosten kommen aus der Runs-Tabelle. Umsatz folgt sobald Stripe- oder Mollie-Hooks pro Business angeschlossen sind.",
  "dash.perBusiness.empty": "Noch keine Businesses in diesem Workspace.",
  "dash.perBusiness.revenue": "Umsatz",
  "dash.perBusiness.aiCost": "AI-Kosten",
  "dash.perBusiness.runsToday": "{count} Runs heute",

  "settings.title": "Einstellungen",
  "settings.section.general": "Allgemein",
  "settings.section.general.desc":
    "Workspace-Name, E-Mail, Zeitzone und Abmelden.",
  "settings.section.providers": "Providers",
  "settings.section.providers.desc":
    "Schritt-für-Schritt Onboarding für self-hosted Providers (Hermes-agent, OpenClaw, Ollama).",
  "settings.section.subscription.desc":
    "Plan, Zahlungsmethode, Rechnungen.",
  "settings.section.notifications": "Benachrichtigungen",
  "settings.section.team": "Team & Rollen",
  "settings.section.integrations": "Integrationen",
  "settings.section.integrations.desc": "Verbindungen je Business.",
  "settings.section.danger": "Gefahrenzone",
  "settings.section.appearance": "Erscheinungsbild",
  "settings.section.language": "Sprache",
  "settings.lang.desc":
    "Sprache der Oberfläche. Änderung wird sofort übernommen.",

  "danger.export.title": "Daten exportieren",
  "danger.export.body":
    "Lade einen JSON-Dump aller Daten dieses Workspaces herunter.",
  "danger.export.cta": "JSON-Dump herunterladen",
  "danger.delete.title": "Workspace löschen",
  "danger.delete.body": "Endgültig. Kaskadiert auf alles darin.",
  "danger.delete.cta": "Löschen",

  "team.invite.title": "Mitglied einladen",
  "team.invite.cta": "Einladen",
  "team.members.title": "Aktuelle Mitglieder",

  "agents.title": "{business} — Agents",
  "agents.empty.title": "Noch keine Agents",
  "agents.empty.body":
    "Ein Agent verbindet einen Provider mit diesem Business. Erstelle einen, um zu chatten.",
  "agents.cta.new": "Neuer Agent",

  "schedules.title": "{business} — Zeitpläne",
  "schedules.section.new": "Neuer Zeitplan",
  "schedules.section.existing": "Vorhandene Zeitpläne",
  "schedules.section.runs": "Letzte Runs",

  "integrations.title": "{business} — Integrationen",
  "integrations.section.new": "Neue Integration",
  "integrations.section.connected": "Verbundene Dienste",

  "nav.allBusinesses": "Alle Businesses",
  "nav.profile": "Profil",
  "nav.settings": "Einstellungen",
  "nav.signOut": "Abmelden",
  "rail.emptyTopics": "Noch keine Subtopics — unten anlegen ↓",
  "nav.newBusiness": "Neues Business",
  "nav.newTopic": "Neues Topic",
  "nav.newSubtopic": "Neues Subtopic",
  "nav.workspaceAgents": "Workspace-Agents",
  "nav.queue": "Warteschlange",
  "nav.runs": "Runs",
  "nav.activity": "Aktivität",
  "nav.cost": "Kosten & Verbrauch",
  "nav.marketplace": "Marketplace",
  "nav.marketplaceAdmin": "Marketplace Admin",

  "page.dashboard": "Dashboard",
  "page.settings": "Einstellungen",
  "page.profile": "Profil",
  "page.subscription": "Abonnement",
  "page.subscription.sub": "Plan, Zahlungsmethode und Rechnungen für {workspace}",
  "page.talk": "Talk to AI",
  "page.talk.sub":
    "Provider · Stimme · Log für den Mikrofon-Button im Header",
  "page.workspaceAgents": "Workspace-Agents",
  "page.workspaceAgents.sub":
    "Kalender · Umsatz · alle Agents in diesem Workspace, gruppiert nach Business.",
  "page.workspaceAgents.empty":
    "Noch keine Agents in diesem Workspace. Lege einen über ein Business an oder über den \"+ Neuer Agent\"-Button in einer leeren Gruppe.",
  "page.workspaceAgents.workspaceGroup": "Workspace",
  "page.workspaceAgents.workspaceGroupSub": "Nicht an ein Business gebunden",
  "page.workspaceAgents.businessGroupSub": "Business-Agents",
  "page.workspaceAgents.countSingular": "Agent",
  "page.workspaceAgents.countPlural": "Agents",

  "page.queue": "Warteschlange",
  "page.queue.sub": "HITL-Items über alle Businesses — offen + gelöst",
  "page.runs": "Runs",
  "page.runs.sub": "Alle Runs über alle Businesses",
  "page.activity": "Aktivität",
  "page.activity.sub": "Audit-Log aller Änderungen",
  "page.cost": "Kosten & Verbrauch",
  "page.cost.sub":
    "Verbrauch pro Business · pro Agent · pro Provider — letzte 30 Tage",
  "page.marketplace": "Marketplace",
  "page.marketplace.sub": "Kuratierte AI-Agent-Presets",

  "settings.sub": "Konto · Workspace · Automatisierungen",
  "settings.section.agentDefaults": "Agent-Defaults",
  "settings.section.agentDefaults.desc":
    "Was bekommt jeder neue Agent als Provider / Modell / System-Prompt? Pro Business oder Agent kannst du es noch überschreiben.",
  "settings.section.weather": "Wetter-Chip",
  "settings.section.weather.desc":
    "Die rechte obere Ecke des Headers zeigt einen Wetter-Chip pro Workspace.",
  "settings.section.ollama": "Lokales Ollama",
  "settings.section.ollama.desc":
    "Host + Port deines eigenen Ollama-Servers. Klick \"Scan models\" um die verfügbaren Modelle abzurufen — sie sind dann überall in der App auswählbar (Chat-Panel, Talk-Seite, Agents).",
  "settings.section.apiKeys": "API-Keys",
  "settings.section.apiKeys.desc":
    "Workspace-Defaults oder Overrides pro Business oder Topic. Verschlüsselung via pgcrypto.",
  "settings.section.spendLimits": "Spend-Limits",
  "settings.section.spendLimits.desc":
    "Tages-/Monats-Caps pro Workspace; auto-pause optional.",
  "settings.section.telegram": "Telegram",
  "settings.section.telegram.desc":
    "Sende Run-Berichte an einen oder mehrere Telegram-Kanäle.",
  "settings.section.email": "E-Mail-Benachrichtigungen",
  "settings.section.email.desc":
    "Run-Berichte via SMTP. Per-Business / Per-Agent Overrides via Rechtsklick.",
  "settings.section.customIntegrations": "Eigene Integrationen",
  "settings.section.customIntegrations.desc":
    "Allgemeine HTTP-Webhooks / API-Calls. Mustache-Platzhalter für Run-Daten.",
  "settings.section.notifs.desc":
    "Web Push für HITL-Items auf diesem Gerät.",
  "settings.section.team.desc":
    "Wer darf was. Owner bist immer du; Admins / Editors / Viewers können hinzugefügt werden.",
  "settings.section.danger.desc":
    "Daten exportieren oder den Workspace dauerhaft löschen.",
  "settings.section.talk": "Talk to AI",
  "settings.section.subscription": "Abonnement",
  "settings.field.workspaceName": "Workspace-Name",
  "settings.field.email": "E-Mail",
  "settings.field.timezone": "Zeitzone",

  "profile.title": "Profil",
  "profile.sub": "Konto · Einstellungen · Sitzungen",
  "profile.section.identity": "Identität",
  "profile.section.identity.desc": "Name und Avatar — wie andere dich sehen.",
  "profile.section.account": "Konto",
  "profile.section.account.desc": "Login E-Mail + Passwort.",
  "profile.section.contact": "Kontakt + Rechnung",
  "profile.section.contact.desc":
    "Adresse, Telefon, Handelsregister-Nr. und USt-ID. Für Rechnungen und DSGVO-Korrespondenz. Alles optional.",
  "profile.section.prefs": "Einstellungen",
  "profile.section.prefs.desc": "Zeitzone + Oberflächensprache.",
  "profile.section.history": "Login-Verlauf",
  "profile.section.history.desc":
    "Letzte Logins in deinem Konto. Etwas Verdächtiges? Passwort ändern und überall abmelden.",
  "profile.section.security": "Sitzungen / Sicherheit",
  "profile.section.security.desc":
    "Meldet dich auf ALLEN Geräten + Browsern ab. Praktisch nach einem verlorenen Laptop.",
  "profile.history.empty":
    "Noch keine Logins erfasst. (Das Audit-System ist gerade live — der nächste Login erscheint hier.)",
  "profile.history.col.when": "Wann",
  "profile.history.col.device": "Gerät",
  "profile.history.col.ip": "IP",
  "profile.history.col.method": "Methode",
  "profile.history.refresh": "Aktualisieren",
  "profile.security.signOutAll": "Überall abmelden",
  "profile.security.signOutAll.confirm":
    "Meldet dich auf ALLEN Geräten + Browsern ab, wo du gerade angemeldet bist. Fortfahren?",

  "wizard.business.title": "Neues Business · Schritt {current} / {total}",
  "wizard.step.identity": "Identität",
  "wizard.step.intent": "Ziel",
  "wizard.step.topics": "Topics",
  "wizard.step.mainAgent": "Haupt-Agent",
  "wizard.step.telegram": "Telegram",
  "wizard.step.isolation": "Isolation",
  "wizard.step.confirm": "Bestätigen",
  "wizard.cta.next": "Weiter →",
  "wizard.cta.back": "← Zurück",
  "wizard.cta.create": "Business erstellen",

  "agent.dialog.title": "Neuer Agent",
  "agent.dialog.workspaceGlobal":
    "Workspace-globaler Agent — nicht an ein Business gebunden. Aus dem Chat und als Schritt in Agent-Chains workspace-weit verfügbar.",
  "agent.dialog.businessScoped":
    "Ein Agent verbindet einen Provider (Claude, MiniMax, …) mit diesem Business.",
  "agent.field.name": "Name",
  "agent.field.kind": "Typ",
  "agent.field.provider": "Provider",
  "agent.field.model": "Modell",
  "agent.field.modelDefault": "Modell (Default: {model})",
  "agent.field.endpoint": "Endpoint-URL (optional — env-Default wenn leer)",
  "agent.field.systemPrompt": "System-Prompt (optional)",
  "agent.field.telegramTarget": "Telegram-Channel (optional)",
  "agent.field.customIntegration": "Eigene Integration (optional)",
  "agent.field.workspaceDefault": "— Workspace-Default —",
  "agent.field.credentials": "Credentials",
  "agent.kind.chat": "Chat (interaktiv)",
  "agent.kind.worker": "Worker (Scheduled / Event-driven)",
  "agent.kind.reviewer": "Reviewer (HITL-Gate)",
  "agent.kind.generator": "Generator (Content)",
  "agent.kind.router": "Router (Smart-Select)",
  "agent.creds.subscription": "Claude Pro/Max/Team Abo",
  "agent.creds.subscription.desc":
    "Cron-Runs laufen als Claude Routines auf Claude's eigener Infra. Kein API-Key. Quota: 5/15/25 Routine-Runs pro Tag.",
  "agent.creds.apiKey": "Anthropic API-Key (pro Token)",
  "agent.creds.apiKey.desc":
    "Cron-Runs laufen lokal via unseren Scheduler. Erfordert ANTHROPIC_API_KEY in den Workspace-API-Keys. Pay-per-Token.",
  "agent.creds.env": "Env-Var Fallback",
  "agent.creds.env.desc":
    "Liest ANTHROPIC_API_KEY aus der Process-Env als Fallback. OK für Solo-Dev, nicht für Multi-Tenant.",
  "agent.routing.title": "Smart-Routing-Regeln (advanced)",
  "agent.routing.desc":
    "Regeln, die Provider+Modell zur Laufzeit basierend auf der Eingabe wählen. Erste passende Regel gewinnt.",
  "agent.cta.create": "Erstellen",
  "agent.cta.save": "Speichern",

  "agent.edit.title": "Agent bearbeiten",
  "agent.edit.sub":
    "Name, Provider, System-Prompt und Reporting-Ziele anpassen.",
  "agent.field.notifyEmail": "E-Mail (überschreibt Workspace-Default)",
  "agent.field.topic": "Topic (optional)",
  "agent.field.topic.business": "Kein Topic — gesamte Business",
  "agent.tools.title":
    "AIO-Control-Tools — was darf dieser Agent aufrufen",
  "agent.tools.desc":
    "Read-Tools (list_*, get_*) sind sicher + nie destruktiv. Write-Tools (create_*, update_*) erfordern deine Bestätigung im Chat vor der Ausführung.",
  "agent.tools.useDefault":
    "Standard-Set für \"{kind}\"-Agents verwenden ({count} Tools)",
  "agent.chain.title": "Chain — was läuft nach diesem Agent?",
  "agent.chain.onDone": "Bei DONE → Agent starten",
  "agent.chain.onFail": "Bei FAIL → Agent starten (Triage)",
  "agent.chain.noChain": "— Keine Chain —",
  "agent.chain.noTriage": "— Keine Triage —",
  "agent.chain.note":
    "Der nächste Agent erhält den Output dieses Runs als Eingabe-Prompt — ideal für Extract → Translate → Publish Chains.",

  "tg.intro": "Bot-Token setzt du in Settings → API Keys als Provider \"Telegram\". Hier konfigurierst du, wohin Reports gehen.",
  "tg.topology.title": "Topology — wie soll Telegram strukturiert sein?",
  "tg.topology.manual": "Manuell",
  "tg.topology.manual.desc":
    "chat_id + topic_id pro Business / Topic selbst setzen.",
  "tg.topology.perBiz": "Auto-Topic pro Business",
  "tg.topology.perBiz.desc":
    "Eine Supergroup mit Topics. Jedes neue Business bekommt sein eigenes Forum-Topic.",
  "tg.topology.perBizAndNode": "Auto-Topic pro Business + pro Nav-Node",
  "tg.topology.perBizAndNode.desc":
    "Gleiche Supergroup; neue Businesses + neue Topics in der Rail bekommen jeweils ein Forum-Topic.",
  "tg.empty": "Noch keine Telegram-Channels. Klick \"+ Channel hinzufügen\".",
  "tg.add": "+ Channel hinzufügen",
  "tg.row.test": "Test",
  "tg.row.delete": "Löschen",
  "tg.row.on": "an",
  "tg.row.off": "aus",
  "tg.row.autoTopics": "AUTO-TOPICS",
  "tg.row.autoCreateLabel":
    "Auto-Create Forum-Topic pro neuem Business",
  "tg.field.name": "Name",
  "tg.field.scope": "Scope",
  "tg.field.scope.workspace": "Workspace-Default",
  "tg.field.scope.business": "Business",
  "tg.field.scope.navnode": "Topic",
  "tg.field.chatId": "Chat-ID (beginnt mit -100… für Gruppen)",
  "tg.field.topicId": "Topic-ID (optional — nur für Forum-Gruppen)",
  "tg.field.allowlist":
    "Allowlist (komma-getrennte Usernames, optional)",
  "tg.field.denylist":
    "Denylist (komma-getrennte Usernames, optional)",
  "tg.disclosure.title": "🪄 Auto-Topic pro Business — Setup",
  "tg.disclosure.step1":
    "Erstelle eine Telegram-Supergroup und aktiviere unter Manage → Topics die Option Topics.",
  "tg.disclosure.step2":
    "Füge deinen Bot als Admin mit der Manage-Topics-Berechtigung hinzu (und Send Messages, Edit, Delete).",
  "tg.disclosure.step3":
    "Hol die chat_id (startet mit -100…) via @RawDataBot, füge hier einen neuen Channel hinzu mit Scope = Workspace-Default, lass topic_id leer.",
  "tg.disclosure.step4":
    "Hak \"Auto-Create Forum-Topic pro neuem Business\" in der Row unten an.",
  "tg.disclosure.step5":
    "Fertig — jedes neue Business bekommt jetzt sein eigenes Forum-Topic. Existierende Businesses werden NICHT automatisch getopict.",

  "keys.intro":
    "API-Keys auf Workspace-Ebene setzen (Default für alle Agents) oder pro Business / Topic überschreiben. Resolution: Topic → Business → Workspace → env-Var Fallback.",
  "keys.empty": "Noch keine Keys. Klick \"+ Key hinzufügen\".",
  "keys.add": "+ Key hinzufügen",
  "keys.row.set": "gesetzt",
  "keys.row.empty": "leer",
  "keys.row.delete": "Löschen",
  "keys.scope.workspace": "Workspace-Default",
  "keys.scope.business": "Business · {name}",
  "keys.scope.businessDeleted": "(gelöscht)",
  "keys.scope.topic": "Topic · {name}",
  "keys.scope.businessOverride": "Business-Override",
  "keys.scope.topicOverride": "Topic-Override",
  "keys.scope.none": "(keiner)",
  "keys.field.provider": "Provider",
  "keys.field.scope": "Scope",
  "keys.field.business": "Business",
  "keys.field.topic": "Topic",
  "keys.field.value": "Key (verschlüsselt gespeichert)",
  "keys.field.label": "Label (optional)",
  "keys.field.customSecret": "+ Custom secret…",
  "keys.field.customName": "Secret-Name",
  "keys.field.customName.hint":
    "Nur UPPERCASE A-Z, 0-9 und _ — z.B. AIRTABLE_API_KEY. Agents/Module lesen den Wert via diesen Namen.",
  "keys.group.providers": "Provider-Keys",
  "keys.group.custom": "Custom Secrets",
};

const DICTS: Record<Locale, Partial<Dict>> = { nl, en, de };

export function translate(
  locale: Locale,
  key: string,
  vars?: Record<string, string | number>,
): string {
  const raw = DICTS[locale]?.[key] ?? nl[key] ?? key;
  if (!vars) return raw;
  return raw.replace(/\{(\w+)\}/g, (_, k: string) =>
    String(vars[k] ?? `{${k}}`),
  );
}

export type T = (key: string, vars?: Record<string, string | number>) => string;
