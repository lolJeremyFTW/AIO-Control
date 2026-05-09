"use server";

import { revalidatePath } from "next/cache";

import { requireBillingAccess } from "../../lib/billing/access";
import {
  ensureBillingCustomer,
  type BillingCustomerState,
} from "../../lib/billing/state";
import {
  getStripeConfigStatus,
  updateStripeCustomer,
} from "../../lib/billing/stripe";
import {
  clampDiscountPercent,
  normalizeBillingCadence,
  normalizePlanId,
} from "../../lib/billing/subscription";
import { getServiceRoleSupabase } from "../../lib/supabase/service";

export type BillingActionResult<T> =
  | { ok: true; data: T; warning?: string }
  | { ok: false; error: string };

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

const CUSTOMER_COLUMNS =
  "workspace_id, stripe_customer_id, billing_email, tax_id, plan_id, billing_cadence, status, discount_percent, discount_label, discount_expires_at, discount_created_at, managed_internally, stripe_coupon_id, stripe_coupon_percent, stripe_coupon_label";

function cleanNullable(input: string | null | undefined) {
  const trimmed = input?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

function isValidEmail(input: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input);
}

export async function updateBillingContact(input: {
  workspace_slug: string;
  workspace_id: string;
  billing_email: string;
  tax_id: string | null;
}): Promise<BillingActionResult<null>> {
  const email = input.billing_email.trim();
  if (!email) return { ok: false, error: "Factuur-email is verplicht." };
  if (!isValidEmail(email)) {
    return { ok: false, error: "Factuur-email is ongeldig." };
  }

  const auth = await requireBillingAccess(input.workspace_id, { write: true });
  if (!auth.ok) return { ok: false, error: auth.error };

  const existing = await ensureBillingCustomer({
    workspaceId: input.workspace_id,
    workspaceSlug: input.workspace_slug,
    profile: auth.access.profile,
  });

  const service = getServiceRoleSupabase();
  const { error } = await service
    .from("billing_customers")
    .update({
      billing_email: email,
      tax_id: cleanNullable(input.tax_id),
    })
    .eq("workspace_id", input.workspace_id);

  if (error) return { ok: false, error: error.message };

  let warning: string | undefined;
  if (existing.stripeCustomerId && getStripeConfigStatus().configured) {
    await updateStripeCustomer({
      customerId: existing.stripeCustomerId,
      workspaceId: input.workspace_id,
      workspaceSlug: input.workspace_slug,
      email,
      name:
        auth.access.profile.company_name ||
        auth.access.profile.display_name ||
        null,
    }).catch((err) => {
      warning =
        err instanceof Error
          ? `Lokaal opgeslagen, maar Stripe sync faalde: ${err.message}`
          : "Lokaal opgeslagen, maar Stripe sync faalde.";
    });
  }

  revalidatePath(`/${input.workspace_slug}/settings/billing`);
  return { ok: true, data: null, warning };
}

export async function updateBillingDiscount(input: {
  workspace_slug: string;
  workspace_id: string;
  plan_id: string;
  billing_cadence: string;
  discount_percent: number;
  discount_label: string | null;
  managed_internally: boolean;
}): Promise<BillingActionResult<BillingCustomerState>> {
  const auth = await requireBillingAccess(input.workspace_id, {
    globalAdmin: true,
  });
  if (!auth.ok) return { ok: false, error: auth.error };

  const planId = normalizePlanId(input.plan_id);
  const billingCadence = normalizeBillingCadence(input.billing_cadence);
  const discountPercent = clampDiscountPercent(input.discount_percent);
  const managedInternally = Boolean(input.managed_internally);
  const discountLabel = cleanNullable(input.discount_label);

  if (discountPercent === 100 && !managedInternally) {
    return {
      ok: false,
      error:
        "100% korting is alleen bedoeld voor intern beheerde Enterprise/admin accounts.",
    };
  }

  if (
    managedInternally &&
    (planId !== "enterprise" || discountPercent !== 100)
  ) {
    return {
      ok: false,
      error: "Intern beheer vereist Enterprise met precies 100% korting.",
    };
  }

  await ensureBillingCustomer({
    workspaceId: input.workspace_id,
    workspaceSlug: input.workspace_slug,
    profile: auth.access.profile,
  });

  const service = getServiceRoleSupabase();
  const { data, error } = await service
    .from("billing_customers")
    .update({
      plan_id: planId,
      billing_cadence: billingCadence,
      discount_percent: discountPercent,
      discount_label: discountPercent > 0 ? discountLabel : null,
      discount_created_by: discountPercent > 0 ? auth.access.userId : null,
      discount_created_at:
        discountPercent > 0 ? new Date().toISOString() : null,
      managed_internally: managedInternally,
      stripe_coupon_id: null,
      stripe_coupon_percent: null,
      stripe_coupon_label: null,
      status: managedInternally ? "internal" : "local_discount_configured",
    })
    .eq("workspace_id", input.workspace_id)
    .select(CUSTOMER_COLUMNS)
    .single();

  if (error) return { ok: false, error: error.message };
  const row = data as BillingCustomerRow;

  revalidatePath(`/${input.workspace_slug}/settings/billing`);
  return {
    ok: true,
    data: {
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
    },
  };
}
