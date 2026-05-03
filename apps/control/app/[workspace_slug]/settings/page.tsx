// /[ws]/settings — root entry. The settings UI now lives in dedicated
// sub-pages (one route per section). The root just bounces to the
// first section so old bookmarks + the rail's "Settings" rail-row keep
// working.

import { redirect } from "next/navigation";

import { SETTINGS_DEFAULT_SECTION } from "../../../lib/settings/sections";

type Props = { params: Promise<{ workspace_slug: string }> };

export default async function SettingsRedirect({ params }: Props) {
  const { workspace_slug } = await params;
  redirect(`/${workspace_slug}/settings/${SETTINGS_DEFAULT_SECTION}`);
}
