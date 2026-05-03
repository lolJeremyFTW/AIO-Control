// Profile page — full settings: identity / account / preferences /
// security. Server-renders with the resolved profile + the active
// workspace id (used as the upload-bucket prefix for avatar files).

import { notFound, redirect } from "next/navigation";

import {
  getCurrentUser,
  getProfile,
  getWorkspaceBySlug,
} from "../../../lib/auth/workspace";
import { ProfileEditor } from "../../../components/ProfileEditor";
import { getLocale } from "../../../lib/i18n/server";

type Props = { params: Promise<{ workspace_slug: string }> };

export default async function ProfilePage({ params }: Props) {
  const { workspace_slug } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [profile, workspace, locale] = await Promise.all([
    getProfile(user.id),
    getWorkspaceBySlug(workspace_slug),
    getLocale(),
  ]);
  if (!profile) redirect("/login");
  if (!workspace) notFound();

  return (
    <div className="content">
      <div className="page-title-row">
        <h1>Profile</h1>
        <span className="sub">Account · voorkeuren · sessions</span>
      </div>
      <ProfileEditor
        profile={{
          id: profile.id,
          display_name: profile.display_name,
          email: profile.email ?? user.email ?? null,
          avatar_letter: profile.avatar_letter,
          avatar_variant: profile.avatar_variant,
          avatar_url:
            (profile as { avatar_url?: string | null }).avatar_url ?? null,
          timezone:
            (profile as { timezone?: string | null }).timezone ??
            "Europe/Amsterdam",
          is_admin: profile.is_admin,
        }}
        workspaceId={workspace.id}
        uploadWorkspaceId={workspace.id}
        currentLocale={locale}
      />
    </div>
  );
}
