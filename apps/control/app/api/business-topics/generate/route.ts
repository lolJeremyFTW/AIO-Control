// POST /api/business-topics/generate
// Suggests strong root topics for the new-business wizard using the same
// Claude -> MiniMax key resolution path as the AI Flow Builder.

import { NextRequest, NextResponse } from "next/server";

import {
  generateBusinessTopicSuggestions,
  type FlowPlanProvider,
} from "@aio/ai/flow-planner";

import { getCurrentUser } from "../../../../lib/auth/workspace";
import { resolveApiKey } from "../../../../lib/api-keys/resolve";

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const workspaceId: string = body?.workspace_id ?? "";
  const name: string = body?.name ?? "";
  const description: string = body?.description ?? "";
  const mission: string = body?.mission ?? "";
  const targets = Array.isArray(body?.targets) ? body.targets : [];
  const existingTopics = Array.isArray(body?.existing_topics)
    ? body.existing_topics
    : [];

  if (!workspaceId) {
    return NextResponse.json({ ok: false, error: "workspace_id is verplicht" }, { status: 400 });
  }
  if (!name.trim() && !description.trim() && !mission.trim()) {
    return NextResponse.json(
      {
        ok: false,
        error: "Vul eerst een businessnaam of beschrijving in.",
      },
      { status: 400 },
    );
  }

  let apiKey: string | null = await resolveApiKey("claude", {
    workspaceId,
    credentialOwnerUserId: user.id,
  });
  let provider: FlowPlanProvider = "claude";

  if (!apiKey) {
    apiKey = process.env.ANTHROPIC_API_KEY ?? null;
  }

  if (!apiKey) {
    apiKey = await resolveApiKey("minimax", {
      workspaceId,
      credentialOwnerUserId: user.id,
    });
    if (!apiKey) apiKey = process.env.MINIMAX_API_KEY ?? null;
    if (apiKey) provider = "minimax";
  }

  if (!apiKey) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Geen Claude of MiniMax API key gevonden. Voeg een key toe via Settings -> API Keys.",
        needsApiKey: true,
      },
      { status: 500 },
    );
  }

  try {
    const suggestions = await generateBusinessTopicSuggestions(
      {
        name,
        description,
        mission,
        targets,
        existingTopics,
      },
      apiKey,
      provider,
    );
    return NextResponse.json({ ok: true, suggestions });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Topic-suggesties genereren mislukt.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
