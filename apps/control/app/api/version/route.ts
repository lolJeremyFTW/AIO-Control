// Returns the deployed commit SHA + build time. The systemd unit / GH
// Actions workflow injects GIT_COMMIT_SHA at deploy time. Useful for
// "is the new build live?" smoke checks.

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    {
      commit: process.env.GIT_COMMIT_SHA ?? "unknown",
      built_at: process.env.BUILD_TIME ?? "unknown",
      base_path: process.env.BASE_PATH ?? "",
      node: process.version,
    },
    { headers: { "cache-control": "no-store" } },
  );
}
