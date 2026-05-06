// Public freebie report route. Anyone with the token can view the
// hosted HTML — that's intentional, the token is the auth.
//
// Side effect: every GET inserts an outreach_views row (which fires
// the trigger that bumps view_count + last_viewed_at on the lead).
// We dedup repeat hits from the same IP within 60s so a refresh or
// a Telegram link unfurl doesn't inflate the counter — see logView().
//
// Bot/preview filters: HEAD requests, the Telegram preview UA
// (TelegramBot, twitterbot, facebookexternalhit, slackbot, etc.) and
// the Discord/LinkedIn previewer are all served the HTML but their
// view is NOT logged. We want real human opens only in the dashboard.

import { createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

import { getServiceRoleSupabase } from "../../../lib/supabase/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PREVIEW_UA = [
  "TelegramBot",
  "twitterbot",
  "facebookexternalhit",
  "Slackbot",
  "Discordbot",
  "LinkedInBot",
  "WhatsApp",
  "Pinterest",
  "redditbot",
  "Googlebot",
  "bingbot",
  "Applebot",
];

function isPreviewUA(ua: string): boolean {
  if (!ua) return false;
  const lower = ua.toLowerCase();
  return PREVIEW_UA.some((p) => lower.includes(p.toLowerCase()));
}

function clientIp(req: NextRequest): string {
  // Caddy in front sets X-Forwarded-For. Take the first IP (the real client).
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]?.trim() || "0.0.0.0";
  return req.headers.get("x-real-ip") || "0.0.0.0";
}

function hashIp(ip: string): string {
  // Salt prevents the dashboard from being a rainbow table for IPs.
  const salt = process.env.OUTREACH_IP_SALT ?? "tromptech-outreach-v1";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 32);
}

type RouteCtx = { params: Promise<{ token: string }> };

export async function GET(req: NextRequest, ctx: RouteCtx) {
  const { token } = await ctx.params;
  if (!token || token.length < 6 || !/^[A-Za-z0-9_-]+$/.test(token)) {
    return new NextResponse("Not found", { status: 404 });
  }

  const supabase = getServiceRoleSupabase();
  const { data: lead } = await supabase
    .from("outreach_leads")
    .select("id, html_content, lead_name")
    .eq("token", token)
    .maybeSingle();

  if (!lead) {
    return new NextResponse("Not found", { status: 404 });
  }

  // Log the view, but skip preview-bot UAs.
  const ua = req.headers.get("user-agent") ?? "";
  if (!isPreviewUA(ua)) {
    const ip = clientIp(req);
    const ipHash = hashIp(ip);
    const referer = (req.headers.get("referer") ?? "").slice(0, 200) || null;

    // Dedup window: skip if same lead+ip viewed in last 60 seconds.
    const sixtySecondsAgo = new Date(Date.now() - 60_000).toISOString();
    const { data: recent } = await supabase
      .from("outreach_views")
      .select("id")
      .eq("lead_id", lead.id)
      .eq("ip_hash", ipHash)
      .gte("viewed_at", sixtySecondsAgo)
      .limit(1)
      .maybeSingle();

    if (!recent) {
      // Fire-and-forget; if the insert fails we still serve the HTML.
      void supabase
        .from("outreach_views")
        .insert({
          lead_id: lead.id,
          ip_hash: ipHash,
          user_agent: ua.slice(0, 500),
          referer,
        })
        .then((res) => {
          if (res.error) {
            console.error("outreach_views insert failed", res.error);
          }
        });
    }
  }

  return new NextResponse(lead.html_content, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      // Cache for one minute at edge level to absorb refresh-spam without
      // skipping our view-log (the route still runs server-side per hit).
      "cache-control": "private, max-age=60",
      // Block iframe embedding so the report can't be hijacked into a phishing site.
      "x-frame-options": "DENY",
      "content-security-policy":
        "frame-ancestors 'none'; default-src 'self' https://fonts.googleapis.com https://fonts.gstatic.com; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com",
      "referrer-policy": "no-referrer",
    },
  });
}
