// Supabase client for the browser — used inside "use client" components for
// auth flows (signInWithPassword), realtime subscriptions, and any other
// browser-side mutation. The session lives in cookies set by the middleware.

"use client";

import { createBrowserClient } from "@supabase/ssr";

let cached: ReturnType<typeof createBrowserClient> | undefined;

export function getSupabaseBrowserClient() {
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. " +
        "Set them in .env.local.",
    );
  }
  cached = createBrowserClient(url, anon, {
    db: { schema: "aio_control" },
  });
  return cached;
}
