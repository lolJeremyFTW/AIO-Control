// Helper that the Next.js middleware uses on every request to refresh the
// Supabase auth session and forward an updated cookie to the client.
// Pattern from https://supabase.com/docs/guides/auth/server-side/nextjs.

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = new Set<string>([
  "/login",
  "/signup",
  "/auth/callback",
  "/api/health",
  "/api/version",
  // The login form probes these to figure out whether to render OAuth and
  // push UI. Must be reachable without a session.
  "/api/auth/oauth-config",
  "/api/push/key",
]);

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({
    request: { headers: request.headers },
  });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // If env is missing during local dev, let pages render as-is so the user
  // sees a clear error in the page rather than the middleware silently 500ing.
  if (!url || !anon) return response;

  const supabase = createServerClient(url, anon, {
    db: { schema: "aio_control" },
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet) => {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // IMPORTANT: getUser() is the call that refreshes the session. Don't remove.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isPublic =
    PUBLIC_PATHS.has(path) ||
    path.startsWith("/_next") ||
    path.startsWith("/api/triggers/");

  if (!user && !isPublic) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", path);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}
