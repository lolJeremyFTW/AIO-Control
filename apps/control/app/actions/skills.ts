// Server actions for skill CRUD + per-agent allow-list. Skills are
// workspace-scoped reusable markdown snippets that get injected into
// an agent's system prompt when the agent has the skill in
// allowed_skills. Modeled after OpenClaw's SKILL.md design.

"use server";

import { revalidatePath } from "next/cache";

import {
  getPopularOnlineSkill,
  getSkillFromGitHubUrl,
  listPopularOnlineSkills,
} from "../../lib/skills/online-catalog";
import { createSupabaseServerClient } from "../../lib/supabase/server";

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export type SkillInput = {
  workspace_slug: string;
  workspace_id: string;
  name: string;
  description: string;
  body: string;
};

export type OnlineSkillPreview = {
  id: string;
  name: string;
  description: string;
  source_url: string;
  source_provider: string;
  body_chars: number;
};

export async function createSkill(
  input: SkillInput,
): Promise<ActionResult<{ id: string }>> {
  if (!input.name.trim()) return { ok: false, error: "Naam mag niet leeg zijn." };
  if (!input.description.trim())
    return { ok: false, error: "Beschrijving mag niet leeg zijn." };
  if (!input.body.trim()) return { ok: false, error: "Body mag niet leeg zijn." };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("skills")
    .insert({
      workspace_id: input.workspace_id,
      name: input.name.trim(),
      description: input.description.trim(),
      body: input.body.trim(),
    })
    .select("id")
    .single();
  if (error || !data) {
    return { ok: false, error: error?.message ?? "Insert failed." };
  }
  revalidateSkillPaths(input.workspace_slug);
  return { ok: true, data: { id: data.id } };
}

export async function updateSkill(input: {
  workspace_slug: string;
  id: string;
  patch: { name?: string; description?: string; body?: string };
}): Promise<ActionResult<null>> {
  const patch: Record<string, unknown> = {};
  if (input.patch.name !== undefined) {
    if (!input.patch.name.trim())
      return { ok: false, error: "Naam mag niet leeg zijn." };
    patch.name = input.patch.name.trim();
  }
  if (input.patch.description !== undefined) {
    if (!input.patch.description.trim())
      return { ok: false, error: "Beschrijving mag niet leeg zijn." };
    patch.description = input.patch.description.trim();
  }
  if (input.patch.body !== undefined) {
    if (!input.patch.body.trim())
      return { ok: false, error: "Body mag niet leeg zijn." };
    patch.body = input.patch.body.trim();
  }
  if (Object.keys(patch).length === 0) return { ok: true, data: null };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("skills")
    .update(patch)
    .eq("id", input.id);
  if (error) return { ok: false, error: error.message };
  revalidateSkillPaths(input.workspace_slug);
  return { ok: true, data: null };
}

export async function archiveSkill(input: {
  workspace_slug: string;
  id: string;
}): Promise<ActionResult<null>> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("skills")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", input.id);
  if (error) return { ok: false, error: error.message };
  revalidateSkillPaths(input.workspace_slug);
  return { ok: true, data: null };
}

export async function previewPopularOnlineSkills(): Promise<
  ActionResult<OnlineSkillPreview[]>
> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Niet ingelogd." };

  const skills = await listPopularOnlineSkills();
  return {
    ok: true,
    data: skills.map((skill) => ({
      id: skill.id,
      name: skill.name,
      description: skill.description,
      source_url: skill.source_url,
      source_provider: skill.source_provider,
      body_chars: skill.body.length,
    })),
  };
}

export async function importPopularOnlineSkill(input: {
  workspace_slug: string;
  workspace_id: string;
  template_id: string;
}): Promise<ActionResult<{ id: string; name: string }>> {
  const skill = await getPopularOnlineSkill(input.template_id);
  if (!skill) return { ok: false, error: "Online skill niet gevonden." };
  return upsertImportedSkill({
    workspace_slug: input.workspace_slug,
    workspace_id: input.workspace_id,
    name: skill.name,
    description: skill.description,
    body: skill.body,
  });
}

export async function importSkillFromGitHubUrl(input: {
  workspace_slug: string;
  workspace_id: string;
  url: string;
}): Promise<ActionResult<{ id: string; name: string }>> {
  const skill = await getSkillFromGitHubUrl(input.url);
  if (!skill) {
    return {
      ok: false,
      error:
        "Geen geldige GitHub markdown skill gevonden. Gebruik een github.com/.../blob/.../*.md of raw.githubusercontent.com URL.",
    };
  }
  return upsertImportedSkill({
    workspace_slug: input.workspace_slug,
    workspace_id: input.workspace_id,
    name: skill.name,
    description: skill.description,
    body: skill.body,
  });
}

async function upsertImportedSkill(input: SkillInput): Promise<
  ActionResult<{ id: string; name: string }>
> {
  if (!input.name.trim()) return { ok: false, error: "Naam mag niet leeg zijn." };
  if (!input.description.trim())
    return { ok: false, error: "Beschrijving mag niet leeg zijn." };
  if (!input.body.trim()) return { ok: false, error: "Body mag niet leeg zijn." };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("skills")
    .upsert(
      {
        workspace_id: input.workspace_id,
        name: input.name.trim(),
        description: input.description.trim(),
        body: input.body.trim(),
        archived_at: null,
      },
      { onConflict: "workspace_id,name" },
    )
    .select("id, name")
    .single();
  if (error || !data) {
    return { ok: false, error: error?.message ?? "Import failed." };
  }
  revalidateSkillPaths(input.workspace_slug);
  return { ok: true, data: { id: data.id, name: data.name } };
}

/** Replace the agent's allowed_skills array with the given ids. Pass
 *  an empty array to clear. Pass null to set the column NULL (same
 *  effect for the system-prompt builder, but matches the schema's
 *  nullable shape). */
export async function setAgentSkills(input: {
  workspace_slug: string;
  business_id: string | null;
  agent_id: string;
  skill_ids: string[];
}): Promise<ActionResult<null>> {
  const supabase = await createSupabaseServerClient();
  const value = input.skill_ids.length === 0 ? null : input.skill_ids;
  const { error } = await supabase
    .from("agents")
    .update({ allowed_skills: value })
    .eq("id", input.agent_id);
  if (error) return { ok: false, error: error.message };
  if (input.business_id) {
    revalidatePath(`/${input.workspace_slug}/business/${input.business_id}`);
  } else {
    revalidatePath(`/${input.workspace_slug}/agents`);
  }
  revalidatePath(`/${input.workspace_slug}/skills`);
  revalidatePath(`/${input.workspace_slug}/profile`);
  return { ok: true, data: null };
}

function revalidateSkillPaths(workspaceSlug: string) {
  revalidatePath(`/${workspaceSlug}/skills`);
  revalidatePath(`/${workspaceSlug}/profile`);
  revalidatePath(`/${workspaceSlug}/agents`);
}
