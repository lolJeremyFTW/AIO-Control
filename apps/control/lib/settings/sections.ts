// Single source of truth for the /[ws]/settings sidebar. Used by:
//   - the SettingsSidebar client component (rendering)
//   - the /settings layout (link generation)
//   - the /settings root page (redirect target - first entry)
//
// Older granular routes still exist as redirects. The visible settings IA
// keeps the fuller pages, but exposes a handful of high-signal sidebar
// entries that deep-link to the relevant section inside those pages.

export type SettingsSectionId =
  | "workspace"
  | "team"
  | "integrations"
  | "ai"
  | "api-keys"
  | "mcp-tools"
  | "notifications"
  | "billing"
  | "danger";

export type SettingsGroup = "main" | "danger";

export type SettingsSection = {
  id: SettingsSectionId;
  labelKey: string;
  /** Description shown in the sub-page header + the index card. */
  descKey: string;
  /** Visual sidebar grouping. */
  group: SettingsGroup;
  /** Route segment for the fuller settings page this entry belongs to. */
  path: "workspace" | "ai" | "notifications" | "billing" | "danger";
  /** Optional in-page section target for entries that live on a fuller page. */
  hash?: string;
  /** When set, the sidebar shows a small marker so destructive sections stand out. */
  badge?: "danger";
};

export const SETTINGS_GROUP_LABELS: Record<SettingsGroup, string> = {
  main: "Settings",
  danger: "Gevarenzone",
};

export const SETTINGS_GROUP_ORDER: SettingsGroup[] = ["main", "danger"];

export const SETTINGS_SECTIONS: SettingsSection[] = [
  {
    id: "workspace",
    labelKey: "settings.section.workspace",
    descKey: "settings.section.workspace.desc",
    group: "main",
    path: "workspace",
  },
  {
    id: "team",
    labelKey: "settings.section.team",
    descKey: "settings.section.team.desc",
    group: "main",
    path: "workspace",
    hash: "team",
  },
  {
    id: "integrations",
    labelKey: "settings.section.integrations",
    descKey: "settings.section.integrations.desc",
    group: "main",
    path: "workspace",
    hash: "integrations",
  },
  {
    id: "ai",
    labelKey: "settings.section.ai",
    descKey: "settings.section.ai.desc",
    group: "main",
    path: "ai",
  },
  {
    id: "api-keys",
    labelKey: "settings.section.apiKeys",
    descKey: "settings.section.apiKeys.desc",
    group: "main",
    path: "ai",
    hash: "api-keys",
  },
  {
    id: "mcp-tools",
    labelKey: "settings.section.mcpTools",
    descKey: "settings.section.mcpTools.desc",
    group: "main",
    path: "ai",
    hash: "mcp-tools",
  },
  {
    id: "notifications",
    labelKey: "settings.section.notifications",
    descKey: "settings.section.notifications.desc",
    group: "main",
    path: "notifications",
  },
  {
    id: "billing",
    labelKey: "settings.section.billing",
    descKey: "settings.section.billing.desc",
    group: "main",
    path: "billing",
  },
  {
    id: "danger",
    labelKey: "settings.section.danger",
    descKey: "settings.section.danger.desc",
    group: "danger",
    path: "danger",
    badge: "danger",
  },
];

/** First section - the redirect target for /settings root. */
export const SETTINGS_DEFAULT_SECTION: SettingsSectionId = "workspace";
