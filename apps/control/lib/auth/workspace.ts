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

// Columns from migrations 001 + 026 + 032. The address/phone/company
// block is GDPR + invoicing data set on the profile page; everything
// is nullable. NB: Supabase's parser typing only kicks in on a single
// string literal — string concatenation collapses it to GenericString-
// Error and we lose the typed columns. Keep this on one line.
const PROFILE_COLUMNS =
  "id, display_name, email, avatar_letter, avatar_variant, avatar_url, timezone, is_admin, phone, address_line1, address_line2, postal_code, city, country, company_name, business_number, tax_id";

export async function getProfile(userId: string) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .eq("id", userId)
    .maybeSingle();
  return data;
}
