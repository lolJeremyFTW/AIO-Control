// Server-only web-push helper. The VAPID key pair lives in env vars; the
// public key is exposed to the browser via the /api/push/key route so the
// service worker can subscribe.
//
// Generate keys once with:
//   npx web-push generate-vapid-keys --json
// and put them in .env.production as VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY.
// VAPID_SUBJECT must be a mailto: or https: URL.

import "server-only";
import webpush from "web-push";

let configured = false;

export function vapidPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY ?? null;
}

function ensureConfigured() {
  if (configured) return true;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT ?? "mailto:jeremy@tromptech.nl";
  if (!pub || !priv) return false;
  webpush.setVapidDetails(subject, pub, priv);
  configured = true;
  return true;
}

export type PushSub = {
  endpoint: string;
  p256dh: string;
  auth_secret: string;
};

export type PushPayload = {
  title: string;
  body?: string;
  url?: string;
  tag?: string;
};

export async function sendPush(
  sub: PushSub,
  payload: PushPayload,
): Promise<{ ok: boolean; statusCode?: number; error?: string }> {
  if (!ensureConfigured()) {
    return { ok: false, error: "VAPID keys not configured" };
  }
  try {
    const res = await webpush.sendNotification(
      {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth_secret },
      },
      JSON.stringify(payload),
      { TTL: 60 },
    );
    return { ok: true, statusCode: res.statusCode };
  } catch (err) {
    const e = err as { statusCode?: number; body?: string; message?: string };
    return {
      ok: false,
      statusCode: e.statusCode,
      error: e.body ?? e.message ?? "send failed",
    };
  }
}
