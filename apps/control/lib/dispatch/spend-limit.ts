// Pre-flight spend-limit check used by the dispatcher and by the
// chat-stream entry point. Returns either {ok: true} or a structured
// reason — the caller decides whether to surface the error to the
// user or just log it.
//
// Resolution: business override → workspace default → no limit.
// Auto-pause: if the workspace flag is on AND we're over the daily
// limit, we flip the business to status='paused' so further triggers
// short-circuit before they even hit the dispatcher.

import "server-only";

import { getServiceRoleSupabase } from "../supabase/service";

export type SpendCheckResult =
  | { ok: true }
  | {
      ok: false;
      reason: "daily_exceeded" | "monthly_exceeded";
      limit_cents: number;
      current_cents: number;
      auto_paused: boolean;
    };

export async function checkSpendLimit(
  business_id: string,
): Promise<SpendCheckResult> {
  const supabase = getServiceRoleSupabase();
  const { data: state, error } = await supabase
    .from("spend_limit_state")
    .select(
      "business_id, workspace_id, status, daily_limit_cents, monthly_limit_cents, cost_24h_cents, cost_30d_cents, auto_pause_on_limit",
    )
    .eq("business_id", business_id)
    .maybeSingle();

  if (error || !state) {
    // If we can't read the view (RLS error, view missing), fail open
    // — better to let the run go than to surprise-block the user.
    return { ok: true };
  }

  const daily = state.daily_limit_cents as number | null;
  const monthly = state.monthly_limit_cents as number | null;
  const cost24h = (state.cost_24h_cents as number) ?? 0;
  const cost30d = (state.cost_30d_cents as number) ?? 0;
  const autoPause = !!state.auto_pause_on_limit;

  if (daily != null && cost24h >= daily) {
    if (autoPause) {
      await supabase
        .from("businesses")
        .update({ status: "paused" })
        .eq("id", business_id);
    }
    return {
      ok: false,
      reason: "daily_exceeded",
      limit_cents: daily,
      current_cents: cost24h,
      auto_paused: autoPause,
    };
  }
  if (monthly != null && cost30d >= monthly) {
    if (autoPause) {
      await supabase
        .from("businesses")
        .update({ status: "paused" })
        .eq("id", business_id);
    }
    return {
      ok: false,
      reason: "monthly_exceeded",
      limit_cents: monthly,
      current_cents: cost30d,
      auto_paused: autoPause,
    };
  }

  return { ok: true };
}
