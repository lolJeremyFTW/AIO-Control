// Settings → Subscription panel. UI scaffold for plan tiers +
// payment method + invoices. Stripe wiring lands in a follow-up;
// this commit just gets the visible UX in place so the user can
// see what the plan/billing surface looks like.

"use client";

import { useState } from "react";

type Tier = {
  id: "free" | "pro" | "team";
  name: string;
  monthly: string;
  yearly: string;
  /** Marketing tagline. */
  tagline: string;
  features: string[];
  /** Highlight + recommend in the picker. */
  recommended?: boolean;
};

const TIERS: Tier[] = [
  {
    id: "free",
    name: "Free",
    monthly: "€0",
    yearly: "€0",
    tagline: "Voor solo testing.",
    features: [
      "1 workspace",
      "3 businesses",
      "Manual + webhook triggers",
      "OpenClaw + Hermes via je eigen VPS",
      "Geen routine quota",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    monthly: "€29",
    yearly: "€290",
    tagline: "Voor solo operators die het serieus runnen.",
    features: [
      "Onbeperkt businesses",
      "Cron schedules op Claude subscription OF API key",
      "Telegram + email notifications",
      "Spend limits + auto-pause",
      "Mobile push (web + Capacitor)",
      "10K runs / maand inbegrepen",
    ],
    recommended: true,
  },
  {
    id: "team",
    name: "Team",
    monthly: "€99",
    yearly: "€990",
    tagline: "Voor teams en agencies met meerdere clients.",
    features: [
      "Alles uit Pro",
      "Onbeperkt members + role-based access",
      "Per-business isolated mode (geen workspace fallback)",
      "Audit log export + GDPR DSR helpers",
      "Priority support",
      "100K runs / maand inbegrepen",
    ],
  },
];

type Props = {
  /** Current plan tier — defaults to free when not yet wired. */
  currentTier?: Tier["id"];
  /** Stripe customer id, when present means the user has a card on
   *  file and can be sent to the Stripe portal for management. */
  stripeCustomerId?: string | null;
};

export function SubscriptionPanel({
  currentTier = "free",
  stripeCustomerId,
}: Props) {
  const [billing, setBilling] = useState<"monthly" | "yearly">("monthly");
  const tier = TIERS.find((t) => t.id === currentTier) ?? TIERS[0]!;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {/* ── Current plan ─────────────────────────────────────── */}
      <div className="card">
        <h3>Huidig plan</h3>
        <p className="desc">
          Wat je nu hebt en wanneer 'ie verlengd / vernieuwd wordt.
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
              style={{
                fontSize: 12,
                color: "var(--app-fg-3)",
                marginTop: 2,
              }}
            >
              {tier.tagline}
            </div>
          </div>
          <div
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: "var(--app-fg-2)",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {tier.monthly}
            <span
              style={{
                fontSize: 11,
                fontWeight: 500,
                color: "var(--app-fg-3)",
              }}
            >
              {" "}
              / maand
            </span>
          </div>
          <button type="button" className="btn">
            Beheer abonnement
          </button>
        </div>
      </div>

      {/* ── Tier picker ──────────────────────────────────────── */}
      <div className="card">
        <h3>Wissel plan</h3>
        <p className="desc">
          Up- of downgraden kan op elk moment. Je betaalt naar rato voor
          de rest van je periode.
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
                  background: active
                    ? "var(--tt-green)"
                    : "transparent",
                  color: active ? "#fff" : "var(--app-fg-2)",
                  fontFamily: "var(--type)",
                  fontWeight: 700,
                }}
              >
                {p === "monthly" ? "Maandelijks" : "Jaarlijks (−17%)"}
              </button>
            );
          })}
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 12,
          }}
        >
          {TIERS.map((t) => {
            const isCurrent = t.id === currentTier;
            return (
              <div
                key={t.id}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  padding: "16px 14px",
                  border: `1.5px solid ${
                    t.recommended
                      ? "var(--tt-green)"
                      : "var(--app-border)"
                  }`,
                  borderRadius: 14,
                  background: t.recommended
                    ? "rgba(57,178,85,0.04)"
                    : "var(--app-card-2)",
                  position: "relative",
                }}
              >
                {t.recommended && (
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
                  {t.name}
                </div>
                <div
                  style={{
                    fontSize: 11.5,
                    color: "var(--app-fg-3)",
                    marginBottom: 12,
                  }}
                >
                  {t.tagline}
                </div>
                <div
                  style={{
                    fontSize: 26,
                    fontWeight: 800,
                    fontVariantNumeric: "tabular-nums",
                    color: "var(--app-fg)",
                  }}
                >
                  {billing === "monthly" ? t.monthly : t.yearly}
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
                  {t.features.map((f, i) => (
                    <li
                      key={i}
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
                        ✓
                      </span>
                      {f}
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  className={isCurrent ? "btn" : "btn primary"}
                  disabled={isCurrent}
                  style={{ marginTop: "auto" }}
                >
                  {isCurrent ? "Huidig plan" : `Wissel naar ${t.name}`}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Payment method ───────────────────────────────────── */}
      <div className="card">
        <h3>Betaalmethode</h3>
        <p className="desc">
          Wij storten de facturen via Stripe. Je beheert je kaart, IBAN
          of overschrijving in de Stripe customer portal.
        </p>
        {stripeCustomerId ? (
          <div className="field">
            <div className="lbl">
              Status
              <small>Customer id: {stripeCustomerId.slice(0, 16)}…</small>
            </div>
            <div className="val">Verbonden</div>
            <button type="button" className="btn primary">
              Open Stripe portal
            </button>
          </div>
        ) : (
          <div className="field">
            <div className="lbl">
              Status
              <small>Geen kaart of IBAN op file.</small>
            </div>
            <div className="val">Niet verbonden</div>
            <button type="button" className="btn primary">
              Voeg betaalmethode toe
            </button>
          </div>
        )}
        <div className="field">
          <div className="lbl">
            Factuur-email
            <small>Waar Stripe de PDF naar stuurt.</small>
          </div>
          <div>
            <input
              type="email"
              defaultValue=""
              placeholder="finance@tromptech.life"
              style={{
                width: "100%",
                background: "var(--app-card-2)",
                border: "1.5px solid var(--app-border)",
                color: "var(--app-fg)",
                padding: "8px 10px",
                borderRadius: 8,
                fontFamily: "var(--type)",
                fontSize: 13,
              }}
            />
          </div>
          <button type="button" className="btn">
            Opslaan
          </button>
        </div>
        <div className="field">
          <div className="lbl">
            BTW-nummer
            <small>Wordt op de factuur vermeld voor reverse-charge.</small>
          </div>
          <div>
            <input
              type="text"
              defaultValue=""
              placeholder="NL000099998B57"
              style={{
                width: "100%",
                background: "var(--app-card-2)",
                border: "1.5px solid var(--app-border)",
                color: "var(--app-fg)",
                padding: "8px 10px",
                borderRadius: 8,
                fontFamily: "var(--type)",
                fontSize: 13,
              }}
            />
          </div>
          <button type="button" className="btn">
            Opslaan
          </button>
        </div>
      </div>

      {/* ── Invoices ─────────────────────────────────────────── */}
      <div className="card">
        <h3>Facturen</h3>
        <p className="desc">
          De laatste 12 facturen. Klik op een rij om de PDF te openen.
        </p>
        <p
          style={{
            fontSize: 12.5,
            color: "var(--app-fg-3)",
            fontStyle: "italic",
            padding: "16px 0",
          }}
        >
          Geen facturen — koppel eerst een betaalmethode hierboven.
        </p>
      </div>
    </div>
  );
}
