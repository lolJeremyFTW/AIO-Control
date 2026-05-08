// Single source of truth for the /[ws]/settings sidebar. Used by:
//   - the SettingsSidebar client component (rendering)
//   - the /settings layout (link generation)
//   - the /settings root page (redirect target - first entry)
//
// Older granular routes still exist as redirects, but the visible
// settings IA is intentionally consolidated into a few fuller pages.

export type SettingsSectionId =
  | "workspace"
  | "ai"
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
  },
  {
    id: "ai",
    labelKey: "settings.section.ai",
    descKey: "settings.section.ai.desc",
    group: "main",
  },
  {
    id: "notifications",
    labelKey: "settings.section.notifications",
    descKey: "settings.section.notifications.desc",
    group: "main",
  },
  {
    id: "billing",
    labelKey: "settings.section.billing",
    descKey: "settings.section.billing.desc",
    group: "main",
  },
  {
    id: "danger",
    labelKey: "settings.section.danger",
    descKey: "settings.section.danger.desc",
    group: "danger",
    badge: "danger",
  },
];

/** First section - the redirect target for /settings root. */
export const SETTINGS_DEFAULT_SECTION: SettingsSectionId = "workspace";
