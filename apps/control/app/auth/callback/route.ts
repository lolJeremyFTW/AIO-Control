// OAuth callback. Supabase Auth redirects the user here with a `code` query
// param after sign-in with an external provider. We exchange it for a
// session cookie and bounce the user to whatever `next` they originally
// asked for (or to `/` which the root redirect resolves).

import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "../../../lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/";

  if (!code) {
    return NextResponse.redirect(new URL("/login?error=no_code", url));
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(error.message)}`, url),
    );
  }

  return NextResponse.redirect(new URL(next, url));
}
