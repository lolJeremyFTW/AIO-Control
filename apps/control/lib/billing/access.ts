import "server-only";

import { createSupabaseServerClient } from "../supabase/server";

export type BillingAccess = {
  userId: string;
  role: "owner" | "admin" | "editor" | "viewer" | null;
  isGlobalAdmin: boolean;
  profile: {
    id: string;
    email: string | null;
    display_name: string | null;
    company_name?: string | null;
    tax_id?: string | null;
  };
};

export type BillingAccessResult =
  | { ok: true; access: BillingAccess }
  | { ok: false; status: number; error: string };

export async function requireBillingAccess(
  workspaceId: string,
  options: { write?: boolean; globalAdmin?: boolean } = {},
): Promise<BillingAccessResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, status: 401, error: "Unauthorized" };

  const [{ data: profile }, { data: member }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, email, display_name, is_admin, company_name, tax_id")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", workspaceId)
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  const isGlobalAdmin = Boolean(
    (profile as { is_admin?: boolean | null } | null)?.is_admin,
  );
  const role = ((member as { role?: BillingAccess["role"] } | null)?.role ??
    null) as BillingAccess["role"];

  if (options.globalAdmin && !isGlobalAdmin) {
    return { ok: false, status: 403, error: "Global admin required" };
  }

  if (!role && !isGlobalAdmin) {
    return { ok: false, status: 403, error: "Workspace access required" };
  }

  if (options.write && !isGlobalAdmin && role !== "owner" && role !== "admin") {
    return {
      ok: false,
      status: 403,
      error: "Only workspace owners/admins can change billing settings",
    };
  }

  return {
    ok: true,
    access: {
      userId: user.id,
      role,
      isGlobalAdmin,
      profile: {
        id: user.id,
        email: (profile as { email?: string | null } | null)?.email ?? null,
        display_name:
          (profile as { display_name?: string | null } | null)?.display_name ??
          null,
        company_name:
          (profile as { company_name?: string | null } | null)?.company_name ??
          null,
        tax_id: (profile as { tax_id?: string | null } | null)?.tax_id ?? null,
      },
    },
  };
}
