// Internal API for the IMAP poller (cron on the VPS) to push detected
// reply emails. The poller does the IMAP heavy lifting and sends us
// just the parsed essentials.
//
// Match strategy (in order):
//  1. token in URL — when poller used `reply+[token]@tromptech.nl`
//     aliasing and parsed it from the To: address
//  2. lead_email — fall back to matching on the lead's known email
//
// Auth: Bearer AGENT_SECRET_KEY (same as freebie endpoint).

import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

import { getServiceRoleSupabase } from "../../../../../lib/supabase/service";

export const dynamic = "force-dynamic";

function safeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

type Body = {
  // One of these MUST be supplied so we can find the lead.
  token?: string;
  match_email?: string;
  // Reply payload — all optional but at least one of body/subject expected.
  from_email?: string;
  subject?: string;
  body?: string;
  received_at?: string; // ISO timestamp; defaults to now()
};

export async function POST(req: Request) {
  const authHeader = req.headers.get("authorization") ?? "";
  const auth = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : "";
  const expected = process.env.AGENT_SECRET_KEY ?? "";
  if (!expected || !auth || !safeEquals(auth, expected)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const { token, match_email, from_email, subject, body: replyBody } =
    body;

  if (!token && !match_email) {
    return NextResponse.json(
      { error: "either token or match_email required" },
      { status: 400 },
    );
  }

  const supabase = getServiceRoleSupabase();

  const query = supabase.from("outreach_leads").select("id, responded_at");
  const { data: lead, error: lookupErr } = await (token
    ? query.eq("token", token).maybeSingle()
    : query.ilike("lead_email", match_email!).limit(1).maybeSingle());

  if (lookupErr) {
    return NextResponse.json(
      { error: lookupErr.message },
      { status: 500 },
    );
  }
  if (!lead) {
    // Not an error — IMAP poller may push everything and we just no-op
    // for messages that don't match a tracked lead.
    return NextResponse.json({ ok: true, matched: false });
  }

  // Idempotent — if we've already recorded a reply, keep the first one
  // (the prospect's first response is what matters; later messages are
  // a thread, surface them later via a separate replies table if needed).
  if (lead.responded_at) {
    return NextResponse.json({
      ok: true,
      matched: true,
      duplicate: true,
      id: lead.id,
    });
  }

  const updateRow = {
    responded_at: body.received_at ?? new Date().toISOString(),
    reply_subject: subject?.slice(0, 500) || null,
    reply_body: replyBody?.slice(0, 20_000) || null,
    reply_from: from_email?.slice(0, 320) || null,
  };

  const { error: updateErr } = await supabase
    .from("outreach_leads")
    .update(updateRow)
    .eq("id", lead.id);

  if (updateErr) {
    return NextResponse.json(
      { error: updateErr.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, matched: true, id: lead.id });
}
