// Fast deterministic outreach freebie batch runner.
//
// The old schedule asked an LLM to scrape, design, post, mirror files and
// notify in one giant prompt. That was fragile and spawned a heavy MCP stack
// for tens of minutes. This endpoint does the stable database/report work in
// process; the cron agent only has to call it once and summarize the result.

import { randomBytes, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

import { getServiceRoleSupabase } from "../../../../../lib/supabase/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DEFAULT_LIMIT = 2;
const MAX_LIMIT = 5;

type Body = {
  workspace_id?: string;
  business_id?: string;
  limit?: number;
};

type LeadRow = {
  id: string;
  workspace_id: string;
  business_id: string;
  legacy_id: number | null;
  vps_lead_id: number | null;
  token: string | null;
  lead_name: string | null;
  lead_email: string | null;
  lead_website: string | null;
  lead_branche: string | null;
  lead_regio: string | null;
  status: string | null;
  pitch: string | null;
  angle: string | null;
};

function safeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

function mintToken(): string {
  return randomBytes(8).toString("base64url").slice(0, 11);
}

function clampLimit(value: unknown): number {
  const n = Number(value ?? DEFAULT_LIMIT);
  if (!Number.isFinite(n)) return DEFAULT_LIMIT;
  return Math.max(1, Math.min(MAX_LIMIT, Math.floor(n)));
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

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const workspaceId = body.workspace_id;
  const businessId = body.business_id;
  if (!workspaceId || !businessId) {
    return NextResponse.json(
      { error: "workspace_id and business_id are required" },
      { status: 400 },
    );
  }

  const limit = clampLimit(body.limit);
  const supabase = getServiceRoleSupabase();
  const { data: leads, error: leadError } = await supabase
    .from("outreach_leads")
    .select(
      "id, workspace_id, business_id, legacy_id, vps_lead_id, token, lead_name, lead_email, lead_website, lead_branche, lead_regio, status, pitch, angle",
    )
    .eq("workspace_id", workspaceId)
    .eq("business_id", businessId)
    .in("status", ["pitched", "new"])
    .not("pitch", "is", null)
    .is("freebie_generated_at", null)
    .order("updated_at", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(limit);

  if (leadError) {
    return NextResponse.json({ error: leadError.message }, { status: 500 });
  }

  const origin =
    process.env.OUTREACH_PUBLIC_ORIGIN ??
    process.env.NEXT_PUBLIC_APP_ORIGIN ??
    "https://aio.tromptech.life";
  const processed: Array<{
    id: string;
    legacy_id: number | null;
    lead_name: string;
    score: number;
    url: string;
  }> = [];
  const errors: Array<{ id: string; error: string }> = [];

  for (const lead of ((leads ?? []) as LeadRow[])) {
    try {
      const tokenValue = lead.token ?? mintToken();
      const url = `${origin}/r/${tokenValue}`;
      const scores = scoreLead(lead);
      const html = buildFreebieHtml(lead, scores);
      const score = Math.round(
        (Object.values(scores).reduce((sum, n) => sum + n, 0) /
          Object.values(scores).length) *
          10,
      );
      const pitch = attachFreebieUrl(lead.pitch ?? "", url);
      const nowIso = new Date().toISOString();

      const { error } = await supabase
        .from("outreach_leads")
        .update({
          token: tokenValue,
          vps_lead_id: lead.vps_lead_id ?? lead.legacy_id,
          html_content: html,
          score,
          angle_scores: scores,
          pitch,
          status: "freebie_ready",
          freebie_generated_at: nowIso,
          freebie_path: `/r/${tokenValue}`,
        })
        .eq("id", lead.id);
      if (error) throw new Error(error.message);

      processed.push({
        id: lead.id,
        legacy_id: lead.legacy_id,
        lead_name: lead.lead_name ?? "(naam onbekend)",
        score,
        url,
      });
    } catch (err) {
      errors.push({
        id: lead.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return NextResponse.json({
    ok: errors.length === 0,
    requested: limit,
    processed_count: processed.length,
    error_count: errors.length,
    processed,
    errors,
  });
}

function scoreLead(lead: LeadRow): Record<"A" | "B" | "C" | "D" | "E", number> {
  const pitch = (lead.pitch ?? "").toLowerCase();
  const hasWebsite = Boolean(clean(lead.lead_website));
  const hasRegion = Boolean(clean(lead.lead_regio));
  const hasBranch = Boolean(clean(lead.lead_branche));
  return {
    A: hasWebsite ? 7 : 4,
    B: pitch.includes("whatsapp") ? 8 : 6,
    C: hasBranch && hasRegion ? 7 : 5,
    D: pitch.includes("chatbot") ? 7 : 5,
    E: hasWebsite ? 6 : 7,
  };
}

function buildFreebieHtml(
  lead: LeadRow,
  scores: Record<"A" | "B" | "C" | "D" | "E", number>,
): string {
  const name = clean(lead.lead_name) ?? "Onbekende lead";
  const website = clean(lead.lead_website);
  const branche = clean(lead.lead_branche);
  const regio = clean(lead.lead_regio);
  const pitch = clean(lead.pitch);
  const date = new Intl.DateTimeFormat("nl-NL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date());
  const score = Math.round(
    (Object.values(scores).reduce((sum, n) => sum + n, 0) /
      Object.values(scores).length) *
      10,
  );

  const sections = [
    {
      nr: "01",
      title: "Website scan",
      score: scores.A,
      body: website
        ? `Er is een duidelijke website gevonden: ${website}. De snelste winst zit meestal in mobiel laden, heldere call-to-actions en direct zichtbaar contact.`
        : "Er is geen duidelijke website gekoppeld. Dat maakt vindbaarheid en vertrouwen kwetsbaar, vooral bij mobiele zoekers.",
    },
    {
      nr: "02",
      title: "WhatsApp plan",
      score: scores.B,
      body: "Maak de eerste reactie zo laagdrempelig mogelijk: een korte WhatsApp knop met een vooraf ingevulde vraag werkt vaak beter dan alleen een contactformulier.",
    },
    {
      nr: "03",
      title: "Lokale positie",
      score: scores.C,
      body: `${branche ?? "Deze branche"} in ${regio ?? "de regio"} is lokaal zoekgedreven. Een compacte landingspagina met plaatsnaam, aanbod en bewijs helpt om sneller gekozen te worden.`,
    },
    {
      nr: "04",
      title: "Automatisering",
      score: scores.D,
      body: "Een simpele intake-flow kan veel herhaalvragen opvangen: openingstijden, beschikbaarheid, prijzen, afspraakverzoeken en eerste kwalificatie.",
    },
    {
      nr: "05",
      title: "Concept richting",
      score: scores.E,
      body: pitch
        ? `De outreach-haak is: ${pitch.slice(0, 260)}${pitch.length > 260 ? "..." : ""}`
        : "Start met een korte pagina die vertrouwen wekt, het aanbod uitlegt en direct naar contact stuurt.",
    },
  ];

  return `<!doctype html>
<html lang="nl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>TrompTech analyse - ${escapeHtml(name)}</title>
  <style>
    :root { color-scheme: light; --green:#39b255; --ink:#1c1f1d; --muted:#68716b; --line:#d8ddd7; --paper:#f7f8f4; }
    * { box-sizing: border-box; }
    body { margin:0; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color:var(--ink); background:#e9ece6; }
    main { max-width: 860px; margin: 0 auto; min-height: 100vh; background: var(--paper); padding: 34px 38px 30px; }
    header { display:flex; justify-content:space-between; gap:22px; border-bottom:1px solid var(--line); padding-bottom:20px; margin-bottom:24px; }
    .brand { font-weight:800; letter-spacing:-.02em; }
    .brand span { color:var(--green); }
    .tag { border:1px solid rgba(57,178,85,.28); background:rgba(57,178,85,.09); color:#257f3c; border-radius:999px; padding:6px 12px; font-size:12px; font-weight:700; height:max-content; }
    h1 { font-size:34px; line-height:1.05; margin:0 0 10px; letter-spacing:-.03em; }
    .meta { display:flex; flex-wrap:wrap; gap:8px 14px; color:var(--muted); font-size:13px; }
    .hero { display:grid; grid-template-columns:1fr auto; gap:20px; align-items:end; margin-bottom:22px; }
    .score { text-align:right; font-weight:800; font-size:38px; color:var(--green); }
    .score small { display:block; font-size:11px; color:var(--muted); text-transform:uppercase; letter-spacing:.12em; margin-top:2px; }
    .grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:14px; }
    section { background:#fff; border:1px solid var(--line); border-radius:12px; padding:16px; box-shadow:0 1px 0 rgba(0,0,0,.03); }
    section.wide { grid-column:1 / -1; }
    .section-head { display:flex; align-items:center; gap:10px; margin-bottom:10px; padding-bottom:10px; border-bottom:1px solid #edf0ea; }
    .nr { color:var(--green); font-size:12px; font-weight:800; letter-spacing:.1em; }
    h2 { font-size:16px; margin:0; flex:1; }
    .badge { border:1px solid var(--green); color:var(--green); border-radius:6px; padding:2px 7px; font-size:12px; font-weight:800; }
    p { margin:0; color:#3e4641; line-height:1.62; font-size:14px; }
    footer { margin-top:24px; padding-top:16px; border-top:1px solid var(--line); display:flex; justify-content:space-between; gap:16px; color:var(--muted); font-size:13px; }
    a { color:#20833a; font-weight:700; }
    @media (max-width: 720px) { main { padding:24px 18px; } .hero, .grid { grid-template-columns:1fr; } .score { text-align:left; } section.wide { grid-column:auto; } }
  </style>
</head>
<body>
  <main>
    <header><div class="brand">Tromp<span>Tech</span></div><div class="tag">Gratis analyse</div></header>
    <div class="hero">
      <div>
        <h1>${escapeHtml(name)}</h1>
        <div class="meta">
          ${website ? `<span>${escapeHtml(website)}</span>` : ""}
          ${branche ? `<span>${escapeHtml(branche)}</span>` : ""}
          ${regio ? `<span>${escapeHtml(regio)}</span>` : ""}
          <span>${escapeHtml(date)}</span>
        </div>
      </div>
      <div class="score">${score}<small>digitale score</small></div>
    </div>
    <div class="grid">
      ${sections
        .map(
          (s, idx) => `<section class="${idx === 2 ? "wide" : ""}">
        <div class="section-head"><span class="nr">${s.nr}</span><h2>${escapeHtml(s.title)}</h2><span class="badge">${s.score}/10</span></div>
        <p>${escapeHtml(s.body)}</p>
      </section>`,
        )
        .join("")}
    </div>
    <footer>
      <span>Opgesteld door TrompTech</span>
      <a href="https://wa.me/31649556856">WhatsApp +31 6 49 55 68 56</a>
    </footer>
  </main>
</body>
</html>`;
}

function attachFreebieUrl(pitch: string, url: string): string {
  const cleanPitch = pitch.trim();
  if (!cleanPitch) return `Gratis analyse: ${url}`;
  if (cleanPitch.includes("/r/") || cleanPitch.includes(url)) return cleanPitch;
  return cleanPitch
    .replace(/\[(hosted_url|freebie_url|url)\]/gi, url)
    .concat(/\[(hosted_url|freebie_url|url)\]/i.test(cleanPitch) ? "" : `\n\nGratis analyse: ${url}`);
}

function clean(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
