import "server-only";

import { getServiceRoleSupabase } from "../supabase/service";
import { resolveOllamaEndpoint } from "../ollama/endpoint";

export type BrainRecallResult = {
  id: string;
  title: string;
  body: string;
  note_type: string;
  source: string;
  source_path: string | null;
  tags: string[];
  vector_score: number;
  keyword_score: number;
  combined_score: number;
  rerank_score?: number;
};

type RecallOptions = {
  workspaceId: string;
  query: string;
  businessId?: string | null;
  navNodeId?: string | null;
  limit?: number;
};

const EMBEDDING_MODEL = process.env.BRAIN_EMBEDDING_MODEL ?? "bge-m3";
const RERANKER_URL = process.env.BRAIN_RERANKER_URL ?? "";
const RERANKER_MODEL = process.env.BRAIN_RERANKER_MODEL ?? "bge-reranker-v2";

export async function recallBrainNotes(
  opts: RecallOptions,
): Promise<BrainRecallResult[]> {
  const embedding = await embedQuery(opts.workspaceId, opts.query);
  const supabase = getServiceRoleSupabase();
  const { data, error } = await supabase.rpc("recall_notes", {
    _workspace_id: opts.workspaceId,
    _query: opts.query,
    _query_embedding: embedding ? `[${embedding.join(",")}]` : null,
    _business_id: opts.businessId ?? null,
    _nav_node_id: opts.navNodeId ?? null,
    _match_count: Math.max(1, Math.min(opts.limit ?? 10, 50)),
  });
  if (error) {
    console.warn("[brain] recall_notes failed", error);
    return [];
  }

  const rows = ((data ?? []) as BrainRecallResult[]).slice(0, 50);
  return rerank(opts.query, rows, opts.limit ?? 10);
}

async function embedQuery(
  workspaceId: string,
  query: string,
): Promise<number[] | null> {
  const endpoint =
    (await resolveOllamaEndpoint(workspaceId)) ??
    process.env.OLLAMA_BASE_URL ??
    null;
  if (!endpoint) return null;

  try {
    const res = await fetch(`${endpoint}/api/embed`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: EMBEDDING_MODEL, input: query }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      console.warn("[brain] embed failed", res.status, await safeText(res));
      return null;
    }
    const json = (await res.json()) as {
      embeddings?: number[][];
      embedding?: number[];
    };
    const embedding = json.embeddings?.[0] ?? json.embedding ?? null;
    return Array.isArray(embedding) && embedding.length > 0 ? embedding : null;
  } catch (err) {
    console.warn("[brain] embed unavailable", err);
    return null;
  }
}

async function rerank(
  query: string,
  rows: BrainRecallResult[],
  limit: number,
): Promise<BrainRecallResult[]> {
  if (!RERANKER_URL || rows.length <= 1) {
    return rows.slice(0, limit);
  }
  try {
    const res = await fetch(RERANKER_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: RERANKER_MODEL,
        query,
        documents: rows.map((row) => ({
          id: row.id,
          text: `${row.title}\n\n${row.body}`,
        })),
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      console.warn("[brain] rerank failed", res.status, await safeText(res));
      return rows.slice(0, limit);
    }
    const json = (await res.json()) as {
      results?: Array<{ id?: string; index?: number; score?: number }>;
    };
    const scores = new Map<string, number>();
    for (const item of json.results ?? []) {
      const id = item.id ?? (item.index != null ? rows[item.index]?.id : null);
      if (id) scores.set(id, item.score ?? 0);
    }
    return [...rows]
      .map((row) => ({ ...row, rerank_score: scores.get(row.id) ?? 0 }))
      .sort((a, b) => {
        const rerankDelta = (b.rerank_score ?? 0) - (a.rerank_score ?? 0);
        return rerankDelta || b.combined_score - a.combined_score;
      })
      .slice(0, limit);
  } catch (err) {
    console.warn("[brain] rerank unavailable", err);
    return rows.slice(0, limit);
  }
}

async function safeText(res: Response): Promise<string> {
  return (await res.text().catch(() => "")).slice(0, 300);
}
