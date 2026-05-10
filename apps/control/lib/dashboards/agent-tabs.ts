import { createSupabaseServerClient } from "../supabase/server";

export type AgentDashboardTab = {
  id: string;
  label: string;
  slug: string;
  html: string;
};

export function dashboardSlugFromUrl(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const internalRef = trimmed.match(/^aio-dashboard:([A-Za-z0-9_-]+)$/);
  if (internalRef?.[1]) return internalRef[1];

  try {
    const parsed = new URL(trimmed, "https://aio.local");
    const path = parsed.pathname.startsWith("/aio/d/")
      ? parsed.pathname.slice(4)
      : parsed.pathname;
    const match = path.match(/^\/d\/([A-Za-z0-9_-]+)$/);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

export function dashboardFragmentFromHtml(html: string): string {
  const body = html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? html;
  return body
    .replace(
      /<script>\(function\(\)\{try\{var t=localStorage\.getItem\('aio-theme'\)[\s\S]*?<\/script>/i,
      "",
    )
    .replace(/<!doctype[^>]*>/gi, "")
    .replace(/<\/?(html|head|body)\b[^>]*>/gi, "")
    .trim();
}

export async function getAgentDashboardForTabUrl(
  url: string,
  input: { workspaceId: string; businessId: string },
): Promise<AgentDashboardTab | null> {
  const slug = dashboardSlugFromUrl(url);
  if (!slug) return null;

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("agent_dashboards")
    .select("id, label, slug, html_content")
    .eq("workspace_id", input.workspaceId)
    .eq("business_id", input.businessId)
    .eq("slug", slug)
    .maybeSingle();

  if (!data) return null;
  return {
    id: data.id as string,
    label: data.label as string,
    slug: data.slug as string,
    html: dashboardFragmentFromHtml(data.html_content as string),
  };
}
