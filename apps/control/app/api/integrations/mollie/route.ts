// Mollie webhook receiver. Mollie's webhook flow is unusual: the webhook
// only sends `id=<payment_id>` (form-urlencoded body) — we then call back
// to the Mollie API to fetch the full payment object. That makes a leak
// of the webhook URL alone harmless: an attacker can ping us with random
// IDs but the API call requires our MOLLIE_API_KEY to return anything.
//
// Configure in Mollie Dashboard → Profile → Webhook URL:
//   https://aio.tromptech.life/api/integrations/mollie  (or path version)
// Make sure your checkout calls include `metadata: { workspace_id, business_id }`
// so we can attribute each successful payment to a business.

import { NextResponse } from "next/server";

import { getServiceRoleSupabase } from "../../../../lib/supabase/service";

export const dynamic = "force-dynamic";

type MolliePayment = {
  id: string;
  status: string;
  amount?: { value: string; currency: string };
  amountRefunded?: { value: string; currency: string };
  paidAt?: string;
  createdAt?: string;
  metadata?: Record<string, string> | null;
};

export async function POST(req: Request) {
  const apiKey = process.env.MOLLIE_API_KEY;
  if (!apiKey) {
    // Soft-200 so Mollie doesn't retry forever; operators see "no key
    // configured" in their dashboard.
    console.warn("Mollie webhook hit but MOLLIE_API_KEY is unset");
    return NextResponse.json({ ok: true, skipped: "no api key" });
  }

  // Mollie sends `id=tr_xxx` as application/x-www-form-urlencoded.
  let id: string | null = null;
  const ct = req.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) {
    const body = (await req.json().catch(() => null)) as { id?: string } | null;
    id = body?.id ?? null;
  } else {
    const text = await req.text();
    const params = new URLSearchParams(text);
    id = params.get("id");
  }
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });

  // Fetch the canonical payment object from Mollie.
  const res = await fetch(`https://api.mollie.com/v2/payments/${id}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.warn("Mollie payment fetch failed", res.status, text);
    // Mollie expects 200 on webhook receipt; logging is enough.
    return NextResponse.json({ ok: true, fetched: false });
  }
  const payment = (await res.json()) as MolliePayment;

  // We only consume *paid* payments — refunds + chargebacks would land
  // here too if we asked, but those need a separate revenue_events shape.
  if (payment.status !== "paid") {
    return NextResponse.json({ ok: true, status: payment.status });
  }
  const cents = Math.round(parseFloat(payment.amount?.value ?? "0") * 100);
  if (cents <= 0)
    return NextResponse.json({ ok: true, skipped: "zero amount" });

  const workspaceId = payment.metadata?.workspace_id;
  const businessId = payment.metadata?.business_id;
  if (!workspaceId || !businessId) {
    return NextResponse.json({
      ok: true,
      skipped: "metadata.workspace_id / business_id missing",
    });
  }

  const supabase = getServiceRoleSupabase();
  const { error } = await supabase.from("revenue_events").upsert(
    {
      workspace_id: workspaceId,
      business_id: businessId,
      source: "mollie",
      external_id: payment.id,
      amount_cents: cents,
      currency: payment.amount?.currency?.toUpperCase() ?? "EUR",
      occurred_at: payment.paidAt ?? payment.createdAt ?? new Date().toISOString(),
      payload: { mollie_payment_id: payment.id, status: payment.status },
    },
    { onConflict: "business_id,source,external_id" },
  );
  if (error) {
    console.error("revenue_events upsert failed", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
