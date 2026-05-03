// Lightweight login-event recorder. The middleware calls
// `maybeRecordLogin` on every request that has a session — but we only
// actually insert a row into `aio_control.login_events` if we haven't
// already recorded one for this user in the current rolling window.
// The de-dupe lives in a cookie (`aio_login_recorded`) so we don't have
// to query the DB on every page load.
//
// Service-role is required because the table's RLS denies INSERT for
// regular clients (we want the audit trail to be tamper-proof).

import "server-only";

import type { NextRequest, NextResponse } from "next/server";

import { getServiceRoleSupabase } from "../supabase/service";

const COOKIE_NAME = "aio_login_recorded";
// 12h: long enough that normal navigation doesn't spam, short enough
// that a fresh browser session shows up within the same workday.
const DEDUPE_WINDOW_SECONDS = 12 * 60 * 60;

/** Best-effort recorder. Never throws — telemetry shouldn't break auth. */
export async function maybeRecordLogin(opts: {
  userId: string;
  request: NextRequest;
  response: NextResponse;
  method?: string;
}): Promise<void> {
  try {
    const cookieVal = opts.request.cookies.get(COOKIE_NAME)?.value;
    // If the cookie matches this user, we've already logged within
    // the dedupe window. Skip.
    if (cookieVal === opts.userId) return;

    const userAgent = opts.request.headers.get("user-agent") ?? null;
    const ip = pickIp(opts.request);
    const deviceLabel = parseDevice(userAgent);

    const admin = getServiceRoleSupabase();
    await admin.from("login_events").insert({
      user_id: opts.userId,
      ip_address: ip,
      user_agent: userAgent,
      device_label: deviceLabel,
      method: opts.method ?? "session_refresh",
    });

    // Set/refresh the dedupe cookie. Scoped to the whole site so
    // both the path and subdomain builds share the window.
    opts.response.cookies.set(COOKIE_NAME, opts.userId, {
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      maxAge: DEDUPE_WINDOW_SECONDS,
      path: "/",
    });
  } catch (err) {
    // Eat the error. Login flow > telemetry.
    console.warn("maybeRecordLogin failed", err);
  }
}

/** Used by the profile page to render the recent login history. */
export type LoginEventRow = {
  id: string;
  ip_address: string | null;
  user_agent: string | null;
  device_label: string | null;
  method: string;
  created_at: string;
};

export async function getRecentLoginEvents(
  userId: string,
  limit = 20,
): Promise<LoginEventRow[]> {
  const admin = getServiceRoleSupabase();
  const { data, error } = await admin
    .from("login_events")
    .select("id, ip_address, user_agent, device_label, method, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.warn("getRecentLoginEvents failed", error);
    return [];
  }
  return (data ?? []) as LoginEventRow[];
}

// ─── Parsing helpers ─────────────────────────────────────────────────

function pickIp(req: NextRequest): string | null {
  // Caddy forwards X-Forwarded-For; first entry is the original client.
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = req.headers.get("x-real-ip");
  if (real) return real;
  return null;
}

/** Tiny user-agent parser. Returns "Chrome on Windows" / "Safari on iOS"
 *  etc. Defensive fallback to "Unknown device" if nothing matches. */
function parseDevice(ua: string | null): string | null {
  if (!ua) return null;
  const browser = (() => {
    if (/Edg\//i.test(ua)) return "Edge";
    if (/OPR\/|Opera/i.test(ua)) return "Opera";
    if (/Chrome\//i.test(ua) && !/Chromium/i.test(ua)) return "Chrome";
    if (/Firefox\//i.test(ua)) return "Firefox";
    if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) return "Safari";
    return "Browser";
  })();
  const os = (() => {
    if (/iPhone|iPad|iPod/i.test(ua)) return "iOS";
    if (/Android/i.test(ua)) return "Android";
    if (/Windows NT/i.test(ua)) return "Windows";
    if (/Mac OS X/i.test(ua)) return "macOS";
    if (/Linux/i.test(ua)) return "Linux";
    return "Unknown OS";
  })();
  return `${browser} on ${os}`;
}
