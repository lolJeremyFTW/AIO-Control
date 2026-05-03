// Builds the "business context" preamble that gets prepended to
// every agent's system prompt. Agents read this on every call so they
// know:
//   - what business they're working for
//   - the operating mission (rules of engagement)
//   - the active targets / KPIs they should be moving the needle on
//
// Called from /api/chat/[agent_id] right before streamChat.

import "server-only";

import { createSupabaseServerClient } from "../supabase/server";

type Target = {
  id?: string;
  name?: string;
  target?: string;
  current?: string;
  deadline?: string | null;
  status?: "open" | "done" | "abandoned";
};

export async function buildBusinessContextPrefix(
  businessId: string | null,
): Promise<string | null> {
  if (!businessId) return null;
  const supabase = await createSupabaseServerClient();
  const { data: biz } = await supabase
    .from("businesses")
    .select("name, sub, description, mission, targets")
    .eq("id", businessId)
    .maybeSingle();
  if (!biz) return null;

  const lines: string[] = [];
  lines.push(`# Business context — you are working for: ${biz.name}`);
  if (biz.sub) lines.push(`Sub: ${biz.sub}`);
  if (biz.description) {
    lines.push("");
    lines.push("## Description");
    lines.push(biz.description as string);
  }
  if (biz.mission) {
    lines.push("");
    lines.push("## Mission / Operating rules");
    lines.push(biz.mission as string);
  }

  const targets = (biz.targets ?? []) as Target[];
  const open = targets.filter((t) => (t.status ?? "open") === "open");
  if (open.length > 0) {
    lines.push("");
    lines.push("## Active targets (work toward these)");
    for (const t of open) {
      const parts = [`• ${t.name ?? "(unnamed)"}`];
      if (t.target) parts.push(`→ ${t.target}`);
      if (t.current) parts.push(`(current: ${t.current})`);
      if (t.deadline) parts.push(`by ${t.deadline}`);
      lines.push(parts.join(" "));
    }
  }
  const done = targets.filter((t) => t.status === "done");
  if (done.length > 0) {
    lines.push("");
    lines.push("## Already achieved");
    for (const t of done) {
      lines.push(`✓ ${t.name ?? ""} ${t.target ? `(${t.target})` : ""}`);
    }
  }

  // Pull workspace-level system-prompt addition if the user set one.
  const { data: ws } = await supabase
    .from("workspaces")
    .select("default_system_prompt")
    .single();
  const wsPrompt = (ws?.default_system_prompt as string | null) ?? null;
  if (wsPrompt) {
    lines.push("");
    lines.push("## Workspace-wide rules");
    lines.push(wsPrompt);
  }

  return lines.join("\n");
}
