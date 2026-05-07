import { NextResponse } from "next/server";

import { resolveCodexCredential } from "../../../../../lib/openai-codex/oauth";
import { createSupabaseServerClient } from "../../../../../lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const workspaceId = new URL(req.url).searchParams.get("workspace_id");
  if (!workspaceId) {
    return NextResponse.json({ error: "workspace_id is required" }, { status: 400 });
  }

  const { data: member } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("workspace_id", workspaceId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!member) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const credential = await resolveCodexCredential({
    workspaceId,
    ownerUserId: user.id,
  }).catch(() => null);

  return NextResponse.json({
    connected: !!credential,
    account_id: credential?.payload.account_id ?? null,
    expires_at: credential?.payload.expires_at ?? null,
    plan_type: credential?.payload.plan_type ?? null,
  });
}
