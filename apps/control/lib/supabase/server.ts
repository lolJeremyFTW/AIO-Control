// Supabase client bound to the current request's cookies. Use this in Server
// Components, Route Handlers, and Server Actions. Reading cookies forces
// dynamic rendering, which is what we want for any page that touches user data.

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

import { requireEnv } from "./env";

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  return createServerClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      // We isolate our tables in the aio_control schema so this Supabase
      // instance can host other apps too. PostgREST exposes the schema via
      // PGRST_DB_SCHEMAS.
      db: { schema: "aio_control" },
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Server Components cannot mutate cookies; that's fine — the
            // middleware already refreshed the session for this request.
          }
        },
      },
    },
  );
}
