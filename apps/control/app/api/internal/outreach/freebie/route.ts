// Internal API for the outreach cron to register a freshly-generated
// freebie report. Stores the HTML in Supabase, mints a short token,
// and returns the public URL the cron should embed in the lead's
// pitch (`https://aio.tromptech.life/r/[token]`).
//
// Auth: Bearer AGENT_SECRET_KEY (timing-safe).
//
// Idempotent: re-posting for the same (workspace_id, legacy_id)
// updates the row in place — token stays stable so an already-sent
// outreach pitch keeps working after a regeneration.

import { randomBytes, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

import { getServiceRoleSupabase } from "../../../../../lib/supabase/service";

export const dynamic = "force-dynamic";

function safeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

// 11-char URL-safe token. ~65 bits of entropy — collision-free for the
// scale we'll ever hit and short enough to look clean in a pitch.
function mintToken(): string {
  return randomBytes(8).toString("base64url").slice(0, 11);
}

type Body = {
  workspace_id?: string;
  business_id?: string;
  legacy_id?: number;
  lead_name?: string;
  lead_email?: string | null;
  lead_website?: string | null;
  lead_branche?: string | null;
  lead_regio?: string | null;
  html_content?: string;
  score?: number | null;
  angle_scores?: Record<string, number> | null;
};

export async function POST(req: Request) {
  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : "";
  const expected = process.env.AGENT_SECRET_KEY ?? "";
  if (!expected || !token || !safeEquals(token, expected)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const {
    workspace_id,
    business_id,
    legacy_id,
    lead_name,
    lead_email = null,
    lead_website = null,
    lead_branche = null,
    lead_regio = null,
    html_content,
    score = null,
    angle_scores = null,
  } = body;

  if (
    !workspace_id ||
    !business_id ||
    typeof legacy_id !== "number" ||
    !lead_name?.trim() ||
    !html_content?.trim()
  ) {
    return NextResponse.json(
      {
        error:
          "workspace_id, business_id, legacy_id, lead_name, html_content are required",
      },
      { status: 400 },
    );
  }

  if (html_content.length > 500_000) {
    return NextResponse.json(
      { error: "html_content too large (max 500KB)" },
      { status: 413 },
    );
  }

  const supabase = getServiceRoleSupabase();

  // Reuse existing token for stable URLs across regenerations.
  const { data: existing } = await supabase
    .from("outreach_leads")
    .select("id, token")
    .eq("workspace_id", workspace_id)
    .eq("legacy_id", legacy_id)
    .maybeSingle();

  const tokenValue = existing?.token ?? mintToken();

  const upsertRow = {
    workspace_id,
    business_id,
    legacy_id,
    token: tokenValue,
    lead_name: lead_name.trim(),
    lead_email: lead_email?.trim() || null,
    lead_website: lead_website?.trim() || null,
    lead_branche: lead_branche?.trim() || null,
    lead_regio: lead_regio?.trim() || null,
    html_content,
    score,
    angle_scores,
  };

  const { data, error } = await supabase
    .from("outreach_leads")
    .upsert(upsertRow, { onConflict: "workspace_id,legacy_id" })
    .select("id, token")
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? "upsert failed" },
      { status: 500 },
    );
  }

  const origin =
    process.env.NEXT_PUBLIC_TRIGGER_ORIGIN ?? "https://aio.tromptech.life";

  return NextResponse.json({
    ok: true,
    id: data.id,
    token: data.token,
    url: `${origin}/r/${data.token}`,
  });
}
