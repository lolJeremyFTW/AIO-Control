import { notFound, redirect } from "next/navigation";

import {
  getCurrentUser,
  getWorkspaceBySlug,
} from "../../../../../../lib/auth/workspace";
import {
  listBusinesses,
  findBusiness,
} from "../../../../../../lib/queries/businesses";
import { createSupabaseServerClient } from "../../../../../../lib/supabase/server";

type Props = {
  params: Promise<{ workspace_slug: string; bizId: string; tabId: string }>;
};

export default async function CustomTabPage({ params }: Props) {
  const { workspace_slug, bizId, tabId } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const workspace = await getWorkspaceBySlug(workspace_slug);
  if (!workspace) notFound();

  const businesses = await listBusinesses(workspace.id);
  const biz = findBusiness(businesses, bizId);
  if (!biz) notFound();

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("custom_tabs")
    .select("label, url")
    .eq("id", tabId)
    .eq("business_id", biz.id)
    .maybeSingle();

  if (!data) notFound();

  return (
    <iframe
      src={data.url}
      title={data.label}
      style={{
        width: "100%",
        height: "calc(100vh - 130px)",
        border: "none",
        borderRadius: 10,
      }}
      allow="fullscreen"
    />
  );
}
