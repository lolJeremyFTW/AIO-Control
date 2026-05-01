// Stripe webhook receiver. Validates the Stripe-Signature header against
// STRIPE_WEBHOOK_SECRET and inserts a revenue_events row for each
// payment_intent.succeeded / charge.succeeded event.
//
// This file is the ingress for the revenue overlay on the dashboard.
// Configure in Stripe → Webhooks: endpoint = https://tromptech.life/aio/api/integrations/stripe,
// events = payment_intent.succeeded (or charge.succeeded). Paste the
// signing secret into STRIPE_WEBHOOK_SECRET in .env.production.

import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

import { getServiceRoleSupabase } from "../../../../lib/supabase/service";

export const dynamic = "force-dynamic";

const TOLERANCE_SECONDS = 300;

function verifyStripeSignature(
  payload: string,
  header: string,
  secret: string,
): boolean {
  // Stripe-Signature header looks like:
  //   t=1492774577,v1=5257a869e7ec...,v0=...
  // We support v1.
  const parts = header.split(",").reduce<Record<string, string>>((acc, kv) => {
    const [k, v] = kv.split("=");
    if (k && v) acc[k.trim()] = v.trim();
    return acc;
  }, {});
  const t = parts.t;
  const v1 = parts.v1;
  if (!t || !v1) return false;
  if (Math.abs(Math.floor(Date.now() / 1000) - Number(t)) > TOLERANCE_SECONDS) return false;
  const signed = `${t}.${payload}`;
  const expected = createHmac("sha256", secret).update(signed).digest("hex");
  if (expected.length !== v1.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(v1));
}

type StripeEvent = {
  id: string;
  type: string;
  data: {
    object: {
      id: string;
      amount?: number;
      amount_received?: number;
      currency?: string;
      created?: number;
      metadata?: Record<string, string>;
    };
  };
};

export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const sig = req.headers.get("stripe-signature");
  const payload = await req.text();

  if (!secret) {
    // Make this a soft 200 so Stripe doesn't retry forever — but we DO
    // log clearly that we're not consuming. Operators see this in the
    // Stripe webhook delivery log.
    console.warn("Stripe webhook hit but STRIPE_WEBHOOK_SECRET is unset");
    return NextResponse.json({ ok: true, skipped: "no secret" });
  }
  if (!sig || !verifyStripeSignature(payload, sig, secret)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  let event: StripeEvent;
  try {
    event = JSON.parse(payload) as StripeEvent;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  // We only consume successful charges/payment intents. Everything else
  // ack with 200 (Stripe retries on non-2xx).
  const consume = ["payment_intent.succeeded", "charge.succeeded"].includes(event.type);
  if (!consume) return NextResponse.json({ ok: true, ignored: event.type });

  const obj = event.data.object;
  const cents = obj.amount_received ?? obj.amount ?? 0;
  if (cents <= 0) return NextResponse.json({ ok: true, skipped: "zero amount" });

  // Stripe metadata MUST include workspace_id + business_id for us to
  // attribute the revenue. Document this in your Stripe checkout setup:
  //   metadata: { workspace_id: "...", business_id: "..." }
  const workspaceId = obj.metadata?.workspace_id;
  const businessId = obj.metadata?.business_id;
  if (!workspaceId || !businessId) {
    return NextResponse.json({
      ok: true,
      skipped: "no workspace/business metadata on Stripe object",
    });
  }

  const supabase = getServiceRoleSupabase();
  const { error } = await supabase.from("revenue_events").upsert(
    {
      workspace_id: workspaceId,
      business_id: businessId,
      source: "stripe",
      external_id: obj.id,
      amount_cents: cents,
      currency: (obj.currency ?? "eur").toUpperCase(),
      occurred_at: obj.created
        ? new Date(obj.created * 1000).toISOString()
        : new Date().toISOString(),
      payload: { stripe_event_id: event.id, type: event.type },
    },
    { onConflict: "business_id,source,external_id" },
  );
  if (error) {
    console.error("revenue_events insert failed", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
