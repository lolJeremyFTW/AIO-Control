import { redirect } from "next/navigation";

type Props = { params: Promise<{ workspace_slug: string }> };

export default async function IntegrationsSettingsRedirect({ params }: Props) {
  const { workspace_slug } = await params;
  redirect(`/${workspace_slug}/settings/workspace#integrations`);
}
