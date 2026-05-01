// Returns which OAuth providers the auth-form should show. We don't have a
// public Supabase API for "list enabled providers", so we expose a simple
// env-driven boolean per provider. Set ENABLE_OAUTH_GOOGLE=1 (or GITHUB)
// in .env.production once you've configured the provider on the Supabase
// dashboard — the form will then render the button.

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    google: process.env.ENABLE_OAUTH_GOOGLE === "1",
    github: process.env.ENABLE_OAUTH_GITHUB === "1",
  });
}
