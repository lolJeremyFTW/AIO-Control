// Workspace membership actions — invite by email, remove, change role.
// Phase 1's RLS only lets owners + admins write workspace_members, so the
// server-action call already gates on that via the user's session client
// (no service-role key is needed).
//
// Invite flow: we look up an existing profile by email. If we find one,
// we add the workspace_members row directly. If not, we surface a
// "user has not signed up yet" error (gotrue admin email invites need
// SMTP, which we don't have in self-hosted Supabase yet).

"use server";

import { revalidatePath } from "next/cache";

import { createSupabaseServerClient } from "../../lib/supabase/server";

export type Role = "owner" | "admin" | "editor" | "viewer";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

export async function inviteWorkspaceMember(input: {
  workspace_slug: string;
  workspace_id: string;
  email: string;
  role: Role;
}): Promise<ActionResult<{ user_id: string }>> {
  const email = input.email.trim().toLowerCase();
  if (!email || !email.includes("@")) {
    return { ok: false, error: "Vul een geldig e-mailadres in." };
  }

  const supabase = await createSupabaseServerClient();

  // Look up the target profile. RLS only lets us see profiles in our own
  // workspaces or our own profile, so a non-member's profile may be
  // invisible — we use the auth-table-aware RPC from migration 006 to
  // resolve email → user id without exposing more than we need.
  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("id")
    .eq("email", email)
    .maybeSingle();
  if (profileErr) return { ok: false, error: profileErr.message };
  if (!profile) {
    return {
      ok: false,
      error:
        "Deze gebruiker heeft nog geen account. Stuur ze een signup-link " +
        "(https://tromptech.life/aio/signup) en herhaal daarna.",
    };
  }

  const { error } = await supabase.from("workspace_members").upsert(
    {
      workspace_id: input.workspace_id,
      user_id: profile.id,
      role: input.role,
    },
    { onConflict: "workspace_id,user_id" },
  );
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/${input.workspace_slug}/settings`);
  return { ok: true, data: { user_id: profile.id } };
}

export async function removeWorkspaceMember(input: {
  workspace_slug: string;
  workspace_id: string;
  user_id: string;
}): Promise<ActionResult<null>> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("workspace_members")
    .delete()
    .eq("workspace_id", input.workspace_id)
    .eq("user_id", input.user_id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/${input.workspace_slug}/settings`);
  return { ok: true, data: null };
}

export async function updateWorkspaceMemberRole(input: {
  workspace_slug: string;
  workspace_id: string;
  user_id: string;
  role: Role;
}): Promise<ActionResult<null>> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("workspace_members")
    .update({ role: input.role })
    .eq("workspace_id", input.workspace_id)
    .eq("user_id", input.user_id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/${input.workspace_slug}/settings`);
  return { ok: true, data: null };
}
