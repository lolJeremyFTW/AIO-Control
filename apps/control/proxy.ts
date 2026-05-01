// Next.js 16 "proxy" convention (formerly "middleware"). Runs on every
// request — refreshes the Supabase session cookie and bounces unauthed
// requests to /login. Detail logic lives in lib/supabase/middleware.ts so
// the same code can be unit-tested off the request lifecycle.

import type { NextRequest } from "next/server";

import { updateSession } from "./lib/supabase/middleware";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
