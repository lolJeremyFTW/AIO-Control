"use server";

import { revalidatePath } from "next/cache";

import {
  createImprovement,
  deleteImprovement,
  findSimilarImprovements,
  updateImprovementStatus,
  type SimilarImprovement,
} from "../../lib/queries/improvements";

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export async function addImprovement(input: {
  workspace_slug: string;
  workspace_id: string;
  title: string;
  description: string;
}): Promise<ActionResult<{ id: string; similar?: SimilarImprovement[] }>> {
  if (!input.title.trim()) return { ok: false, error: "Titel mag niet leeg zijn." };
  if (!input.description.trim()) {
    return { ok: false, error: "Beschrijving mag niet leeg zijn." };
  }

  try {
    // Check for similar existing improvements
    const similar = await findSimilarImprovements(
      input.workspace_id,
      input.title,
      input.description,
      0.5,
    );

    const result = await createImprovement({
      workspace_id: input.workspace_id,
      title: input.title,
      description: input.description,
    });
    revalidatePath(`/${input.workspace_slug}/self-improving`);
    return { ok: true, data: { id: result.id, similar } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unknown error" };
  }
}

export async function approveImprovement(input: {
  workspace_slug: string;
  workspace_id: string;
  id: string;
}): Promise<ActionResult<null>> {
  try {
    await updateImprovementStatus({
      id: input.id,
      workspace_id: input.workspace_id,
      status: "approved",
    });
    revalidatePath(`/${input.workspace_slug}/self-improving`);
    return { ok: true, data: null };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unknown error" };
  }
}

export async function rejectImprovement(input: {
  workspace_slug: string;
  workspace_id: string;
  id: string;
}): Promise<ActionResult<null>> {
  try {
    await updateImprovementStatus({
      id: input.id,
      workspace_id: input.workspace_id,
      status: "rejected",
    });
    revalidatePath(`/${input.workspace_slug}/self-improving`);
    return { ok: true, data: null };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unknown error" };
  }
}

export async function markBuilt(input: {
  workspace_slug: string;
  workspace_id: string;
  id: string;
  built_by: string;
  built_notes?: string;
}): Promise<ActionResult<null>> {
  try {
    await updateImprovementStatus({
      id: input.id,
      workspace_id: input.workspace_id,
      status: "built",
      built_by: input.built_by,
      built_notes: input.built_notes,
    });
    revalidatePath(`/${input.workspace_slug}/self-improving`);
    return { ok: true, data: null };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unknown error" };
  }
}

export async function removeImprovement(input: {
  workspace_slug: string;
  workspace_id: string;
  id: string;
}): Promise<ActionResult<null>> {
  try {
    await deleteImprovement({ id: input.id, workspace_id: input.workspace_id });
    revalidatePath(`/${input.workspace_slug}/self-improving`);
    return { ok: true, data: null };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Unknown error" };
  }
}
