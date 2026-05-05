// POST /api/flows/generate
// Takes a natural-language description and returns a FlowPlan — the
// complete spec for an agent + optional schedule + optional skills.
// Delegates to @aio/ai/flow-planner which owns the Anthropic SDK call.
// Resolves the API key via the workspace key hierarchy (same as agents).

import { NextRequest, NextResponse } from "next/server";

import { generateFlowPlan } from "@aio/ai/flow-planner";

import { getCurrentUser, getWorkspaceBySlug } from "../../../../lib/auth/workspace";
import { resolveApiKey } from "../../../../lib/api-keys/resolve";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";

// Re-export types so components can import from here without depending on @aio/ai directly.
export type {
  FlowPlan,
  AgentPlan,
  SchedulePlan,
  SkillPlan,
} from "@aio/ai/flow-planner";

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const description: string = body?.description ?? "";
  const workspaceId: string = body?.workspace_id ?? "";

  if (!description.trim()) {
    return NextResponse.json({ error: "description is verplicht" }, { status: 400 });
  }

  // Resolve Claude API key the same way agents do — workspace hierarchy + env fallback.
  let apiKey: string | null = null;
  if (workspaceId) {
    apiKey = await resolveApiKey("claude", { workspaceId });
  }
  if (!apiKey) {
    apiKey = process.env.ANTHROPIC_API_KEY ?? null;
  }
  if (!apiKey) {
    return NextResponse.json(
      { ok: false, error: "Geen Anthropic API key geconfigureerd. Voeg er een toe via Settings → API Keys." },
      { status: 500 },
    );
  }

  try {
    const plan = await generateFlowPlan(description, apiKey);
    return NextResponse.json({ ok: true, plan });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Genereren mislukt.";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
