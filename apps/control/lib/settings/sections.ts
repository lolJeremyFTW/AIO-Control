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

export type SettingsSection = {
  id: SettingsSectionId;
  labelKey: string;
  /** Description shown in the sub-page header + the index card. */
  descKey: string;
  /** When set, the sidebar shows a small marker (e.g. red triangle
   *  for the danger zone) so destructive sections stand out. */
  badge?: "danger";
};

export const SETTINGS_SECTIONS: SettingsSection[] = [
  {
    id: "general",
    labelKey: "settings.section.general",
    descKey: "settings.section.general.desc",
  },
  {
    id: "agent-defaults",
    labelKey: "settings.section.agentDefaults",
    descKey: "settings.section.agentDefaults.desc",
  },
  {
    id: "weather",
    labelKey: "settings.section.weather",
    descKey: "settings.section.weather.desc",
  },
  {
    id: "ollama",
    labelKey: "settings.section.ollama",
    descKey: "settings.section.ollama.desc",
  },
  {
    id: "providers",
    labelKey: "settings.section.providers",
    descKey: "settings.section.providers.desc",
  },
  {
    id: "api-keys",
    labelKey: "settings.section.apiKeys",
    descKey: "settings.section.apiKeys.desc",
  },
  {
    id: "spend-limits",
    labelKey: "settings.section.spendLimits",
    descKey: "settings.section.spendLimits.desc",
  },
  {
    id: "telegram",
    labelKey: "settings.section.telegram",
    descKey: "settings.section.telegram.desc",
  },
  {
    id: "email",
    labelKey: "settings.section.email",
    descKey: "settings.section.email.desc",
  },
  {
    id: "custom-integrations",
    labelKey: "settings.section.customIntegrations",
    descKey: "settings.section.customIntegrations.desc",
  },
  {
    id: "notifications",
    labelKey: "settings.section.notifications",
    descKey: "settings.section.notifs.desc",
  },
  {
    id: "team",
    labelKey: "settings.section.team",
    descKey: "settings.section.team.desc",
  },
  {
    id: "talk",
    labelKey: "settings.section.talk",
    descKey: "page.talk.sub",
  },
  {
    id: "subscription",
    labelKey: "settings.section.subscription",
    descKey: "settings.section.subscription.desc",
  },
  {
    id: "danger",
    labelKey: "settings.section.danger",
    descKey: "settings.section.danger.desc",
    badge: "danger",
  },
];

/** First section — the redirect target for /settings root. */
export const SETTINGS_DEFAULT_SECTION: SettingsSectionId = "general";
