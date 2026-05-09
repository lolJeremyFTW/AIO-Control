import { NextResponse } from "next/server";

import { requireBillingAccess } from "../../../../lib/billing/access";
import {
  ensureStripeCustomerForWorkspace,
  getOrCreateStripeCouponForWorkspace,
} from "../../../../lib/billing/state";
import {
  createStripeSubscriptionCheckout,
  getStripeConfigMessage,
  getStripeConfigStatus,
} from "../../../../lib/billing/stripe";
import {
  getPlanPriceCents,
  normalizeBillingCadence,
  normalizePlanId,
} from "../../../../lib/billing/subscription";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RequestBody = {
  workspaceId?: string;
  workspaceSlug?: string;
  planId?: string;
  billingCadence?: string;
};

function billingUrl(req: Request, workspaceSlug: string, status: string) {
  const url = new URL(req.url);
  const basePath = process.env.BASE_PATH ?? "";
  return `${url.origin}${basePath}/${workspaceSlug}/settings/billing?billing=${status}#subscription`;
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as RequestBody;
  if (!body.workspaceId || !body.workspaceSlug) {
    return NextResponse.json(
      { error: "workspaceId and workspaceSlug are required" },
      { status: 400 },
    );
  }

  const planId = normalizePlanId(body.planId);
  const billingCadence = normalizeBillingCadence(body.billingCadence);
  const unitAmountCents = getPlanPriceCents(planId, billingCadence);

  if (planId === "free" || unitAmountCents <= 0) {
    return NextResponse.json(
      { error: "Free plan changes do not require Stripe checkout." },
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
    const customer = await ensureStripeCustomerForWorkspace({
      workspaceId: body.workspaceId,
      workspaceSlug: body.workspaceSlug,
      profile: auth.access.profile,
    });

    if (!customer.stripeCustomerId) {
      return NextResponse.json(
        { error: "Stripe customer could not be created" },
        { status: 500 },
      );
    }

    if (customer.managedInternally && customer.discountPercent === 100) {
      return NextResponse.json(
        { error: "Intern beheerde Enterprise plans gebruiken geen checkout." },
        { status: 400 },
      );
    }

    const couponId = await getOrCreateStripeCouponForWorkspace({
      workspaceId: body.workspaceId,
      customer,
    });

    const session = await createStripeSubscriptionCheckout({
      customerId: customer.stripeCustomerId,
      workspaceId: body.workspaceId,
      workspaceSlug: body.workspaceSlug,
      planId,
      billingCadence,
      unitAmountCents,
      couponId,
      successUrl: billingUrl(req, body.workspaceSlug, "checkout-ok"),
      cancelUrl: billingUrl(req, body.workspaceSlug, "checkout-cancelled"),
    });

    if (!session.url) {
      return NextResponse.json(
        { error: "Stripe did not return a checkout URL" },
        { status: 502 },
      );
    }

    return NextResponse.json({ url: session.url, mode: "subscription" });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not open Stripe checkout",
      },
      { status: 502 },
    );
  }
}
