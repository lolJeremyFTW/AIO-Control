import { getServiceRoleSupabase } from "../supabase/service";

export type ModuleDashboard = {
  id: string;
  nav_node_id: string;
  workspace_id: string;
  content: string;
  run_id: string | null;
  generated_at: string;
};

export async function getModuleDashboard(
  navNodeId: string,
): Promise<ModuleDashboard | null> {
  const supabase = getServiceRoleSupabase();
  const { data } = await supabase
    .from("module_dashboards")
    .select("id, nav_node_id, workspace_id, content, run_id, generated_at")
    .eq("nav_node_id", navNodeId)
    .maybeSingle();
  return data ?? null;
}
