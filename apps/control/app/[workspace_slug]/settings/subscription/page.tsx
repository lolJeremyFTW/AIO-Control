// /[ws]/settings/subscription — plan tier picker + payment method +
// invoices. Stripe wiring lands in a follow-up; this page is the
// UX scaffold the user can already navigate to.

import { notFound, redirect } from "next/navigation";

import {
  getCurrentUser,
  getWorkspaceBySlug,
} from "../../../../lib/auth/workspace";
import { getDict } from "../../../../lib/i18n/server";
import { SubscriptionPanel } from "../../../../components/SubscriptionPanel";

type Props = { params: Promise<{ workspace_slug: string }> };

export default async function SubscriptionPage({ params }: Props) {
  const { workspace_slug } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const workspace = await getWorkspaceBySlug(workspace_slug);
  if (!workspace) notFound();

  // Plan tier + Stripe customer id will live on `workspaces` once
  // migration 039 lands. For now everyone is on the free tier and
  // has no Stripe customer yet — the panel renders the appropriate
  // empty/CTA state.
  const currentTier: "free" | "pro" | "team" = "free";
  const stripeCustomerId: string | null = null;

  const { t } = await getDict();

  return (
    <>
      <div className="page-title-row">
        <h1>{t("page.subscription")}</h1>
        <span className="sub">
          {t("page.subscription.sub", { workspace: workspace.name })}
        </span>
      </div>
      <SubscriptionPanel
        currentTier={currentTier}
        stripeCustomerId={stripeCustomerId}
      />
    </>
  );
}
