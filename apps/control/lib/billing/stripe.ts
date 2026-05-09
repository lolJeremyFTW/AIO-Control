import "server-only";

import { getPlanTier, type BillingCadence, type PlanId } from "./subscription";

const STRIPE_API_BASE = "https://api.stripe.com/v1";

export type StripeConfigStatus = {
  configured: boolean;
  missing: string[];
};

export type StripeCustomer = {
  id: string;
  email?: string | null;
};

export type StripeCheckoutSession = {
  id: string;
  url: string | null;
};

export type StripePortalSession = {
  id: string;
  url: string;
};

export type StripeCoupon = {
  id: string;
  percent_off?: number | null;
};

export type StripeInvoice = {
  id: string;
  number?: string | null;
  status?: string | null;
  currency?: string | null;
  amount_due?: number | null;
  amount_paid?: number | null;
  customer_email?: string | null;
  hosted_invoice_url?: string | null;
  invoice_pdf?: string | null;
  created?: number | null;
  due_date?: number | null;
  status_transitions?: {
    paid_at?: number | null;
  } | null;
};

type StripeListResponse<T> = {
  data?: T[];
};

type StripeErrorPayload = {
  error?: {
    message?: string;
    code?: string;
    type?: string;
  };
};

export class StripeConfigError extends Error {
  constructor(public readonly missing: string[]) {
    super(`Stripe billing is not configured: ${missing.join(", ")}`);
  }
}

export class StripeApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
  ) {
    super(message);
  }
}

export function getStripeConfigStatus(): StripeConfigStatus {
  const missing: string[] = [];
  if (!process.env.STRIPE_SECRET_KEY) missing.push("STRIPE_SECRET_KEY");
  return { configured: missing.length === 0, missing };
}

export function getStripeConfigMessage(status = getStripeConfigStatus()) {
  if (status.configured) return null;
  return `Stripe billing is niet geconfigureerd. Ontbrekend: ${status.missing.join(", ")}.`;
}

function getStripeSecretKey() {
  const status = getStripeConfigStatus();
  if (!status.configured) throw new StripeConfigError(status.missing);
  return process.env.STRIPE_SECRET_KEY!;
}

function appendParam(params: URLSearchParams, key: string, value: unknown) {
  if (value === undefined || value === null) return;
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      appendParam(params, `${key}[${index}]`, item),
    );
    return;
  }
  if (typeof value === "object") {
    Object.entries(value as Record<string, unknown>).forEach(([child, item]) =>
      appendParam(params, `${key}[${child}]`, item),
    );
    return;
  }
  params.append(key, String(value));
}

function encodeForm(body: Record<string, unknown>) {
  const params = new URLSearchParams();
  Object.entries(body).forEach(([key, value]) =>
    appendParam(params, key, value),
  );
  return params;
}

async function parseStripeResponse<T>(res: Response): Promise<T> {
  const text = await res.text();
  const json = (text ? JSON.parse(text) : {}) as T & StripeErrorPayload;
  if (!res.ok) {
    const message =
      json.error?.message ?? `Stripe request failed with ${res.status}`;
    throw new StripeApiError(message, res.status, json.error?.code);
  }
  return json as T;
}

