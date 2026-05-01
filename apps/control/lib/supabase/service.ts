// Service-role Supabase client. ONLY use this from server code that needs
// to bypass RLS — webhook callbacks (no user session), trigger receivers,
// scheduled-job runners. Never import from client components.
//
// We type it as `SupabaseClient<any, "public", any>` because we don't run
// `supabase gen types` yet; once we do (phase 6) we can swap in a real
// Database type and lose the casts.

import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = SupabaseClient<any, "public", any>;

let cached: AnySupabase | undefined;

export function getServiceRoleSupabase(): AnySupabase {
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY (or NEXT_PUBLIC_SUPABASE_URL) is missing — " +
        "callbacks/triggers cannot run without it.",
    );
  }
  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  }) as AnySupabase;
  return cached;
}
