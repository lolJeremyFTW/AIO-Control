// Returns the VAPID public key the browser needs to subscribe. Public-safe
// (the public key is, by design, distributable). 503 when not configured
// so the client can hide the "Enable notifications" UI.

import { NextResponse } from "next/server";

import { vapidPublicKey } from "../../../../lib/push/webpush";

export const dynamic = "force-dynamic";

export async function GET() {
  const key = vapidPublicKey();
  if (!key) {
    return NextResponse.json(
      { error: "VAPID not configured" },
      { status: 503 },
    );
  }
  return NextResponse.json({ key });
}
