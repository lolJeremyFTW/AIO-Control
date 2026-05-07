import "server-only";

import { createSupabaseServerClient } from "../supabase/server";

export type ReviewLearningRow = {
  id: string;
  workspace_id: string;
  business_id: string | null;
  nav_node_id: string | null;
  agent_id: string | null;
  queue_item_id: string | null;
  lesson_type: "uncertainty" | "approval" | "rejection" | "operator_note" | "system";
  outcome: "pending" | "approved" | "rejected" | "resolved" | "noted" | null;
  confidence: number | string;
  title: string;
  body: string;
  created_at: string;
};

export async function listReviewLearnings(
  workspaceId: string,
  limit = 20,
): Promise<ReviewLearningRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("agent_review_lessons")
    .select(
      "id, workspace_id, business_id, nav_node_id, agent_id, queue_item_id, lesson_type, outcome, confidence, title, body, created_at",
    )
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("listReviewLearnings failed", error);
    return [];
  }

  return (data ?? []) as ReviewLearningRow[];
}
