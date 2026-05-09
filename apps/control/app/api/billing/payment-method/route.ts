import { NextResponse } from "next/server";

import { requireBillingAccess } from "../../../../lib/billing/access";
import { ensureStripeCustomerForWorkspace } from "../../../../lib/billing/state";
import {
  createStripePortalSession,
  createStripeSetupSession,
  getStripeConfigMessage,
  getStripeConfigStatus,
  isStripePortalConfigurationError,
} from "../../../../lib/billing/stripe";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RequestBody = {
  workspaceId?: string;
  workspaceSlug?: string;
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

    const returnUrl = billingUrl(req, body.workspaceSlug, "returned");
    const successUrl = billingUrl(req, body.workspaceSlug, "payment-method-ok");
    const cancelUrl = billingUrl(
      req,
      body.workspaceSlug,
      "payment-method-cancelled",
    );

    try {
      const portal = await createStripePortalSession({
        customerId: customer.stripeCustomerId,
        returnUrl,
      });
      return NextResponse.json({ url: portal.url, mode: "portal" });
    } catch (error) {
      if (!isStripePortalConfigurationError(error)) {
        throw error;
      }
    }

    const setup = await createStripeSetupSession({
      customerId: customer.stripeCustomerId,
      workspaceId: body.workspaceId,
      successUrl,
      cancelUrl,
    });

    if (!setup.url) {
      return NextResponse.json(
        { error: "Stripe did not return a checkout URL" },
        { status: 502 },
      );
    }

    return NextResponse.json({ url: setup.url, mode: "setup" });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not open Stripe billing",
      },
      { status: 502 },
    );
  }
}
