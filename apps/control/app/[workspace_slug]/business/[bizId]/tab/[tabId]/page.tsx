import { notFound } from "next/navigation";
import { getServiceRoleSupabase } from "../../../../../../lib/supabase/service";

type Props = {
  params: Promise<{ workspace_slug: string; bizId: string; tabId: string }>;
};

export default async function CustomTabPage({ params }: Props) {
  const { bizId, tabId } = await params;

  const supabase = getServiceRoleSupabase();
  const { data } = await supabase
    .from("custom_tabs")
    .select("label, url")
    .eq("id", tabId)
    .eq("business_id", bizId)
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
