// Single source of truth for the /[ws]/settings sidebar. Used by:
//   - the SettingsSidebar client component (rendering)
//   - the /settings layout (link generation)
//   - the /settings root page (redirect target — first entry)
//
// Each entry maps an id to a translation key. The id doubles as the
// route segment (e.g. id "agent-defaults" → /settings/agent-defaults).

export type SettingsSectionId =
  | "general"
  | "agent-defaults"
  | "weather"
  | "ollama"
  | "api-keys"
  | "spend-limits"
  | "telegram"
  | "email"
  | "custom-integrations"
  | "notifications"
  | "team"
  | "talk"
  | "subscription"
  | "providers"
  | "danger";

export type SettingsGroup = "workspace" | "ai" | "notif" | "money" | "danger";

export type SettingsSection = {
  id: SettingsSectionId;
  labelKey: string;
  /** Description shown in the sub-page header + the index card. */
  descKey: string;
  /** Visual sidebar grouping — keeps the sub-pages discoverable without
   *  exploding into a flat 15-item list. Routes themselves stay flat. */
  group: SettingsGroup;
  /** When set, the sidebar shows a small marker (e.g. red triangle
   *  for the danger zone) so destructive sections stand out. */
  badge?: "danger";
};

export const SETTINGS_GROUP_LABELS: Record<SettingsGroup, string> = {
  workspace: "Workspace",
  ai: "AI & Modellen",
  notif: "Notificaties",
  money: "Geld & Plan",
  danger: "Gevarenzone",
};

export const SETTINGS_GROUP_ORDER: SettingsGroup[] = [
  "workspace",
  "ai",
  "notif",
  "money",
  "danger",
];

export const SETTINGS_SECTIONS: SettingsSection[] = [
  // ── Workspace ────────────────────────────────────────────────────
  {
    id: "general",
    labelKey: "settings.section.general",
    descKey: "settings.section.general.desc",
    group: "workspace",
  },
  {
    id: "team",
    labelKey: "settings.section.team",
    descKey: "settings.section.team.desc",
    group: "workspace",
  },
  {
    id: "weather",
    labelKey: "settings.section.weather",
    descKey: "settings.section.weather.desc",
    group: "workspace",
  },
  {
    id: "talk",
    labelKey: "settings.section.talk",
    descKey: "page.talk.sub",
    group: "workspace",
  },

  // ── AI & Modellen ────────────────────────────────────────────────
  {
    id: "agent-defaults",
    labelKey: "settings.section.agentDefaults",
    descKey: "settings.section.agentDefaults.desc",
    group: "ai",
  },
  {
    id: "providers",
    labelKey: "settings.section.providers",
    descKey: "settings.section.providers.desc",
    group: "ai",
  },
  {
    id: "ollama",
    labelKey: "settings.section.ollama",
    descKey: "settings.section.ollama.desc",
    group: "ai",
  },
  {
    id: "api-keys",
    labelKey: "settings.section.apiKeys",
    descKey: "settings.section.apiKeys.desc",
    group: "ai",
  },

  // ── Notificaties ────────────────────────────────────────────────
  {
    id: "telegram",
    labelKey: "settings.section.telegram",
    descKey: "settings.section.telegram.desc",
    group: "notif",
  },
  {
    id: "email",
    labelKey: "settings.section.email",
    descKey: "settings.section.email.desc",
    group: "notif",
  },
  {
    id: "notifications",
    labelKey: "settings.section.notifications",
    descKey: "settings.section.notifs.desc",
    group: "notif",
  },
  {
    id: "custom-integrations",
    labelKey: "settings.section.customIntegrations",
    descKey: "settings.section.customIntegrations.desc",
    group: "notif",
  },

  // ── Geld & Plan ─────────────────────────────────────────────────
  {
    id: "spend-limits",
    labelKey: "settings.section.spendLimits",
    descKey: "settings.section.spendLimits.desc",
    group: "money",
  },
  {
    id: "subscription",
    labelKey: "settings.section.subscription",
    descKey: "settings.section.subscription.desc",
    group: "money",
  },

  // ── Danger ──────────────────────────────────────────────────────
  {
    id: "danger",
    labelKey: "settings.section.danger",
    descKey: "settings.section.danger.desc",
    group: "danger",
    badge: "danger",
  },
];

/** First section — the redirect target for /settings root. */
export const SETTINGS_DEFAULT_SECTION: SettingsSectionId = "general";
