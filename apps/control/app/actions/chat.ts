// Chat thread CRUD. Phase-3 ChatPanel kicked off without thread
// persistence — every conversation was forgotten when the panel
// closed. This actions module gives us the missing pieces:
//
//   listThreads(agentId)     → recent threads for the sidebar
//   createThread(agentId)    → fresh thread (auto-titled later)
//   updateThreadTitle(id)    → rename
//   deleteThread(id)         → drop + cascade messages
//   listMessages(threadId)   → load history when switching threads

"use server";

import { revalidatePath } from "next/cache";

import { createSupabaseServerClient } from "../../lib/supabase/server";

export type ThreadRow = {
  id: string;
  agent_id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
};

export type MessageRow = {
  id: string;
  thread_id: string;
  role: "user" | "assistant" | "system";
  content: { text?: string };
  created_at: string;
};

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

export async function listThreads(
  agentId: string,
  limit = 20,
): Promise<ThreadRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("chat_threads")
    .select("id, agent_id, title, created_at, updated_at")
    .eq("agent_id", agentId)
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("listThreads failed", error);
    return [];
  }
  return (data ?? []) as ThreadRow[];
}

export async function createThread(input: {
  workspace_id: string;
  agent_id: string;
  title?: string;
}): Promise<Result<{ id: string }>> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Unauthorized" };

  const { data, error } = await supabase
    .from("chat_threads")
    .insert({
      workspace_id: input.workspace_id,
      agent_id: input.agent_id,
      user_id: user.id,
      title: input.title ?? null,
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Insert failed." };
  return { ok: true, data: { id: data.id } };
}

export async function updateThreadTitle(input: {
  thread_id: string;
  title: string;
}): Promise<Result<null>> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("chat_threads")
    .update({ title: input.title.trim() || null })
    .eq("id", input.thread_id);
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: null };
}

export async function deleteThread(input: {
  thread_id: string;
}): Promise<Result<null>> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("chat_threads")
    .delete()
    .eq("id", input.thread_id);
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: null };
}

export async function listMessages(threadId: string): Promise<MessageRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("chat_messages")
    .select("id, thread_id, role, content, created_at")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true });
  if (error) {
    console.error("listMessages failed", error);
    return [];
  }
  return (data ?? []) as MessageRow[];
}

// Helper used by /api/chat to (1) ensure a thread exists for the
// current user+agent and (2) auto-title the thread off the first user
// message. Called server-side; idempotent.
export async function ensureThreadForChat(input: {
  workspace_id: string;
  agent_id: string;
  thread_id?: string | null;
  first_user_message?: string;
}): Promise<{ id: string } | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  if (input.thread_id) {
    const { data } = await supabase
      .from("chat_threads")
      .select("id")
      .eq("id", input.thread_id)
      .maybeSingle();
    if (data) return { id: data.id as string };
  }

  const title = input.first_user_message
    ? input.first_user_message.slice(0, 80)
    : null;
  const { data, error } = await supabase
    .from("chat_threads")
    .insert({
      workspace_id: input.workspace_id,
      agent_id: input.agent_id,
      user_id: user.id,
      title,
    })
    .select("id")
    .single();
  if (error || !data) {
    console.error("ensureThreadForChat insert failed", error);
    return null;
  }
  return { id: data.id as string };
}

// Persists user + assistant turn after the stream completes. Called
// from the chat route's finally block.
export async function persistChatTurn(input: {
  thread_id: string;
  user_message: string;
  assistant_message: string;
  run_id: string | null;
}): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.from("chat_messages").insert([
    {
      thread_id: input.thread_id,
      role: "user",
      content: { text: input.user_message },
    },
    {
      thread_id: input.thread_id,
      role: "assistant",
      content: { text: input.assistant_message },
      run_id: input.run_id,
    },
  ]);
  // Bump updated_at so the thread floats to the top of the sidebar.
  await supabase
    .from("chat_threads")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", input.thread_id);
  revalidatePath("/", "layout");
}
