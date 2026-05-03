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
import { getDict } from "../../../lib/i18n/server";

type Props = { params: Promise<{ workspace_slug: string }> };

export default async function ProfilePage({ params }: Props) {
  const { workspace_slug } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [profile, workspace, dict] = await Promise.all([
    getProfile(user.id),
    getWorkspaceBySlug(workspace_slug),
    getDict(),
  ]);
  if (!profile) redirect("/login");
  if (!workspace) notFound();
  const { locale, t } = dict;

  return (
    <div className="content">
      <div className="page-title-row">
        <h1>{t("profile.title")}</h1>
        <span className="sub">{t("profile.sub")}</span>
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
          phone: (profile as { phone?: string | null }).phone ?? null,
          address_line1:
            (profile as { address_line1?: string | null }).address_line1 ??
            null,
          address_line2:
            (profile as { address_line2?: string | null }).address_line2 ??
            null,
          postal_code:
            (profile as { postal_code?: string | null }).postal_code ?? null,
          city: (profile as { city?: string | null }).city ?? null,
          country: (profile as { country?: string | null }).country ?? null,
          company_name:
            (profile as { company_name?: string | null }).company_name ?? null,
          business_number:
            (profile as { business_number?: string | null }).business_number ??
            null,
          tax_id: (profile as { tax_id?: string | null }).tax_id ?? null,
        }}
        workspaceId={workspace.id}
        uploadWorkspaceId={workspace.id}
        currentLocale={locale}
      />
    </div>
  );
}
