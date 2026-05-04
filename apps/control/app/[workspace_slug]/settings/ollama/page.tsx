// /[ws]/settings/ollama → /[ws]/settings/providers
//
// Ollama configuration is part of the Providers onboarding card now;
// keeping a separate route doubled the surface and confused users about
// which one was canonical. We keep the URL alive (deep-links / bookmarks)
// by redirecting it.

import { redirect } from "next/navigation";

type Props = { params: Promise<{ workspace_slug: string }> };

export default async function OllamaSettingsPage({ params }: Props) {
  const { workspace_slug } = await params;
  redirect(`/${workspace_slug}/settings/providers`);
}
