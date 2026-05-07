// POST /api/flows/generate
// Takes a natural-language description and returns a FlowPlan — the
// complete spec for an agent + optional schedule + optional skills.
// Resolution order: Claude (DB → env) → MiniMax (DB → env).

import { NextRequest, NextResponse } from "next/server";

import {
  generateBusinessBlueprintPlan,
  generateFlowPlan,
} from "@aio/ai/flow-planner";
import type { FlowPlanProvider } from "@aio/ai/flow-planner";

import { getCurrentUser } from "../../../../lib/auth/workspace";
import { resolveApiKey } from "../../../../lib/api-keys/resolve";

// Re-export types so components can import from here without depending on @aio/ai directly.
export type {
  FlowPlan,
  AgentPlan,
  SchedulePlan,
  SkillPlan,
  BusinessBlueprintPlan,
} from "@aio/ai/flow-planner";

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const description: string = body?.description ?? "";
  const workspaceId: string = body?.workspace_id ?? "";
  const mode: "automation" | "business" =
    body?.mode === "business" ? "business" : "automation";

  if (!description.trim()) {
    return NextResponse.json({ error: "description is verplicht" }, { status: 400 });
  }

  // Resolve the best available API key: Claude first, then MiniMax fallback.
  let apiKey: string | null = null;
  let provider: FlowPlanProvider = "claude";

  if (workspaceId) {
    apiKey = await resolveApiKey("claude", {
      workspaceId,
      credentialOwnerUserId: user.id,
    });
  }
  if (!apiKey) {
    apiKey = process.env.ANTHROPIC_API_KEY ?? null;
  }

  if (!apiKey) {
    // MiniMax fallback — uses Anthropic-compatible endpoint
    if (workspaceId) {
      apiKey = await resolveApiKey("minimax", {
        workspaceId,
        credentialOwnerUserId: user.id,
      });
    }
    if (!apiKey) {
      apiKey = process.env.MINIMAX_API_KEY ?? null;
    }
    if (apiKey) provider = "minimax";
  }

  if (!apiKey) {
    return NextResponse.json(
      {
        ok: false,
        error: "Geen API key geconfigureerd. Voeg een Claude of MiniMax key toe via Settings → API Keys.",
        needsApiKey: true,
      },
      { status: 500 },
    );
  }

  try {
    const plan =
      mode === "business"
        ? await generateBusinessBlueprintPlan(description, apiKey, provider)
        : await generateFlowPlan(description, apiKey, provider);
    return NextResponse.json({ ok: true, plan, plan_kind: mode });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Genereren mislukt.";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
