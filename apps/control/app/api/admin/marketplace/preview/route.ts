// Preview a catalog source — runs the importer + returns the items
// without writing to the DB. The actual import is the
// importMarketplaceItems server action triggered from the admin UI.
//
// Auth: any owner/admin of any workspace can preview. The fetch
// itself runs server-side so the catalog hosts don't see user IPs.

import { NextResponse } from "next/server";

import { getSourceItems } from "../../../../../lib/marketplace/importers";
import { createSupabaseServerClient } from "../../../../../lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { data: roles } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("user_id", user.id)
    .in("role", ["owner", "admin"])
    .limit(1);
  if (!roles || roles.length === 0) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const sourceId = url.searchParams.get("source");
  if (!sourceId) {
    return NextResponse.json({ error: "source required" }, { status: 400 });
  }

  const items = await getSourceItems(sourceId);
  return NextResponse.json({ items });
}
