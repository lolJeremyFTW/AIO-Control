import "server-only";

import { getServiceRoleSupabase } from "../supabase/service";

const ACTIVITY_LOOKBACK_DAYS = 30;

export type AdminUserWorkspace = {
  id: string;
  slug: string;
  name: string;
  role: string;
  joined_at: string | null;
};

export type AdminUserActivity = {
  id: string;
  display_name: string;
  email: string;
  is_admin: boolean;
  created_at: string;
  workspaces: AdminUserWorkspace[];
  login_count_30d: number;
  last_login: {
    created_at: string;
    device_label: string | null;
    ip_address: string | null;
    method: string;
  } | null;
  audit_count_30d: number;
  run_start_count_30d: number;
  last_activity_at: string | null;
};

export type AdminUsersActivityResult =
  | { authorized: false }
  | {
      authorized: true;
      since_iso: string;
      users: AdminUserActivity[];
      totals: {
        users: number;
        admins: number;
        workspaces: number;
        logins_30d: number;
        audits_30d: number;
        run_starts_30d: number;
      };
    };

type ProfileRow = {
  id: string;
  display_name: string | null;
  email: string | null;
  is_admin: boolean | null;
  created_at: string | null;
};

type MembershipRow = {
  user_id: string;
  role: string;
  joined_at: string | null;
  workspaces:
    | {
        id: string;
        slug: string;
        name: string;
      }
    | Array<{
        id: string;
        slug: string;
        name: string;
      }>
    | null;
};

type LatestLoginRow = {
  created_at: string;
  device_label: string | null;
  ip_address: string | null;
  method: string;
};

type LatestAuditRow = {
  created_at: string;
};

export async function getAdminUsersActivity(
  viewerUserId: string,
): Promise<AdminUsersActivityResult> {
  const supabase = getServiceRoleSupabase();

  const { data: viewer, error: viewerError } = await supabase
    .from("profiles")
    .select("id, is_admin")
    .eq("id", viewerUserId)
    .maybeSingle();

  if (viewerError || !viewer?.is_admin) {
    return { authorized: false };
  }

  const sinceIso = new Date(
    Date.now() - ACTIVITY_LOOKBACK_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  const [{ data: profiles }, { data: memberships }, { count: workspaceCount }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("id, display_name, email, is_admin, created_at")
        .order("display_name", { ascending: true }),
      supabase
        .from("workspace_members")
        .select(
          "user_id, role, joined_at, workspaces:workspace_id(id, slug, name)",
        )
        .order("joined_at", { ascending: false }),
      supabase
        .from("workspaces")
        .select("id", { count: "exact", head: true }),
    ]);

  const workspacesByUser = new Map<string, AdminUserWorkspace[]>();
  for (const row of (memberships ?? []) as MembershipRow[]) {
    const workspace = Array.isArray(row.workspaces)
      ? row.workspaces[0]
      : row.workspaces;
    if (!workspace) continue;

    const current = workspacesByUser.get(row.user_id) ?? [];
    current.push({
      id: workspace.id,
      slug: workspace.slug,
      name: workspace.name,
      role: row.role,
      joined_at: row.joined_at,
    });
    workspacesByUser.set(row.user_id, current);
  }

  const users = await Promise.all(
    ((profiles ?? []) as ProfileRow[]).map(async (profile) => {
      const [
        { count: loginCount },
        { data: lastLogin },
        { count: auditCount },
        { count: runStartCount },
        { data: lastAudit },
      ] = await Promise.all([
        supabase
          .from("login_events")
          .select("id", { count: "exact", head: true })
          .eq("user_id", profile.id)
          .gte("created_at", sinceIso),
        supabase
          .from("login_events")
          .select("created_at, device_label, ip_address, method")
          .eq("user_id", profile.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("audit_logs")
          .select("id", { count: "exact", head: true })
          .eq("actor_id", profile.id)
          .gte("created_at", sinceIso),
        supabase
          .from("audit_logs")
          .select("id", { count: "exact", head: true })
          .eq("actor_id", profile.id)
          .eq("resource_table", "runs")
          .eq("action", "INSERT")
          .gte("created_at", sinceIso),
        supabase
          .from("audit_logs")
          .select("created_at")
          .eq("actor_id", profile.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      const typedLastLogin = (lastLogin ?? null) as LatestLoginRow | null;
      const typedLastAudit = (lastAudit ?? null) as LatestAuditRow | null;

      return {
        id: profile.id,
        display_name: profile.display_name ?? "(unnamed user)",
        email: profile.email ?? "",
        is_admin: Boolean(profile.is_admin),
        created_at: profile.created_at ?? "",
        workspaces: workspacesByUser.get(profile.id) ?? [],
        login_count_30d: loginCount ?? 0,
        last_login: typedLastLogin,
        audit_count_30d: auditCount ?? 0,
        run_start_count_30d: runStartCount ?? 0,
        last_activity_at: latestTimestamp([
          typedLastLogin?.created_at ?? null,
          typedLastAudit?.created_at ?? null,
        ]),
      } satisfies AdminUserActivity;
    }),
  );

  const sortedUsers = users.sort((a, b) => {
    if (a.is_admin !== b.is_admin) return a.is_admin ? -1 : 1;
    const aActivity = a.last_activity_at ?? a.created_at;
    const bActivity = b.last_activity_at ?? b.created_at;
    return bActivity.localeCompare(aActivity);
  });

  return {
    authorized: true,
    since_iso: sinceIso,
    users: sortedUsers,
    totals: {
      users: sortedUsers.length,
      admins: sortedUsers.filter((user) => user.is_admin).length,
      workspaces: workspaceCount ?? 0,
      logins_30d: sortedUsers.reduce(
        (sum, user) => sum + user.login_count_30d,
        0,
      ),
      audits_30d: sortedUsers.reduce(
        (sum, user) => sum + user.audit_count_30d,
        0,
      ),
      run_starts_30d: sortedUsers.reduce(
        (sum, user) => sum + user.run_start_count_30d,
        0,
      ),
    },
  };
}

function latestTimestamp(values: Array<string | null>): string | null {
  const sorted = values
    .filter((value): value is string => Boolean(value))
    .sort((a, b) => b.localeCompare(a));
  return sorted[0] ?? null;
}
