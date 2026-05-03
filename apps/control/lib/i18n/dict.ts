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

  "nav.profile": "Profile",
  "nav.settings": "Settings",
  "nav.signOut": "Sign out",
  "nav.newBusiness": "New business",
  "nav.newTopic": "Nieuw topic",
  "nav.allBusinesses": "All businesses",

  "rail.empty": "Geen businesses nog",

  "topic.queue": "Wachtrij",
  "topic.agents": "Agents",
  "topic.schedules": "Schedules",
  "topic.integrations": "Integrations",

  "dashboard.title": "{workspace} — overzicht",
  "dashboard.sub": "Marge per business · auto + HITL",
  "dashboard.empty.title": "Maak je eerste business →",
  "dashboard.empty.body":
    "Hier verschijnen straks je automated mini-businesses. Maak er één aan om door te gaan.",
  "dashboard.queueEmpty.title": "Lege wachtrij ✓",
  "dashboard.queueEmpty.body":
    "Geen items te reviewen. Zodra een agent iets oppakt verschijnt het hier.",

  "kpi.margin": "MARGE 30D",
  "kpi.revenue": "REVENUE",
  "kpi.cost": "AI KOSTEN",
  "kpi.runs24h": "{count} runs · 24u",

  "settings.title": "Settings",
  "settings.section.general": "General",
  "settings.section.notifications": "Notifications",
  "settings.section.team": "Team & roles",
  "settings.section.danger": "Danger zone",
  "settings.section.appearance": "Appearance",
  "settings.section.language": "Taal",
  "settings.lang.desc":
    "Kies je interface-taal. Wijzigt direct na het submitten.",

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

  "profile.title": "Profile",
  "profile.sub": "Account · voorkeuren · sessions",
  "profile.section.identity": "Identiteit",
  "profile.section.identity.desc": "Naam en avatar zoals anderen je zien.",
  "profile.section.account": "Account",
  "profile.section.account.desc": "Email + wachtwoord van je login.",
  "profile.section.contact": "Contact + facturatie",
  "profile.section.contact.desc":
    "Adres, telefoon, KvK-nummer en BTW-ID. Wordt gebruikt voor facturen en GDPR-correspondentie. Allemaal optioneel.",
  "profile.section.prefs": "Voorkeuren",
  "profile.section.prefs.desc": "Tijdzone + interface taal.",
  "profile.section.history": "Login history",
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
  "profile.security.signOutAll": "Sign out everywhere",
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

  "topic.queue": "Queue",
  "topic.agents": "Agents",
  "topic.schedules": "Schedules",
  "topic.integrations": "Integrations",

  "dashboard.title": "{workspace} — overview",
  "dashboard.sub": "Margin per business · auto + HITL",
  "dashboard.empty.title": "Create your first business →",
  "dashboard.empty.body":
    "Your automated mini-businesses will show up here. Create one to continue.",
  "dashboard.queueEmpty.title": "Empty queue ✓",
  "dashboard.queueEmpty.body":
    "Nothing to review. As soon as an agent picks something up it'll show up here.",

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

  "topic.queue": "Warteschlange",
  "topic.agents": "Agents",
  "topic.schedules": "Zeitpläne",
  "topic.integrations": "Integrationen",

  "dashboard.title": "{workspace} — Übersicht",
  "dashboard.sub": "Marge pro Business · auto + HITL",
  "dashboard.empty.title": "Erstes Business anlegen →",
  "dashboard.empty.body":
    "Hier landen deine automatisierten Mini-Businesses. Erstelle eins, um loszulegen.",
  "dashboard.queueEmpty.title": "Warteschlange leer ✓",
  "dashboard.queueEmpty.body":
    "Nichts zum Prüfen. Sobald ein Agent etwas aufnimmt, erscheint es hier.",

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
  "nav.newBusiness": "Neues Business",
  "nav.newTopic": "Neues Topic",

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
