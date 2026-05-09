// Settings -> Subscription panel. Uses local billing state and optional
// Stripe REST routes; when Stripe is not configured, actions are visibly
// disabled with a concrete setup message.

"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import {
  updateBillingContact,
  updateBillingDiscount,
} from "../app/actions/billing";
import {
  calculateNetPriceCents,
  getPlanPriceCents,
  PLAN_TIERS,
  type BillingCadence,
  type PlanId,
  type WorkspaceSubscription,
} from "../lib/billing/subscription";

type BillingCustomer = {
  stripeCustomerId: string | null;
  planId: PlanId;
  billingCadence: BillingCadence;
  discountPercent: number;
  discountLabel: string | null;
  managedInternally: boolean;
} | null;

type BillingInvoice = {
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

type StripeStatus = {
  configured: boolean;
  missing: string[];
  message: string | null;
};

type Props = {
  workspaceId: string;
  workspaceSlug: string;
  subscription: WorkspaceSubscription;
  customer: BillingCustomer;
  billingEmail: string;
  taxId: string;
  invoices: BillingInvoice[];
  stripe: StripeStatus;
  schemaReady: boolean;
  invoiceSyncError: string | null;
  isGlobalAdmin: boolean;
};

const eur = new Intl.NumberFormat("nl-NL", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "var(--app-card-2)",
  border: "1.5px solid var(--app-border)",
  color: "var(--app-fg)",
  padding: "8px 10px",
  borderRadius: 8,
  fontFamily: "var(--type)",
  fontSize: 13,
};

function formatPrice(cents: number) {
  return eur.format(cents / 100);
}

function formatLimit(value: number | "unlimited", unit: string) {
  if (value === "unlimited") return `Onbeperkt ${unit}`;
  return `${value} ${unit}`;
}

function formatBusinessLimit(value: number | "unlimited") {
  if (value === "unlimited") return "Onbeperkt businesses";
  return value === 1 ? "1 business" : `${value} businesses`;
}

function formatDate(value: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("nl-NL", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function apiPath(path: string) {
  return `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}${path}`;
}

function getCheckoutDiscount(
  subscription: WorkspaceSubscription,
  customer: BillingCustomer,
  planId: PlanId,
) {
  if (planId === "free") return 0;
  return customer?.discountPercent ?? subscription.discountPercent;
}

async function readJsonResponse(res: Response) {
  const data = (await res.json().catch(() => ({}))) as {
    error?: string;
    url?: string;
    invoices?: BillingInvoice[];
    warning?: string;
  };
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

function DisabledHint({ children }: { children: React.ReactNode }) {
  return (
    <p
      style={{
        margin: 0,
        color: "var(--app-fg-3)",
        fontSize: 12,
        lineHeight: 1.45,
      }}
    >
      {children}
    </p>
  );
}

export function SubscriptionPanel({
  workspaceId,
  workspaceSlug,
  subscription,
  customer,
  billingEmail: initialBillingEmail,
  taxId: initialTaxId,
  invoices: initialInvoices,
  stripe,
  schemaReady,
  invoiceSyncError,
  isGlobalAdmin,
}: Props) {
  const router = useRouter();
  const [billing, setBilling] = useState<BillingCadence>(
    subscription.billingCadence,
  );
  const [billingEmail, setBillingEmail] = useState(initialBillingEmail);
  const [taxId, setTaxId] = useState(initialTaxId);
  const [invoices, setInvoices] = useState(initialInvoices);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [isSaving, startSaving] = useTransition();
  const [adminPlan, setAdminPlan] = useState<PlanId>(
    customer?.planId ?? subscription.planId,
  );
  const [adminCadence, setAdminCadence] = useState<BillingCadence>(
    customer?.billingCadence ?? subscription.billingCadence,
  );
  const [adminDiscount, setAdminDiscount] = useState(
    String(customer?.discountPercent ?? subscription.discountPercent),
  );
  const [adminLabel, setAdminLabel] = useState(
    customer?.discountLabel ?? subscription.discountLabel ?? "",
  );
  const [adminInternal, setAdminInternal] = useState(
    customer?.managedInternally ?? subscription.managedInternally,
  );

  const tier = useMemo(
    () =>
      PLAN_TIERS.find((t) => t.id === subscription.planId) ?? PLAN_TIERS[0]!,
    [subscription.planId],
  );
  const stripeDisabledReason = !schemaReady
    ? "Billing migration 075 is nog niet toegepast."
    : stripe.message;
  const canUseStripe = schemaReady && stripe.configured;
  const stripeCustomerId = customer?.stripeCustomerId ?? null;

  function setFeedback(nextMessage: string | null, nextError: string | null) {
    setMessage(nextMessage);
    setError(nextError);
  }

  async function redirectFromBillingRoute(
    path: string,
    action: string,
    body = {},
  ) {
    if (!canUseStripe) {
      setFeedback(
        null,
        stripeDisabledReason ?? "Stripe is niet geconfigureerd.",
      );
      return;
    }

    setPendingAction(action);
    setFeedback(null, null);
    try {
      const data = await readJsonResponse(
        await fetch(apiPath(path), {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            workspaceId,
            workspaceSlug,
            ...body,
          }),
        }),
      );
      if (!data.url) throw new Error("Geen Stripe URL ontvangen.");
      window.location.assign(data.url);
    } catch (err) {
      setFeedback(
        null,
        err instanceof Error ? err.message : "Billing action failed",
      );
      setPendingAction(null);
    }
  }

  function saveContact() {
    setFeedback(null, null);
    startSaving(async () => {
      const res = await updateBillingContact({
        workspace_id: workspaceId,
        workspace_slug: workspaceSlug,
        billing_email: billingEmail,
        tax_id: taxId,
      });
      if (!res.ok) {
        setFeedback(null, res.error);
        return;
      }
      setFeedback(res.warning ?? "Factuurgegevens opgeslagen.", null);
      router.refresh();
    });
  }

  function saveAdminDiscount() {
    setFeedback(null, null);
    startSaving(async () => {
      const res = await updateBillingDiscount({
        workspace_id: workspaceId,
        workspace_slug: workspaceSlug,
        plan_id: adminPlan,
        billing_cadence: adminCadence,
        discount_percent: Number(adminDiscount),
        discount_label: adminLabel,
        managed_internally: adminInternal,
      });
      if (!res.ok) {
        setFeedback(null, res.error);
        return;
      }
      setFeedback("Admin korting opgeslagen voor de volgende checkout.", null);
      router.refresh();
    });
  }

  async function syncInvoices() {
    if (!canUseStripe) {
      setFeedback(
        null,
        stripeDisabledReason ?? "Stripe is niet geconfigureerd.",
      );
      return;
    }
    setPendingAction("invoices");
    setFeedback(null, null);
    try {
      const data = await readJsonResponse(
        await fetch(apiPath("/api/billing/invoices/sync"), {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ workspaceId, workspaceSlug }),
        }),
      );
      if (data.invoices) setInvoices(data.invoices);
      setFeedback(data.warning ?? "Facturen vernieuwd.", null);
    } catch (err) {
      setFeedback(
        null,
        err instanceof Error ? err.message : "Facturen vernieuwen faalde.",
      );
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {(message || error || stripeDisabledReason || invoiceSyncError) && (
        <div
          style={{
            border: `1.5px solid ${error ? "var(--rose)" : "var(--app-border)"}`,
            background: "var(--app-card-2)",
            borderRadius: 10,
            padding: "10px 12px",
            fontSize: 12.5,
            color: error ? "var(--rose)" : "var(--app-fg-2)",
          }}
        >
          {error ?? message ?? stripeDisabledReason ?? invoiceSyncError}
        </div>
      )}

      <div className="card">
        <h3>Huidig plan</h3>
        <p className="desc">
          Wat je nu hebt en welke korting lokaal voor deze workspace staat.
        </p>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr auto auto",
            gap: 16,
            alignItems: "center",
            padding: "12px 14px",
            border: "1.5px solid var(--tt-green)",
            background: "rgba(57,178,85,0.06)",
            borderRadius: 12,
          }}
        >
          <div>
            <div
              style={{
                fontFamily: "var(--hand)",
                fontSize: 22,
                fontWeight: 700,
                color: "var(--app-fg)",
              }}
            >
              {tier.name}
            </div>
            <div
              style={{ fontSize: 12, color: "var(--app-fg-3)", marginTop: 2 }}
            >
              {tier.tagline}
            </div>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 6,
                marginTop: 8,
                fontSize: 11,
                color: "var(--app-fg-2)",
              }}
            >
              <span>{tier.limits.workspaces} workspace per subscription</span>
              <span>|</span>
              <span>{formatBusinessLimit(tier.limits.businesses)}</span>
              <span>|</span>
              <span>
                {formatLimit(
                  tier.limits.automationRunsPerMonth,
                  "automatisering-runs",
                )}{" "}
                / maand
              </span>
            </div>
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 4,
              fontSize: 13,
              fontWeight: 700,
              color: "var(--app-fg-2)",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            <span>
              {formatPrice(subscription.netPriceCents)}
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 500,
                  color: "var(--app-fg-3)",
                }}
              >
                {" "}
                / {subscription.billingCadence === "yearly" ? "jaar" : "maand"}
              </span>
            </span>
            {subscription.discountPercent > 0 && (
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: "var(--tt-green)",
                }}
              >
                {formatPrice(subscription.listPriceCents)} bruto,{" "}
                {subscription.discountPercent}% korting
              </span>
            )}
          </div>
          <button
            type="button"
            className="btn"
            disabled={!canUseStripe || pendingAction === "payment"}
            onClick={() =>
              redirectFromBillingRoute("/api/billing/payment-method", "payment")
            }
            title={stripeDisabledReason ?? undefined}
          >
            {pendingAction === "payment" ? "Openen..." : "Beheer via Stripe"}
          </button>
        </div>
        {subscription.managedInternally && (
          <DisabledHint>{subscription.invoiceNote}</DisabledHint>
        )}
      </div>

      <div className="card">
        <h3>Wissel plan</h3>
        <p className="desc">
          Betaalde planwissels openen Stripe Checkout. Lokale admin kortingen
          worden daar direct toegepast.
        </p>

        <div
          style={{
            display: "inline-flex",
            gap: 4,
            padding: 4,
            background: "var(--app-card-2)",
            border: "1px solid var(--app-border)",
            borderRadius: 999,
            marginBottom: 14,
            fontSize: 12,
            fontWeight: 700,
          }}
        >
          {(["monthly", "yearly"] as const).map((p) => {
            const active = billing === p;
            return (
              <button
                key={p}
                type="button"
                onClick={() => setBilling(p)}
                style={{
                  padding: "5px 14px",
                  borderRadius: 999,
                  border: "none",
                  cursor: "pointer",
                  background: active ? "var(--tt-green)" : "transparent",
                  color: active ? "#fff" : "var(--app-fg-2)",
                  fontFamily: "var(--type)",
                  fontWeight: 700,
                }}
              >
                {p === "monthly" ? "Maandelijks" : "Jaarlijks (-17%)"}
              </button>
            );
          })}
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
            gap: 12,
          }}
        >
          {PLAN_TIERS.map((plan) => {
            const isCurrent = plan.id === subscription.planId;
            const listPrice = getPlanPriceCents(plan.id, billing);
            const discountPercent = getCheckoutDiscount(
              subscription,
              customer,
              plan.id,
            );
            const netPrice = calculateNetPriceCents(listPrice, discountPercent);
            const checkoutDisabled =
              isCurrent ||
              plan.id === "free" ||
              !canUseStripe ||
              pendingAction === `checkout:${plan.id}` ||
              subscription.managedInternally;
            return (
              <div
                key={plan.id}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  padding: "16px 14px",
                  border: `1.5px solid ${
                    plan.recommended ? "var(--tt-green)" : "var(--app-border)"
                  }`,
                  borderRadius: 14,
                  background: plan.recommended
                    ? "rgba(57,178,85,0.04)"
                    : "var(--app-card-2)",
                  position: "relative",
                }}
              >
                {plan.recommended && (
                  <span
                    style={{
                      position: "absolute",
                      top: -10,
                      right: 12,
                      fontSize: 10,
                      fontWeight: 800,
                      letterSpacing: 0.5,
                      textTransform: "uppercase",
                      padding: "3px 8px",
                      borderRadius: 999,
                      background: "var(--tt-green)",
                      color: "#fff",
                    }}
                  >
                    Aanbevolen
                  </span>
                )}
                <div
                  style={{
                    fontFamily: "var(--hand)",
                    fontSize: 22,
                    fontWeight: 700,
                  }}
                >
                  {plan.name}
                </div>
                <div
                  style={{
                    fontSize: 11.5,
                    color: "var(--app-fg-3)",
                    marginBottom: 12,
                  }}
                >
                  {plan.tagline}
                </div>
                <div
                  style={{
                    fontSize: 26,
                    fontWeight: 800,
                    fontVariantNumeric: "tabular-nums",
                    color: "var(--app-fg)",
                  }}
                >
                  {formatPrice(netPrice)}
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 500,
                      color: "var(--app-fg-3)",
                    }}
                  >
                    {" "}
                    / {billing === "monthly" ? "maand" : "jaar"}
                  </span>
                </div>
                {discountPercent > 0 && listPrice > 0 && (
                  <div
                    style={{
                      marginTop: 5,
                      fontSize: 11.5,
                      color: "var(--tt-green)",
                      fontWeight: 700,
                    }}
                  >
                    {formatPrice(listPrice)} bruto - {discountPercent}% korting
                  </div>
                )}
                <ul
                  style={{
                    listStyle: "none",
                    padding: 0,
                    margin: "12px 0 14px",
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                    fontSize: 12,
                    color: "var(--app-fg-2)",
                    flex: 1,
                  }}
                >
                  {plan.features.map((feature) => (
                    <li
                      key={feature}
                      style={{
                        display: "flex",
                        gap: 6,
                        alignItems: "flex-start",
                      }}
                    >
                      <span
                        style={{
                          color: "var(--tt-green)",
                          fontWeight: 800,
                          marginTop: 1,
                        }}
                      >
                        +
                      </span>
                      {feature}
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  className={isCurrent ? "btn" : "btn primary"}
                  disabled={checkoutDisabled}
                  style={{ marginTop: "auto" }}
                  title={
                    isCurrent
                      ? "Dit is het huidige plan."
                      : plan.id === "free"
                        ? "Downgrades naar Free lopen via support of Stripe portal."
                        : (stripeDisabledReason ?? undefined)
                  }
                  onClick={() =>
                    redirectFromBillingRoute(
                      "/api/billing/checkout",
                      `checkout:${plan.id}`,
                      {
                        planId: plan.id,
                        billingCadence: billing,
                      },
                    )
                  }
                >
                  {isCurrent
                    ? "Huidig plan"
                    : pendingAction === `checkout:${plan.id}`
                      ? "Openen..."
                      : plan.id === "free"
                        ? "Free"
                        : `Checkout ${plan.name}`}
                </button>
              </div>
            );
          })}
        </div>
        {stripeDisabledReason && (
          <DisabledHint>{stripeDisabledReason}</DisabledHint>
        )}
      </div>

      <div className="card">
        <h3>Betaalmethode</h3>
        <p className="desc">
          Stripe gebruikt het lokale factuur-email adres hieronder voor de
          customer en toekomstige facturen.
        </p>
        <div className="field">
          <div className="lbl">
            Status
            <small>
              {stripeCustomerId
                ? `Customer id: ${stripeCustomerId.slice(0, 16)}...`
                : "Nog geen Stripe customer."}
            </small>
          </div>
          <div className="val">
            {stripeCustomerId ? "Verbonden" : "Niet verbonden"}
          </div>
          <button
            type="button"
            className="btn primary"
            disabled={!canUseStripe || pendingAction === "payment"}
            onClick={() =>
              redirectFromBillingRoute("/api/billing/payment-method", "payment")
            }
            title={stripeDisabledReason ?? undefined}
          >
            {pendingAction === "payment"
              ? "Openen..."
              : stripeCustomerId
                ? "Open Stripe portal"
                : "Voeg betaalmethode toe"}
          </button>
        </div>
        <div className="field">
          <div className="lbl">
            Factuur-email
            <small>Wordt op de Stripe customer en facturen gezet.</small>
          </div>
          <input
            type="email"
            value={billingEmail}
            onChange={(e) => setBillingEmail(e.target.value)}
            placeholder="finance@example.com"
            style={inputStyle}
          />
          <button
            type="button"
            className="btn"
            onClick={saveContact}
            disabled={isSaving || !schemaReady}
          >
            {isSaving ? "Opslaan..." : "Opslaan"}
          </button>
        </div>
        <div className="field">
          <div className="lbl">
            BTW-nummer
            <small>Lokale factuurreferentie voor deze workspace.</small>
          </div>
          <input
            type="text"
            value={taxId}
            onChange={(e) => setTaxId(e.target.value)}
            placeholder="NL000099998B57"
            style={inputStyle}
          />
          <button
            type="button"
            className="btn"
            onClick={saveContact}
            disabled={isSaving || !schemaReady}
          >
            {isSaving ? "Opslaan..." : "Opslaan"}
          </button>
        </div>
      </div>

      {isGlobalAdmin && (
        <div className="card">
          <h3>Admin korting</h3>
          <p className="desc">
            Zet een per-workspace korting klaar voordat de klant Checkout opent.
            100% intern beheer is alleen voor Enterprise/admin accounts.
          </p>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
              gap: 10,
            }}
          >
            <label style={{ display: "block", fontSize: 11, fontWeight: 600 }}>
              <span style={{ display: "block", marginBottom: 4 }}>Plan</span>
              <select
                value={adminPlan}
                onChange={(e) => setAdminPlan(e.target.value as PlanId)}
                style={inputStyle}
              >
                {PLAN_TIERS.map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.name}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: "block", fontSize: 11, fontWeight: 600 }}>
              <span style={{ display: "block", marginBottom: 4 }}>Cadans</span>
              <select
                value={adminCadence}
                onChange={(e) =>
                  setAdminCadence(e.target.value as BillingCadence)
                }
                style={inputStyle}
              >
                <option value="monthly">Maandelijks</option>
                <option value="yearly">Jaarlijks</option>
              </select>
            </label>
            <label style={{ display: "block", fontSize: 11, fontWeight: 600 }}>
              <span style={{ display: "block", marginBottom: 4 }}>
                Korting %
              </span>
              <input
                type="number"
                min={0}
                max={100}
                value={adminDiscount}
                onChange={(e) => setAdminDiscount(e.target.value)}
                style={inputStyle}
              />
            </label>
            <label style={{ display: "block", fontSize: 11, fontWeight: 600 }}>
              <span style={{ display: "block", marginBottom: 4 }}>Label</span>
              <input
                type="text"
                value={adminLabel}
                onChange={(e) => setAdminLabel(e.target.value)}
                placeholder="Founding customer"
                style={inputStyle}
              />
            </label>
          </div>
          <label
            style={{
              display: "flex",
              gap: 8,
              alignItems: "center",
              marginTop: 10,
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            <input
              type="checkbox"
              checked={adminInternal}
              onChange={(e) => setAdminInternal(e.target.checked)}
              style={{ accentColor: "var(--tt-green)" }}
            />
            Intern beheerde Enterprise 100% korting
          </label>
          <div style={{ marginTop: 12 }}>
            <button
              type="button"
              className="btn primary"
              onClick={saveAdminDiscount}
              disabled={isSaving || !schemaReady}
            >
              {isSaving ? "Opslaan..." : "Korting opslaan"}
            </button>
          </div>
        </div>
      )}

      <div className="card">
        <h3>Facturen</h3>
        <p className="desc">
          Facturen van de laatste twee maanden uit lokale billing state. De
          refresh-knop synchroniseert Stripe wanneer dat geconfigureerd is.
        </p>
        <div
          style={{ display: "flex", justifyContent: "space-between", gap: 12 }}
        >
          <DisabledHint>
            Verzonden naar: {billingEmail || "geen factuur-email ingesteld"}
          </DisabledHint>
          <button
            type="button"
            className="btn"
            onClick={syncInvoices}
            disabled={
              !canUseStripe || !stripeCustomerId || pendingAction === "invoices"
            }
            title={
              !stripeCustomerId
                ? "Maak eerst een Stripe customer via betaalmethode."
                : (stripeDisabledReason ?? undefined)
            }
          >
            {pendingAction === "invoices" ? "Vernieuwen..." : "Vernieuw"}
          </button>
        </div>
        {invoices.length > 0 ? (
          <div style={{ overflowX: "auto", marginTop: 12 }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: 12.5,
              }}
            >
              <thead>
                <tr style={{ color: "var(--app-fg-3)", textAlign: "left" }}>
                  <th
                    style={{
                      padding: "8px 6px",
                      borderBottom: "1px solid var(--app-border)",
                    }}
                  >
                    Datum
                  </th>
                  <th
                    style={{
                      padding: "8px 6px",
                      borderBottom: "1px solid var(--app-border)",
                    }}
                  >
                    Nummer
                  </th>
                  <th
                    style={{
                      padding: "8px 6px",
                      borderBottom: "1px solid var(--app-border)",
                    }}
                  >
                    Status
                  </th>
                  <th
                    style={{
                      padding: "8px 6px",
                      borderBottom: "1px solid var(--app-border)",
                    }}
                  >
                    Bedrag
                  </th>
                  <th
                    style={{
                      padding: "8px 6px",
                      borderBottom: "1px solid var(--app-border)",
                    }}
                  >
                    PDF
                  </th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((invoice) => (
                  <tr key={invoice.id}>
                    <td
                      style={{
                        padding: "9px 6px",
                        borderBottom: "1px solid var(--app-border)",
                      }}
                    >
                      {formatDate(invoice.issuedAt)}
                    </td>
                    <td
                      style={{
                        padding: "9px 6px",
                        borderBottom: "1px solid var(--app-border)",
                      }}
                    >
                      {invoice.number ?? invoice.stripeInvoiceId}
                    </td>
                    <td
                      style={{
                        padding: "9px 6px",
                        borderBottom: "1px solid var(--app-border)",
                      }}
                    >
                      {invoice.status}
                    </td>
                    <td
                      style={{
                        padding: "9px 6px",
                        borderBottom: "1px solid var(--app-border)",
                      }}
                    >
                      {formatPrice(
                        invoice.amountPaidCents || invoice.amountDueCents,
                      )}
                    </td>
                    <td
                      style={{
                        padding: "9px 6px",
                        borderBottom: "1px solid var(--app-border)",
                      }}
                    >
                      {invoice.invoicePdfUrl || invoice.hostedInvoiceUrl ? (
                        <a
                          href={
                            invoice.invoicePdfUrl ??
                            invoice.hostedInvoiceUrl ??
                            "#"
                          }
                          target="_blank"
                          rel="noreferrer"
                        >
                          Open
                        </a>
                      ) : (
                        "-"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p
            style={{
              fontSize: 12.5,
              color: "var(--app-fg-3)",
              fontStyle: "italic",
              padding: "16px 0",
              margin: 0,
            }}
          >
            Geen facturen in de laatste twee maanden.
          </p>
        )}
      </div>
    </div>
  );
}