async function stripePost<T>(path: string, body: Record<string, unknown>) {
  const res = await fetch(`${STRIPE_API_BASE}${path}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${getStripeSecretKey()}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: encodeForm(body),
  });
  return parseStripeResponse<T>(res);
}

async function stripeGet<T>(path: string, query: Record<string, unknown>) {
  const params = encodeForm(query);
  const qs = params.toString();
  const res = await fetch(`${STRIPE_API_BASE}${path}${qs ? `?${qs}` : ""}`, {
    method: "GET",
    headers: {
      authorization: `Bearer ${getStripeSecretKey()}`,
    },
  });
  return parseStripeResponse<T>(res);
}

export async function createStripeCustomer(input: {
  workspaceId: string;
  workspaceSlug: string;
  email: string;
  name?: string | null;
}) {
  return stripePost<StripeCustomer>("/customers", {
    email: input.email,
    name: input.name || undefined,
    metadata: {
      workspace_id: input.workspaceId,
      workspace_slug: input.workspaceSlug,
    },
  });
}

export async function updateStripeCustomer(input: {
  customerId: string;
  workspaceId: string;
  workspaceSlug: string;
  email: string;
  name?: string | null;
}) {
  return stripePost<StripeCustomer>(`/customers/${input.customerId}`, {
    email: input.email,
    name: input.name || undefined,
    metadata: {
      workspace_id: input.workspaceId,
      workspace_slug: input.workspaceSlug,
    },
  });
}

export async function createStripePortalSession(input: {
  customerId: string;
  returnUrl: string;
}) {
  return stripePost<StripePortalSession>("/billing_portal/sessions", {
    customer: input.customerId,
    return_url: input.returnUrl,
  });
}

export async function createStripeSetupSession(input: {
  customerId: string;
  workspaceId: string;
  successUrl: string;
  cancelUrl: string;
}) {
  return stripePost<StripeCheckoutSession>("/checkout/sessions", {
    mode: "setup",
    customer: input.customerId,
    "payment_method_types[0]": "card",
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    metadata: {
      workspace_id: input.workspaceId,
      purpose: "payment_method_setup",
    },
  });
}

export async function createStripeCoupon(input: {
  workspaceId: string;
  percentOff: number;
  label: string;
}) {
  return stripePost<StripeCoupon>("/coupons", {
    duration: "forever",
    name: input.label,
    percent_off: input.percentOff,
    metadata: {
      workspace_id: input.workspaceId,
      source: "aio_control_admin_discount",
    },
  });
}

export async function createStripeSubscriptionCheckout(input: {
  customerId: string;
  workspaceId: string;
  workspaceSlug: string;
  planId: PlanId;
  billingCadence: BillingCadence;
  unitAmountCents: number;
  successUrl: string;
  cancelUrl: string;
  couponId?: string | null;
}) {
  const tier = getPlanTier(input.planId);
  const interval = input.billingCadence === "yearly" ? "year" : "month";

  return stripePost<StripeCheckoutSession>("/checkout/sessions", {
    mode: "subscription",
    customer: input.customerId,
    client_reference_id: input.workspaceId,
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    "line_items[0][quantity]": 1,
    "line_items[0][price_data][currency]": "eur",
    "line_items[0][price_data][unit_amount]": input.unitAmountCents,
    "line_items[0][price_data][recurring][interval]": interval,
    "line_items[0][price_data][product_data][name]": `AIO Control ${tier.name}`,
    ...(input.couponId ? { "discounts[0][coupon]": input.couponId } : {}),
    metadata: {
      workspace_id: input.workspaceId,
      workspace_slug: input.workspaceSlug,
      plan_id: input.planId,
      billing_cadence: input.billingCadence,
    },
    subscription_data: {
      metadata: {
        workspace_id: input.workspaceId,
        workspace_slug: input.workspaceSlug,
        plan_id: input.planId,
        billing_cadence: input.billingCadence,
      },
    },
  });
}

export async function listStripeInvoices(input: {
  customerId: string;
  createdGte: number;
  limit?: number;
}) {
  const result = await stripeGet<StripeListResponse<StripeInvoice>>(
    "/invoices",
    {
      customer: input.customerId,
      "created[gte]": input.createdGte,
      limit: input.limit ?? 100,
    },
  );
  return result.data ?? [];
}

export function isStripePortalConfigurationError(error: unknown) {
  if (!(error instanceof StripeApiError)) return false;
  const text = error.message.toLowerCase();
  return (
    error.code === "billing_portal_not_configured" ||
    text.includes("billing portal") ||
    text.includes("configuration")
  );
}
