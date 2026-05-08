export type BillingCadence = "monthly" | "yearly";

export type PlanId = "free" | "pro" | "team" | "enterprise";

export type PlanTier = {
  id: PlanId;
  name: string;
  monthlyCents: number;
  yearlyCents: number;
  limits: {
    workspaces: number;
    businesses: number | "unlimited";
    automationRunsPerMonth: number | "unlimited";
  };
  tagline: string;
  features: string[];
  recommended?: boolean;
};

export type WorkspaceSubscription = {
  planId: PlanId;
  billingCadence: BillingCadence;
  listPriceCents: number;
  discountPercent: number;
  netPriceCents: number;
  discountLabel: string | null;
  invoiceNote: string;
  managedInternally: boolean;
};

export const PLAN_TIERS: PlanTier[] = [
  {
    id: "free",
    name: "Free",
    monthlyCents: 0,
    yearlyCents: 0,
    limits: {
      workspaces: 1,
      businesses: 1,
      automationRunsPerMonth: 5,
    },
    tagline: "Voor solo testing.",
    features: [
      "1 workspace per subscription",
      "1 business",
      "5 automatisering-runs / maand",
      "Manual + webhook triggers",
      "OpenClaw + Hermes via je eigen VPS",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    monthlyCents: 2900,
    yearlyCents: 29000,
    limits: {
      workspaces: 1,
      businesses: 1,
      automationRunsPerMonth: 30,
    },
    tagline: "Voor solo operators die het serieus runnen.",
    features: [
      "1 workspace per subscription",
      "1 business",
      "30 automatisering-runs / maand",
      "Cron schedules op Claude subscription OF API key",
      "Telegram + email notifications",
      "Spend limits + auto-pause",
      "Mobile push (web + Capacitor)",
    ],
    recommended: true,
  },
  {
    id: "team",
    name: "Team",
    monthlyCents: 9900,
    yearlyCents: 99000,
    limits: {
      workspaces: 1,
      businesses: 3,
      automationRunsPerMonth: 150,
    },
    tagline: "Voor teams en agencies met meerdere clients.",
    features: [
      "Alles uit Pro",
      "1 workspace per subscription",
      "3 businesses",
      "150 automatisering-runs / maand",
      "Onbeperkt members + role-based access",
      "Per-business isolated mode (geen workspace fallback)",
      "Audit log export + GDPR DSR helpers",
      "Priority support",
    ],
  },
  {
    id: "enterprise",
    name: "Enterprise",
    monthlyCents: 50000,
    yearlyCents: 500000,
    limits: {
      workspaces: 1,
      businesses: "unlimited",
      automationRunsPerMonth: "unlimited",
    },
    tagline: "Voor interne admins en high-volume operations.",
    features: [
      "Alles uit Team",
      "1 workspace per subscription",
      "Onbeperkte businesses en members",
      "Onbeperkte automatisering-runs",
      "Custom routing, providers en governance",
      "Priority operations support",
      "Enterprise usage review",
      "Maandelijks gefactureerd",
    ],
  },
];

export function getPlanTier(planId: PlanId): PlanTier {
  return PLAN_TIERS.find((tier) => tier.id === planId) ?? PLAN_TIERS[0]!;
}

export function getPlanPriceCents(
  planId: PlanId,
  billingCadence: BillingCadence,
) {
  const tier = getPlanTier(planId);
  return billingCadence === "monthly" ? tier.monthlyCents : tier.yearlyCents;
}

export function calculateNetPriceCents(
  listPriceCents: number,
  discountPercent: number,
) {
  return Math.max(
    0,
    Math.round(listPriceCents * (1 - discountPercent / 100)),
  );
}

export function resolveWorkspaceSubscription(input: {
  isAdmin: boolean;
}): WorkspaceSubscription {
  if (input.isAdmin) {
    const planId: PlanId = "enterprise";
    const billingCadence: BillingCadence = "monthly";
    const listPriceCents = getPlanPriceCents(planId, billingCadence);
    const discountPercent = 100;

    return {
      planId,
      billingCadence,
      listPriceCents,
      discountPercent,
      netPriceCents: calculateNetPriceCents(listPriceCents, discountPercent),
      discountLabel: "Admin account korting",
      invoiceNote: "Enterprise plan van EUR 500 per maand met 100% korting.",
      managedInternally: true,
    };
  }

  return {
    planId: "free",
    billingCadence: "monthly",
    listPriceCents: 0,
    discountPercent: 0,
    netPriceCents: 0,
    discountLabel: null,
    invoiceNote: "Free plan, geen betaalmethode nodig.",
    managedInternally: false,
  };
}
