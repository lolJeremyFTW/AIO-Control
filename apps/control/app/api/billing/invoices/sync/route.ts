import { NextResponse } from "next/server";

import { requireBillingAccess } from "../../../../../lib/billing/access";
import {
  ensureBillingCustomer,
  syncRecentInvoicesForWorkspace,
} from "../../../../../lib/billing/state";
import {
  getStripeConfigMessage,
  getStripeConfigStatus,
} from "../../../../../lib/billing/stripe";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RequestBody = {
  workspaceId?: string;
  workspaceSlug?: string;
};

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as RequestBody;
  if (!body.workspaceId || !body.workspaceSlug) {
    return NextResponse.json(
      { error: "workspaceId and workspaceSlug are required" },
      { status: 400 },
    );
  }

  const auth = await requireBillingAccess(body.workspaceId, { write: true });
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const stripeStatus = getStripeConfigStatus();
  if (!stripeStatus.configured) {
    return NextResponse.json(
      {
        error: getStripeConfigMessage(stripeStatus),
        missing: stripeStatus.missing,
      },
      { status: 409 },
    );
  }

  try {
    const customer = await ensureBillingCustomer({
      workspaceId: body.workspaceId,
      workspaceSlug: body.workspaceSlug,
      profile: auth.access.profile,
    });

    if (!customer.stripeCustomerId) {
      return NextResponse.json({
        invoices: [],
        warning: "No Stripe customer yet",
      });
    }

    const invoices = await syncRecentInvoicesForWorkspace({
      workspaceId: body.workspaceId,
      stripeCustomerId: customer.stripeCustomerId,
      fallbackBillingEmail:
        customer.billingEmail || auth.access.profile.email || "",
    });

    return NextResponse.json({ invoices });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Could not sync invoices",
      },
      { status: 502 },
    );
  }
}
