import { notFound, redirect } from "next/navigation";

import {
  getCurrentUser,
  getProfile,
  getWorkspaceBySlug,
} from "../../../../lib/auth/workspace";
import { SettingsSectionCard } from "../../../../components/SettingsSectionCard";
import { ServerFilesBrowser } from "../../../../components/ServerFilesBrowser";

type Props = { params: Promise<{ workspace_slug: string }> };

export default async function ServerFilesSettingsPage({ params }: Props) {
  const { workspace_slug } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [workspace, profile] = await Promise.all([
    getWorkspaceBySlug(workspace_slug),
    getProfile(user.id),
  ]);
  if (!workspace) notFound();
  if (!profile?.is_admin) redirect(`/${workspace.slug}/settings`);

  return (
    <>
      <div className="page-title-row">
        <h1>VPS bestanden</h1>
        <span className="sub">
          Read-only bestandsbrowser voor de server waar AIO Control draait
        </span>
      </div>

      <SettingsSectionCard
        title="VPS bestanden"
        desc="Blader door mappen, bekijk tekstbestanden en download losse bestanden. Bewerken en verwijderen zitten hier bewust niet in."
      >
        <ServerFilesBrowser />
      </SettingsSectionCard>
    </>
  );
}
