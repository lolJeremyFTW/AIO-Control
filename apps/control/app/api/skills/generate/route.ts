// POST /api/skills/generate
// Creates one compact workspace skill draft from a natural-language request.

import { NextRequest, NextResponse } from "next/server";

import {
  generateSkillDraftPlan,
  type FlowPlanProvider,
  type SkillDraftPlan,
} from "@aio/ai/flow-planner";

import { resolveApiKey } from "../../../../lib/api-keys/resolve";
import { getCurrentUser } from "../../../../lib/auth/workspace";
import { listSkillsForWorkspace } from "../../../../lib/queries/skills";

export type { SkillDraftPlan } from "@aio/ai/flow-planner";

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const request: string = body?.request ?? "";
  const workspaceId: string = body?.workspace_id ?? "";

  if (!request.trim()) {
    return NextResponse.json({ error: "request is verplicht" }, { status: 400 });
  }

  let apiKey: string | null = null;
  let provider: FlowPlanProvider = "claude";

  if (workspaceId) {
    apiKey = await resolveApiKey("claude", {
      workspaceId,
      credentialOwnerUserId: user.id,
    });
  }
  if (!apiKey) apiKey = process.env.ANTHROPIC_API_KEY ?? null;

  if (!apiKey) {
    if (workspaceId) {
      apiKey = await resolveApiKey("minimax", {
        workspaceId,
        credentialOwnerUserId: user.id,
      });
    }
    if (!apiKey) apiKey = process.env.MINIMAX_API_KEY ?? null;
    if (apiKey) provider = "minimax";
  }

  if (!apiKey) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Geen API key geconfigureerd. Voeg een Claude of MiniMax key toe via Settings -> API Keys.",
        needsApiKey: true,
      },
      { status: 500 },
    );
  }

  try {
    const existingSkills = workspaceId
      ? (await listSkillsForWorkspace(workspaceId)).map((skill) => ({
          name: skill.name,
          description: skill.description,
        }))
      : [];
    const skill: SkillDraftPlan = await generateSkillDraftPlan(
      { request, existingSkills },
      apiKey,
      provider,
    );
    return NextResponse.json({ ok: true, skill });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Skill genereren mislukt.";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
