// /[ws]/settings/subscription — plan tier picker + payment method +
// invoices. Stripe wiring lands in a follow-up; this page is the
// UX scaffold the user can already navigate to.

import { notFound, redirect } from "next/navigation";

import {
  getCurrentUser,
  getProfile,
  getWorkspaceBySlug,
} from "../../../../lib/auth/workspace";
import { resolveWorkspaceSubscription } from "../../../../lib/billing/subscription";
import { getDict } from "../../../../lib/i18n/server";
import { SubscriptionPanel } from "../../../../components/SubscriptionPanel";

type Props = { params: Promise<{ workspace_slug: string }> };

export default async function SubscriptionPage({ params }: Props) {
  const { workspace_slug } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const workspace = await getWorkspaceBySlug(workspace_slug);
  if (!workspace) notFound();

  const profile = await getProfile(user.id);
  const subscription = resolveWorkspaceSubscription({
    isAdmin: Boolean(profile?.is_admin),
  });
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
        subscription={subscription}
        stripeCustomerId={stripeCustomerId}
      />
    </>
  );
}
