import { NextResponse } from "next/server";

import { AIO_TOOLS } from "@aio/ai/aio-tools";
import { listMcpServerCatalog } from "@aio/ai/mcp/registry";

import { createSupabaseServerClient } from "../../../lib/supabase/server";

export const dynamic = "force-dynamic";

type CommandItem = {
  id: string;
  title: string;
  description: string;
  command: string;
  kind: "mcp" | "agent" | "skill" | "tool" | "command";
};

export async function GET(req: Request) {
  const url = new URL(req.url);
  const workspaceSlug = url.searchParams.get("workspace_slug");
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const items: CommandItem[] = [
    {
      id: "commands",
      title: "Commands",
      description: "Show live slash commands, MCP servers, skills, agents, and tools.",
      command: "/commands",
      kind: "command",
    },
    ...listMcpServerCatalog().map((mcp) => ({
      id: `mcp:${mcp.id}`,
      title: mcp.title,
      description: mcp.description,
      command: mcp.command,
      kind: "mcp" as const,
    })),
    ...Object.values(AIO_TOOLS).map((tool) => ({
      id: `tool:${tool.name}`,
      title: tool.name,
      description: tool.description,
      command: `/${tool.name}`,
      kind: "tool" as const,
    })),
  ];

  if (workspaceSlug) {
    const { data: workspace } = await supabase
      .from("workspaces")
      .select("id")
      .eq("slug", workspaceSlug)
      .maybeSingle();

    if (workspace?.id) {
      const [{ data: agents }, { data: skills }] = await Promise.all([
        supabase
          .from("agents")
          .select("id, name, provider, model, kind")
          .eq("workspace_id", workspace.id)
          .is("archived_at", null)
          .order("name", { ascending: true }),
        supabase
          .from("skills")
          .select("id, name, description")
          .eq("workspace_id", workspace.id)
          .is("archived_at", null)
          .order("name", { ascending: true }),
      ]);

      for (const agent of agents ?? []) {
        items.push({
          id: `agent:${agent.id}`,
          title: agent.name,
          description: `${agent.kind} agent via ${agent.provider}${agent.model ? ` / ${agent.model}` : ""}`,
          command: `/agent:${slugify(agent.name)}`,
          kind: "agent",
        });
      }
      for (const skill of skills ?? []) {
        items.push({
          id: `skill:${skill.id}`,
          title: skill.name,
          description: skill.description ?? "",
          command: `/skill:${slugify(skill.name)}`,
          kind: "skill",
        });
      }
    }
  }

  return NextResponse.json({ items });
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
