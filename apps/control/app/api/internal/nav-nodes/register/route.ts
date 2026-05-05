// Internal API for cron jobs / agents to auto-register a nav_node as a
// child of an existing module. Allows external dashboards and apps built
// by cron runs to appear in the Business → Topics → Modules hierarchy.
//
// Auth: Bearer token must match AGENT_SECRET_KEY env var (timing-safe).
// Upsert mode: when upsert=true and a node with the same parent + name
// already exists, we update its href instead of inserting a duplicate.

import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

import { getServiceRoleSupabase } from "../../../../../lib/supabase/service";

export const dynamic = "force-dynamic";

function safeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export async function POST(req: Request) {
  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : "";
  const expected = process.env.AGENT_SECRET_KEY ?? "";
  if (!expected || !token || !safeEquals(token, expected)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: {
    workspace_id?: string;
    business_id?: string;
    parent_id?: string | null;
    name?: string;
    href?: string;
    icon?: string;
    variant?: string;
    sub?: string;
    upsert?: boolean;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const {
    workspace_id,
    business_id,
    parent_id = null,
    name,
    href,
    icon,
    variant = "slate",
    sub,
    upsert = false,
  } = body;

  if (!workspace_id || !business_id || !name?.trim()) {
    return NextResponse.json(
      { error: "workspace_id, business_id, and name are required" },
      { status: 400 },
    );
  }

  const supabase = getServiceRoleSupabase();

  if (upsert) {
    const existing = await supabase
      .from("nav_nodes")
      .select("id")
      .eq("workspace_id", workspace_id)
      .eq("business_id", business_id)
      .eq("name", name.trim())
      .filter(
        "parent_id",
        parent_id == null ? "is" : "eq",
        parent_id ?? null,
      )
      .is("archived_at", null)
      .maybeSingle();

    if (existing.data) {
      const { error } = await supabase
        .from("nav_nodes")
        .update({ href: href?.trim() || null })
        .eq("id", existing.data.id);
      if (error)
        return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({
        ok: true,
        nav_node_id: existing.data.id,
        action: "updated",
      });
    }
  }

  const letter = (icon ?? name).trim().slice(0, 1).toUpperCase();
  const { data, error } = await supabase
    .from("nav_nodes")
    .insert({
      workspace_id,
      business_id,
      parent_id: parent_id ?? null,
      name: name.trim(),
      letter,
      variant,
      icon: icon?.trim() || null,
      sub: sub?.trim() || null,
      href: href?.trim() || null,
    })
    .select("id")
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? "insert failed" },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, nav_node_id: data.id, action: "created" });
}
