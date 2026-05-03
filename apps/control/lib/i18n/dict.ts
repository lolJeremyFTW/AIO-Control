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

  "settings.title": "Instellingen",
  "settings.sub": "Account · workspace · automations",
  "settings.section.general": "Algemeen",
  "settings.section.notifications": "Notificaties",
  "settings.section.team": "Team & rollen",
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

  "settings.title": "Settings",
  "settings.section.general": "General",
  "settings.section.notifications": "Notifications",
  "settings.section.team": "Team & roles",
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

  "settings.sub": "Account · workspace · automations",
  "settings.section.agentDefaults": "Agent defaults",
  "settings.section.agentDefaults.desc":
    "What does every new agent get for provider / model / system prompt? Per business or agent you can still override.",
  "settings.section.weather": "Weather chip",
  "settings.section.weather.desc":
    "The top-right corner of the header shows a per-workspace weather chip.",
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

  "settings.title": "Einstellungen",
  "settings.section.general": "Allgemein",
  "settings.section.notifications": "Benachrichtigungen",
  "settings.section.team": "Team & Rollen",
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
