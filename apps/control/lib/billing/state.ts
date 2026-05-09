import "server-only";

import { createSupabaseServerClient } from "../supabase/server";
import { getServiceRoleSupabase } from "../supabase/service";
import {
  createStripeCoupon,
  createStripeCustomer,
  listStripeInvoices,
  updateStripeCustomer,
  type StripeConfigStatus,
  getStripeConfigMessage,
  getStripeConfigStatus,
  type StripeInvoice,
} from "./stripe";
import {
  clampDiscountPercent,
  normalizeBillingCadence,
  normalizePlanId,
  resolveWorkspaceSubscription,
  type BillingCadence,
  type PlanId,
  type WorkspaceSubscription,
} from "./subscription";

export type BillingCustomerState = {
  workspaceId: string;
  stripeCustomerId: string | null;
  billingEmail: string | null;
  taxId: string | null;
  planId: PlanId;
  billingCadence: BillingCadence;
  status: string;
  discountPercent: number;
  discountLabel: string | null;
  discountExpiresAt: string | null;
  discountCreatedAt: string | null;
  managedInternally: boolean;
  stripeCouponId: string | null;
  stripeCouponPercent: number | null;
  stripeCouponLabel: string | null;
};

export type BillingInvoiceState = {
  id: string;
  stripeInvoiceId: string;
  number: string | null;
  status: string;
  currency: string;
  amountDueCents: number;
  amountPaidCents: number;
  billingEmail: string | null;
  hostedInvoiceUrl: string | null;
  invoicePdfUrl: string | null;
  issuedAt: string;
  dueAt: string | null;
  paidAt: string | null;
};

export type WorkspaceBillingState = {
  customer: BillingCustomerState | null;
  subscription: WorkspaceSubscription;
  billingEmail: string;
  taxId: string;
  invoices: BillingInvoiceState[];
  stripe: StripeConfigStatus & { message: string | null };
  schemaReady: boolean;
  invoiceSyncError: string | null;
};

type BillingCustomerRow = {
  workspace_id: string;
  stripe_customer_id: string | null;
  billing_email: string | null;
  tax_id: string | null;
  plan_id: string | null;
  billing_cadence: string | null;
  status: string | null;
  discount_percent: number | null;
  discount_label: string | null;
  discount_expires_at: string | null;
  discount_created_at: string | null;
  managed_internally: boolean | null;
  stripe_coupon_id: string | null;
  stripe_coupon_percent: number | null;
  stripe_coupon_label: string | null;
};

type BillingInvoiceRow = {
  id: string;
  stripe_invoice_id: string;
  number: string | null;
  status: string | null;
  currency: string | null;
  amount_due_cents: number | null;
  amount_paid_cents: number | null;
  billing_email: string | null;
  hosted_invoice_url: string | null;
  invoice_pdf_url: string | null;
  issued_at: string;
  due_at: string | null;
  paid_at: string | null;
};

