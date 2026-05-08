// Integrations are managed from workspace settings now. Keep this old
// business-scoped URL as a soft redirect so existing bookmarks do not 404.

import { redirect } from "next/navigation";

type Props = {
  params: Promise<{ workspace_slug: string; bizId: string }>;
};

export default async function BusinessIntegrationsPage({ params }: Props) {
  const { workspace_slug } = await params;
  redirect(`/${workspace_slug}/settings/workspace#integrations`);
}
