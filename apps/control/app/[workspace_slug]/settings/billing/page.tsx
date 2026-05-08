// /[ws]/settings/billing - spend limits and subscription in one place.

import { notFound, redirect } from "next/navigation";

import {
  getCurrentUser,
  getProfile,
  getWorkspaceBySlug,
} from "../../../../lib/auth/workspace";
import { resolveWorkspaceSubscription } from "../../../../lib/billing/subscription";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";
import { getDict } from "../../../../lib/i18n/server";
import { SettingsSectionCard } from "../../../../components/SettingsSectionCard";
import { SpendLimitsPanel } from "../../../../components/SpendLimitsPanel";
import { SubscriptionPanel } from "../../../../components/SubscriptionPanel";

type Props = { params: Promise<{ workspace_slug: string }> };

export default async function BillingSettingsPage({ params }: Props) {
  const { workspace_slug } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const workspace = await getWorkspaceBySlug(workspace_slug);
  if (!workspace) notFound();

  const supabase = await createSupabaseServerClient();
  const [{ data: ws }, profile, { t }] = await Promise.all([
    supabase
      .from("workspaces")
      .select(
        "daily_spend_limit_cents, monthly_spend_limit_cents, auto_pause_on_limit",
      )
      .eq("id", workspace.id)
      .maybeSingle(),
    getProfile(user.id),
    getDict(),
  ]);
  const subscription = resolveWorkspaceSubscription({
    isAdmin: Boolean(profile?.is_admin),
  });

  return (
    <>
      <div className="page-title-row">
        <h1>{t("settings.section.billing")}</h1>
        <span className="sub">{t("settings.section.billing.desc")}</span>
      </div>

      <SettingsSectionCard
        id="spend-limits"
        title={t("settings.section.spendLimits")}
      >
        <SpendLimitsPanel
          workspaceSlug={workspace.slug}
          workspaceId={workspace.id}
          initial={{
            daily_cents: (ws?.daily_spend_limit_cents as number | null) ?? null,
            monthly_cents:
              (ws?.monthly_spend_limit_cents as number | null) ?? null,
            auto_pause: (ws?.auto_pause_on_limit as boolean | null) ?? true,
          }}
        />
      </SettingsSectionCard>

      <section id="subscription" style={{ scrollMarginTop: 16 }}>
        <SubscriptionPanel
          subscription={subscription}
          stripeCustomerId={null}
        />
      </section>
    </>
  );
}