type BillingProfile = {
  email?: string | null;
  display_name?: string | null;
  company_name?: string | null;
  tax_id?: string | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;

export function getRecentInvoiceSinceDate(now = new Date()) {
  return new Date(now.getTime() - 62 * DAY_MS);
}

function isMissingBillingSchemaError(error: unknown) {
  const err = error as { code?: string; message?: string } | null;
  return (
    err?.code === "42P01" ||
    err?.code === "PGRST205" ||
    Boolean(err?.message?.includes("billing_customers")) ||
    Boolean(err?.message?.includes("billing_invoices"))
  );
}

function asCustomerState(row: BillingCustomerRow): BillingCustomerState {
  return {
    workspaceId: row.workspace_id,
    stripeCustomerId: row.stripe_customer_id,
    billingEmail: row.billing_email,
    taxId: row.tax_id,
    planId: normalizePlanId(row.plan_id),
    billingCadence: normalizeBillingCadence(row.billing_cadence),
    status: row.status ?? "local",
    discountPercent: clampDiscountPercent(row.discount_percent),
    discountLabel: row.discount_label,
    discountExpiresAt: row.discount_expires_at,
    discountCreatedAt: row.discount_created_at,
    managedInternally: Boolean(row.managed_internally),
    stripeCouponId: row.stripe_coupon_id,
    stripeCouponPercent: row.stripe_coupon_percent,
    stripeCouponLabel: row.stripe_coupon_label,
  };
}

function asInvoiceState(row: BillingInvoiceRow): BillingInvoiceState {
  return {
    id: row.id,
    stripeInvoiceId: row.stripe_invoice_id,
    number: row.number,
    status: row.status ?? "unknown",
    currency: row.currency ?? "eur",
    amountDueCents: row.amount_due_cents ?? 0,
    amountPaidCents: row.amount_paid_cents ?? 0,
    billingEmail: row.billing_email,
    hostedInvoiceUrl: row.hosted_invoice_url,
    invoicePdfUrl: row.invoice_pdf_url,
    issuedAt: row.issued_at,
    dueAt: row.due_at,
    paidAt: row.paid_at,
  };
}

function fallbackBillingEmail(
  customer: BillingCustomerState | null,
  profile: BillingProfile,
) {
  return customer?.billingEmail || profile.email || "";
}

function fallbackTaxId(
  customer: BillingCustomerState | null,
  profile: BillingProfile,
) {
  return customer?.taxId || profile.tax_id || "";
}

function unixToIso(seconds: number | null | undefined) {
  if (!seconds) return null;
  return new Date(seconds * 1000).toISOString();
}

function stripeInvoiceToUpsert(input: {
  workspaceId: string;
  invoice: StripeInvoice;
  fallbackBillingEmail: string;
}) {
  const issuedAt = unixToIso(input.invoice.created) ?? new Date().toISOString();
  return {
    workspace_id: input.workspaceId,
    stripe_invoice_id: input.invoice.id,
    number: input.invoice.number ?? null,
    status: input.invoice.status ?? "unknown",
    currency: input.invoice.currency ?? "eur",
    amount_due_cents: input.invoice.amount_due ?? 0,
    amount_paid_cents: input.invoice.amount_paid ?? 0,
    billing_email: input.invoice.customer_email ?? input.fallbackBillingEmail,
    hosted_invoice_url: input.invoice.hosted_invoice_url ?? null,
    invoice_pdf_url: input.invoice.invoice_pdf ?? null,
    issued_at: issuedAt,
    due_at: unixToIso(input.invoice.due_date),
    paid_at: unixToIso(input.invoice.status_transitions?.paid_at),
  };
}

export async function getWorkspaceBillingState(input: {
  workspaceId: string;
  profile: BillingProfile;
  syncInvoices?: boolean;
}): Promise<WorkspaceBillingState> {
  const stripeStatus = getStripeConfigStatus();
  const supabase = await createSupabaseServerClient();
  const since = getRecentInvoiceSinceDate().toISOString();

  const [
    { data: customerRow, error: customerError },
    { data: invoiceRows, error: invoiceError },
  ] = await Promise.all([
    supabase
      .from("billing_customers")
      .select(
        "workspace_id, stripe_customer_id, billing_email, tax_id, plan_id, billing_cadence, status, discount_percent, discount_label, discount_expires_at, discount_created_at, managed_internally, stripe_coupon_id, stripe_coupon_percent, stripe_coupon_label",
      )
      .eq("workspace_id", input.workspaceId)
      .maybeSingle(),
    supabase
      .from("billing_invoices")
      .select(
        "id, stripe_invoice_id, number, status, currency, amount_due_cents, amount_paid_cents, billing_email, hosted_invoice_url, invoice_pdf_url, issued_at, due_at, paid_at",
      )
      .eq("workspace_id", input.workspaceId)
      .gte("issued_at", since)
      .order("issued_at", { ascending: false }),
  ]);

  const schemaReady =
    !isMissingBillingSchemaError(customerError) &&
    !isMissingBillingSchemaError(invoiceError);
  const customer = customerRow
    ? asCustomerState(customerRow as BillingCustomerRow)
    : null;
  let invoices = ((invoiceRows ?? []) as BillingInvoiceRow[]).map(
    asInvoiceState,
  );
  let invoiceSyncError: string | null = null;

  if (
    input.syncInvoices &&
    schemaReady &&
    stripeStatus.configured &&
    customer?.stripeCustomerId
  ) {
    const synced = await syncRecentInvoicesForWorkspace({
      workspaceId: input.workspaceId,
      stripeCustomerId: customer.stripeCustomerId,
      fallbackBillingEmail: fallbackBillingEmail(customer, input.profile),
    }).catch((error) => {
      invoiceSyncError =
        error instanceof Error ? error.message : "Invoice sync failed";
      return null;
    });
    if (synced) invoices = synced;
  }

  return {
    customer,
    subscription: resolveWorkspaceSubscription(customer ?? undefined),
    billingEmail: fallbackBillingEmail(customer, input.profile),
    taxId: fallbackTaxId(customer, input.profile),
    invoices,
    stripe: {
      ...stripeStatus,
      message: getStripeConfigMessage(stripeStatus),
    },
    schemaReady,
    invoiceSyncError,
  };
}

export async function ensureBillingCustomer(input: {
  workspaceId: string;
  workspaceSlug: string;
  profile: BillingProfile;
}) {
  const service = getServiceRoleSupabase();
  const { data: existing, error: selectError } = await service
    .from("billing_customers")
    .select(
      "workspace_id, stripe_customer_id, billing_email, tax_id, plan_id, billing_cadence, status, discount_percent, discount_label, discount_expires_at, discount_created_at, managed_internally, stripe_coupon_id, stripe_coupon_percent, stripe_coupon_label",
    )
    .eq("workspace_id", input.workspaceId)
    .maybeSingle();

  if (selectError && !isMissingBillingSchemaError(selectError)) {
    throw new Error(selectError.message);
  }

  if (existing) return asCustomerState(existing as BillingCustomerRow);

  const { data: inserted, error: insertError } = await service
    .from("billing_customers")
    .insert({
      workspace_id: input.workspaceId,
      billing_email: input.profile.email || null,
      tax_id: input.profile.tax_id || null,
      plan_id: "free",
      billing_cadence: "monthly",
    })
    .select(
      "workspace_id, stripe_customer_id, billing_email, tax_id, plan_id, billing_cadence, status, discount_percent, discount_label, discount_expires_at, discount_created_at, managed_internally, stripe_coupon_id, stripe_coupon_percent, stripe_coupon_label",
    )
    .single();

  if (insertError) throw new Error(insertError.message);
  return asCustomerState(inserted as BillingCustomerRow);
}

export async function ensureStripeCustomerForWorkspace(input: {
  workspaceId: string;
  workspaceSlug: string;
  profile: BillingProfile;
}) {
  const service = getServiceRoleSupabase();
  const customer = await ensureBillingCustomer(input);
  const email = fallbackBillingEmail(customer, input.profile);
  if (!email) {
    throw new Error("Billing email is required before opening Stripe");
  }

  if (customer.stripeCustomerId) {
    await updateStripeCustomer({
      customerId: customer.stripeCustomerId,
      workspaceId: input.workspaceId,
      workspaceSlug: input.workspaceSlug,
      email,
      name: input.profile.company_name || input.profile.display_name || null,
    });
    return { ...customer, billingEmail: email };
  }

  const stripeCustomer = await createStripeCustomer({
    workspaceId: input.workspaceId,
    workspaceSlug: input.workspaceSlug,
    email,
    name: input.profile.company_name || input.profile.display_name || null,
  });

  const { data: updated, error } = await service
    .from("billing_customers")
    .update({
      stripe_customer_id: stripeCustomer.id,
      billing_email: email,
      status: "stripe_customer_created",
    })
    .eq("workspace_id", input.workspaceId)
    .select(
      "workspace_id, stripe_customer_id, billing_email, tax_id, plan_id, billing_cadence, status, discount_percent, discount_label, discount_expires_at, discount_created_at, managed_internally, stripe_coupon_id, stripe_coupon_percent, stripe_coupon_label",
    )
    .single();

  if (error) throw new Error(error.message);
  return asCustomerState(updated as BillingCustomerRow);
}

export async function getOrCreateStripeCouponForWorkspace(input: {
  workspaceId: string;
  customer: BillingCustomerState;
}) {
  const percentOff = clampDiscountPercent(input.customer.discountPercent);
  if (percentOff <= 0) return null;
  const label =
    input.customer.discountLabel || `AIO Control ${percentOff}% discount`;

  if (
    input.customer.stripeCouponId &&
    input.customer.stripeCouponPercent === percentOff &&
    input.customer.stripeCouponLabel === label
  ) {
    return input.customer.stripeCouponId;
  }

  const coupon = await createStripeCoupon({
    workspaceId: input.workspaceId,
    percentOff,
    label,
  });

  const service = getServiceRoleSupabase();
  const { error } = await service
    .from("billing_customers")
    .update({
      stripe_coupon_id: coupon.id,
      stripe_coupon_percent: percentOff,
      stripe_coupon_label: label,
    })
    .eq("workspace_id", input.workspaceId);

  if (error) throw new Error(error.message);
  return coupon.id;
}

export async function syncRecentInvoicesForWorkspace(input: {
  workspaceId: string;
  stripeCustomerId: string;
  fallbackBillingEmail: string;
}) {
  const since = getRecentInvoiceSinceDate();
  const invoices = await listStripeInvoices({
    customerId: input.stripeCustomerId,
    createdGte: Math.floor(since.getTime() / 1000),
  });

  if (invoices.length > 0) {
    const service = getServiceRoleSupabase();
    const rows = invoices.map((invoice) =>
      stripeInvoiceToUpsert({
        workspaceId: input.workspaceId,
        invoice,
        fallbackBillingEmail: input.fallbackBillingEmail,
      }),
    );
    const { error } = await service
      .from("billing_invoices")
      .upsert(rows, { onConflict: "stripe_invoice_id" });
    if (error) throw new Error(error.message);
  }

  const service = getServiceRoleSupabase();
  const { data, error } = await service
    .from("billing_invoices")
    .select(
      "id, stripe_invoice_id, number, status, currency, amount_due_cents, amount_paid_cents, billing_email, hosted_invoice_url, invoice_pdf_url, issued_at, due_at, paid_at",
    )
    .eq("workspace_id", input.workspaceId)
    .gte("issued_at", since.toISOString())
    .order("issued_at", { ascending: false });

  if (error) throw new Error(error.message);
  return ((data ?? []) as BillingInvoiceRow[]).map(asInvoiceState);
}
