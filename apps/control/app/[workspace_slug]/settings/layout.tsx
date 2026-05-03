// Shared layout for every /[ws]/settings/* sub-page. Renders the page
// title row + the sidebar + a slot for the active section's content.
// We split each section into its own route file so the URL is the
// canonical address (/settings/telegram, /settings/api-keys, …) — no
// more giant scroll-page with anchor links.

import { notFound, redirect } from "next/navigation";

import {
  getCurrentUser,
  getWorkspaceBySlug,
} from "../../../lib/auth/workspace";
import { getDict } from "../../../lib/i18n/server";
import { SettingsSidebar } from "../../../components/SettingsSidebar";

type Props = {
  children: React.ReactNode;
  params: Promise<{ workspace_slug: string }>;
};

export default async function SettingsLayout({ children, params }: Props) {
  const { workspace_slug } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const workspace = await getWorkspaceBySlug(workspace_slug);
  if (!workspace) notFound();

  const { locale } = await getDict();

  // No global "Settings" page-title — every sub-page renders its
  // own h1 + sub (same pattern as the existing /settings/talk and
  // /settings/subscription pages). The layout only owns the sidebar
  // + the grid that hosts the section content.

  return (
    <div className="content">
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "240px 1fr",
          gap: 28,
          alignItems: "start",
        }}
      >
        <SettingsSidebar workspaceSlug={workspace.slug} locale={locale} />

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {children}
        </div>
      </div>
    </div>
  );
}
