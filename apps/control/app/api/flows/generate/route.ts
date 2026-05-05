// POST /api/flows/generate
// Takes a natural-language description and returns a FlowPlan — the
// complete spec for an agent + optional schedule + optional skills.
// Delegates to @aio/ai/flow-planner which owns the Anthropic SDK call.

import { NextRequest, NextResponse } from "next/server";

import { generateFlowPlan } from "@aio/ai/flow-planner";

import { getCurrentUser } from "../../../../lib/auth/workspace";

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
  if (!description.trim()) {
    return NextResponse.json({ error: "description is verplicht" }, { status: 400 });
  }

  try {
    const plan = await generateFlowPlan(description);
    return NextResponse.json({ ok: true, plan });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Genereren mislukt.";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
