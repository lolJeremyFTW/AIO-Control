// Workspace members + their joined profile info. RLS already restricts
// reads to fellow members, so this query Just Works as long as the caller
// is signed in.

import "server-only";

import { createSupabaseServerClient } from "../supabase/server";

export type MemberRow = {
  user_id: string;
  role: "owner" | "admin" | "editor" | "viewer";
  display_name: string | null;
  email: string | null;
};

export async function listWorkspaceMembers(
  workspaceId: string,
): Promise<MemberRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("workspace_members")
    .select("role, user_id, profiles:user_id(display_name, email)")
    .eq("workspace_id", workspaceId)
    .order("joined_at", { ascending: true });
  if (error) {
    console.error("listWorkspaceMembers failed", error);
    return [];
  }
  type Row = {
    role: MemberRow["role"];
    user_id: string;
    profiles: { display_name: string | null; email: string | null } | null;
  };
  return (data as unknown as Row[]).map((r) => ({
    user_id: r.user_id,
    role: r.role,
    display_name: r.profiles?.display_name ?? null,
    email: r.profiles?.email ?? null,
  }));
}
