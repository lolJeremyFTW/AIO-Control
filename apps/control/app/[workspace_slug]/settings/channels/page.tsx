import { redirect } from "next/navigation";

type Props = { params: Promise<{ workspace_slug: string }> };

export default async function ChannelsSettingsRedirect({ params }: Props) {
  const { workspace_slug } = await params;
  redirect(`/${workspace_slug}/settings/notifications#channels`);
}
