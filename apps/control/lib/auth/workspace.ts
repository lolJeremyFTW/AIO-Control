// Server-side helpers for resolving the current user + workspace.
// Used by layouts and pages — never imported into client components.

import "server-only";

import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "../supabase/server";

export async function getCurrentUser() {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    // Allow dev preview to render setup hints when Supabase env isn't wired.
    return null;
  }
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export type WorkspaceListItem = {
  id: string;
  slug: string;
  name: string;
  role: "owner" | "admin" | "editor" | "viewer";
};

export async function getUserWorkspaces(): Promise<WorkspaceListItem[]> {
  const supabase = await createSupabaseServerClient();
  // RLS on workspace_members ensures we only get rows the user can see.
  const { data, error } = await supabase
    .from("workspace_members")
    .select("role, workspaces!inner(id, slug, name)")
    .order("joined_at", { ascending: true });

  if (error) {
    console.error("getUserWorkspaces failed", error);
    return [];
  }

  type Row = {
    role: WorkspaceListItem["role"];
    workspaces: { id: string; slug: string; name: string };
  };

  return (data as unknown as Row[]).map((r) => ({
    id: r.workspaces.id,
    slug: r.workspaces.slug,
    name: r.workspaces.name,
    role: r.role,
  }));
}

export async function getWorkspaceBySlug(slug: string) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("workspaces")
    .select("id, slug, name, owner_id")
    .eq("slug", slug)
    .maybeSingle();
  return data;
}

export async function getProfile(userId: string) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("profiles")
    .select(
      "id, display_name, email, avatar_letter, avatar_variant, avatar_url, timezone, is_admin",
    )
    .eq("id", userId)
    .maybeSingle();
  return data;
}
