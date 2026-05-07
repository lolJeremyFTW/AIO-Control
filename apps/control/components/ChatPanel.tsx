// Floating green chatbot bubble + the panel that opens when you click it.
// Lightweight, no external chat library — just streams AG-UI events from
// /api/chat/[agent_id] and renders tokens as they arrive.
//
// Phase 3 ships chat-with-one-agent. Multi-thread history lands in fase 3.5
// once we wire up chat_threads queries.

"use client";

import { useRouter } from "next/navigation";
import type { CSSProperties } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { ChatIcon, PlusIcon } from "@aio/ui/icon";
import type { AGUIEvent, ChatMessage } from "@aio/ai/ag-ui";

import type { AgentRow } from "../lib/queries/agents";
import { getSupabaseBrowserClient } from "../lib/supabase/client";
import {
  deleteThread,
  listMessages,
  listThreads,
  type ThreadRow,
} from "../app/actions/chat";
import { MarkdownText } from "./MarkdownText";

type Props = {
  agents: AgentRow[];
  /** Used to deep-link to /[ws]/business/[id]/agents when zero agents
   *  exist so the empty-state click goes somewhere useful. */
  workspaceSlug?: string;
  firstBusinessId?: string;
};

type UIMessage = {
  id: string;
  role: "user" | "assistant" | "error" | "system";
  text: string;
  pending?: boolean;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    costCents?: number;
    estimatedInput?: boolean;
    estimatedOutput?: boolean;
  };
  /** When set, the bubble renders an ask_followup question with
   *  optional multiple-choice buttons (a click sends that label as
   *  the user's next message). */
  askFollowup?: {
    question: string;
    options?: { label: string; description?: string }[];
  };
  /** Inline tool-call chips so the user sees what the agent is doing. */
  toolCalls?: Array<{ id: string; name: string; argsPreview: string }>;
  /** When the model wants to confirm a destructive action. The
   *  approve flow round-trips via the chat-route's approve_tool
   *  body field — `tool_call_id` is what the server uses to look
   *  the pending state back up. */
  confirm?: {
    kind: string;
    summary: string;
    tool_call_id: string;
    decided?: "approve" | "cancel";
  };
  /** Optional clickable navigation hint emitted by open_ui_at. */
  navHint?: { path: string; label?: string };
  /** Timestamp when this message was created. */
  createdAt: Date;
};

type CommandItem = {
  id: string;
  title: string;
  description: string;
  command: string;
  kind: "mcp" | "agent" | "skill" | "tool" | "command";
};

const chatboxDockStyle: CSSProperties = {
  position: "fixed",
  right: 18,
  bottom: 18,
  left: "auto",
  top: "auto",
};

export function ChatPanel({ agents, workspaceSlug, firstBusinessId }: Props) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [agentId, setAgentId] = useState<string | null>(
    agents[0]?.id ?? null,
  );
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [threads, setThreads] = useState<ThreadRow[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [showSidebar, setShowSidebar] = useState(false);
  const [unreadPingCount, setUnreadPingCount] = useState(0);
  const [storageLoaded, setStorageLoaded] = useState(false);
  const [commands, setCommands] = useState<CommandItem[]>([]);
  const [commandIndex, setCommandIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const restoredThreadRef = useRef(false);
  const autoLoadedThreadRef = useRef(false);
  const storageKey = `aio-chat:${workspaceSlug ?? "workspace"}`;

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
    const params = workspaceSlug
      ? `?workspace_slug=${encodeURIComponent(workspaceSlug)}`
      : "";
    fetch(`${base}/api/commands${params}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((json: { items?: CommandItem[] } | null) => {
        if (Array.isArray(json?.items)) setCommands(json.items);
      })
      .catch(() => {
        setCommands([]);
      });
  }, [mounted, workspaceSlug]);

  useEffect(() => {
    if (!mounted) return;
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) return;
      const saved = JSON.parse(raw) as {
        open?: boolean;
        agentId?: string | null;
        threadId?: string | null;
      };
      if (saved.agentId && agents.some((a) => a.id === saved.agentId)) {
        setAgentId(saved.agentId);
      }
      if (saved.threadId) {
        restoredThreadRef.current = true;
        setActiveThreadId(saved.threadId);
      }
      if (saved.open) setOpen(true);
    } catch {
      // Ignore stale localStorage from older panel versions.
    } finally {
      setStorageLoaded(true);
    }
  }, [agents, mounted, storageKey]);

  useEffect(() => {
    if (!mounted || !storageLoaded) return;
    try {
      window.localStorage.setItem(
        storageKey,
        JSON.stringify({ open, agentId, threadId: activeThreadId }),
      );
    } catch {
      // Non-critical; DB persistence still keeps the actual chat history.
    }
  }, [activeThreadId, agentId, mounted, open, storageKey, storageLoaded]);

  const startNewThread = useCallback(() => {
    restoredThreadRef.current = false;
    autoLoadedThreadRef.current = true;
    setShowSidebar(false);
    setActiveThreadId(null);
    setMessages([]);
  }, []);

  // Reload thread list whenever the open agent changes.
  useEffect(() => {
    if (!agentId) {
      setThreads([]);
      return;
    }
    let cancelled = false;
    void listThreads(agentId).then((rows) => {
      if (cancelled) return;
      setThreads(rows);

      const nextThreadId =
        activeThreadId && rows.some((row) => row.id === activeThreadId)
          ? activeThreadId
          : rows[0]?.id ?? null;

      if (
        nextThreadId &&
        (restoredThreadRef.current ||
          (!activeThreadId && messages.length === 0 && !autoLoadedThreadRef.current))
      ) {
        restoredThreadRef.current = false;
        autoLoadedThreadRef.current = true;
        setActiveThreadId(nextThreadId);
        void listMessages(nextThreadId).then((messageRows) => {
          if (cancelled) return;
          setMessages(
            messageRows.map((r) => ({
              id: r.id,
              role:
                r.role === "system"
                  ? "assistant"
                  : (r.role as "user" | "assistant"),
              text: r.content?.text ?? "",
              createdAt: r.created_at ? new Date(r.created_at) : new Date(),
            })),
          );
        });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [activeThreadId, agentId, messages.length, open]);

  // Switch threads → load history.
  const switchThread = useCallback(async (threadId: string | null) => {
    setShowSidebar(false);
    setActiveThreadId(threadId);
    if (!threadId) {
      setMessages([]);
      return;
    }
    const rows = await listMessages(threadId);
    setMessages(
      rows.map((r) => ({
        id: r.id,
        role: r.role === "system" ? "assistant" : (r.role as "user" | "assistant"),
        text: r.content?.text ?? "",
        createdAt: r.created_at ? new Date(r.created_at) : new Date(),
      })),
    );
  }, []);

  useEffect(() => {
    if (open) listRef.current?.scrollTo({ top: 99999 });
  }, [messages, open]);

  useEffect(() => {
    if (open) setUnreadPingCount(0);
  }, [open]);

  useEffect(() => {
    if (!agentId) return;
    let supabase: ReturnType<typeof getSupabaseBrowserClient>;
    try {
      supabase = getSupabaseBrowserClient();
    } catch {
      return;
    }

    type InsertPayload = {
      new?: {
        id?: string;
        thread_id?: string;
        role?: "user" | "assistant" | "system";
        content?: { text?: string; kind?: string };
        created_at?: string;
      };
    };

    const channel = supabase
      .channel(`chat_messages:agent:${agentId}`)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .on(
        "postgres_changes" as any,
        {
          event: "INSERT",
          schema: "aio_control",
          table: "chat_messages",
        },
        (payload: InsertPayload) => {
          const row = payload.new;
          if (
            !row?.id ||
            row.role !== "assistant" ||
            row.content?.kind !== "scheduled_ping"
          ) {
            return;
          }
          const rowId = row.id;
          if (row.thread_id === activeThreadId) {
            setMessages((prev) => {
              if (prev.some((m) => m.id === rowId)) return prev;
              return [
                ...prev,
                {
                  id: rowId,
                  role: "assistant",
                  text: row.content?.text ?? "",
                  createdAt: row.created_at ? new Date(row.created_at) : new Date(),
                },
              ];
            });
          }
          if (!open || row.thread_id !== activeThreadId) {
            setUnreadPingCount((n) => n + 1);
          }
          if (agentId) void listThreads(agentId).then(setThreads);
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [activeThreadId, agentId, open]);

  // Handle clicks outside the panel or inside the panel but outside the sidebar.
  useEffect(() => {
    if (!open) return;
    const timeoutId = setTimeout(() => {
      const handleClickOutside = (e: MouseEvent) => {
        const target = e.target as HTMLElement;
        // Don't trigger if clicking the chatbox bubble
        if (target.closest(".chatbox")) return;

        // Find the sidebar element (the thread list container)
        const sidebar = panelRef.current?.querySelector('[data-sidebar]');
        const clickedInsidePanel = panelRef.current?.contains(target);
        const clickedInsideSidebar = sidebar?.contains(target);

        if (clickedInsidePanel) {
          // Inside panel — close sidebar if clicking outside it (but not on sidebar toggle button)
          if (!clickedInsideSidebar && showSidebar) {
            setShowSidebar(false);
          }
        } else {
          // Outside panel entirely — close the whole chat window
          setOpen(false);
          setShowSidebar(false);
        }
      };
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }, 0);
    return () => clearTimeout(timeoutId);
  }, [open, showSidebar]);

  const slashMatch = input.match(/(?:^|\s)\/([^\s]*)$/);
  const slashQuery = slashMatch?.[1]?.toLowerCase() ?? null;
  const slashCommands =
    slashQuery == null
      ? []
      : commands
          .filter((item) => {
            if (slashQuery === "commands") return true;
            const haystack = `${item.command} ${item.title} ${item.description} ${item.kind}`.toLowerCase();
            return haystack.includes(slashQuery);
          })
          .slice(0, 8);

  useEffect(() => {
    setCommandIndex(0);
  }, [slashQuery]);

  const applyCommand = useCallback(
    (item: CommandItem) => {
      setInput((current) =>
        current.replace(/(?:^|\s)\/([^\s]*)$/, (match) => {
          const prefix = match.startsWith(" ") ? " " : "";
          return `${prefix}${item.command} `;
        }),
      );
    },
    [],
  );

  const send = useCallback(
    async (
      opts?: {
        /** When set, skip the normal user-text turn and instead
         *  POST an approve_tool request that resumes a paused
         *  write-tool flow on the server. */
        approveTool?: { tool_call_id: string; decision: "approve" | "cancel" };
      },
    ) => {
    const isApproval = !!opts?.approveTool;
    const text = isApproval ? "" : input.trim();
    if (!isApproval && (!text || sending)) return;
    if (!agentId || sending) return;
    setSending(true);
    if (!isApproval) setInput("");

    const userId = crypto.randomUUID();
    const assistantId = crypto.randomUUID();
    const history: ChatMessage[] = messages
      .filter((m) => m.role !== "error")
      .map((m) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: m.text,
      }));
    if (!isApproval) history.push({ role: "user", content: text });
    const inputTokenEstimate = estimateTokens(history.map((m) => m.content).join("\n"));

    setMessages((m) => {
      // For approval requests we don't add a user bubble; we just
      // append a fresh assistant placeholder for the continuation.
      const next = isApproval
        ? [...m, { id: assistantId, role: "assistant" as const, text: "", pending: true, createdAt: new Date() }]
        : [
            ...m,
            { id: userId, role: "user" as const, text, createdAt: new Date() },
            {
              id: assistantId,
              role: "assistant" as const,
              text: "",
              pending: true,
              usage: {
                inputTokens: inputTokenEstimate,
                outputTokens: 0,
                estimatedInput: true,
                estimatedOutput: true,
              },
              createdAt: new Date(),
            },
          ];
      // Mark the original confirm bubble as decided so its buttons
      // disable + the card swaps to a status pill.
      if (isApproval) {
        return next.map((mm) =>
          mm.confirm?.tool_call_id === opts!.approveTool!.tool_call_id
            ? {
                ...mm,
                confirm: {
                  ...mm.confirm,
                  decided: opts!.approveTool!.decision,
                },
              }
            : mm,
        );
      }
      return next;
    });

    try {
      const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
      abortControllerRef.current = new AbortController();
      const res = await fetch(`${base}/api/chat/${agentId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          messages: history,
          thread_id: activeThreadId,
          approve_tool: opts?.approveTool,
        }),
        signal: abortControllerRef.current.signal,
      });
      // Capture the server-issued thread id so subsequent turns reuse it.
      const newThreadId = res.headers.get("x-aio-thread-id");
      if (newThreadId && newThreadId !== activeThreadId) {
        setActiveThreadId(newThreadId);
      }
      if (!res.ok || !res.body) {
        const err = (await res.text().catch(() => "")) || res.statusText;
        setMessages((m) =>
          m.map((mm) =>
            mm.id === assistantId
              ? { ...mm, role: "error", text: err, pending: false }
              : mm,
          ),
        );
        return;
      }
      const decoder = new TextDecoder();
      let buf = "";
      let aborted = false;
      const reader = res.body.getReader();
      // eslint-disable-next-line no-constant-condition
      while (true) {
        let done: boolean;
        let value: Uint8Array | undefined;
        try {
          ({ done, value } = await reader.read());
          if (done) break;
        } catch (err) {
          if ((err as Error).name === "AbortError") {
            aborted = true;
            setMessages((m) =>
              m.map((mm) =>
                mm.id === assistantId ? { ...mm, pending: false } : mm,
              ),
            );
            break;
          }
          throw err;
        }
        buf += decoder.decode(value, { stream: true });
        let idx: number;
        while ((idx = buf.indexOf("\n\n")) !== -1) {
          const block = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          for (const line of block.split("\n")) {
            if (!line.startsWith("data:")) continue;
            try {
              const event = JSON.parse(line.slice(5).trim()) as AGUIEvent;
              if (event.type === "token") {
                setMessages((m) =>
                  m.map((mm) =>
                    mm.id === assistantId
                      ? {
                          ...mm,
                          text: mm.text + event.delta,
                          usage: {
                            ...mm.usage,
                            outputTokens: estimateTokens(mm.text + event.delta),
                            estimatedOutput: true,
                          },
                        }
                      : mm,
                  ),
                );
              }
              if (event.type === "error") {
                setMessages((m) =>
                  m.map((mm) =>
                    mm.id === assistantId
                      ? {
                          ...mm,
                          role: "error",
                          text: event.message,
                          pending: false,
                        }
                      : mm,
                  ),
                );
              }
              if (event.type === "message_end") {
                setMessages((m) =>
                  m.map((mm) =>
                    mm.id === assistantId
                      ? {
                          ...mm,
                          pending: false,
                          usage: {
                            inputTokens: event.usage.input_tokens,
                            outputTokens: event.usage.output_tokens,
                            costCents: event.usage.cost_cents,
                            estimatedInput: false,
                            estimatedOutput: false,
                          },
                        }
                      : mm,
                  ),
                );
              }
              if (event.type === "cost_update") {
                setMessages((m) =>
                  m.map((mm) =>
                    mm.id === assistantId
                      ? {
                          ...mm,
                          usage: {
                            inputTokens: event.input_tokens,
                            outputTokens: event.output_tokens,
                            costCents: event.cost_cents,
                            estimatedInput: false,
                            estimatedOutput: false,
                          },
                        }
                      : mm,
                  ),
                );
              }
              if (event.type === "tool_call_start") {
                const argsPreview = (() => {
                  try {
                    const s = JSON.stringify(event.args);
                    return s.length > 80 ? s.slice(0, 77) + "…" : s;
                  } catch {
                    return "";
                  }
                })();
                setMessages((m) =>
                  m.map((mm) =>
                    mm.id === assistantId
                      ? {
                          ...mm,
                          toolCalls: [
                            ...(mm.toolCalls ?? []),
                            {
                              id: event.tool_call_id,
                              name: event.name,
                              argsPreview,
                            },
                          ],
                        }
                      : mm,
                  ),
                );
              }
              if (event.type === "ask_followup") {
                setMessages((m) =>
                  m.map((mm) =>
                    mm.id === assistantId
                      ? {
                          ...mm,
                          pending: false,
                          askFollowup: {
                            question: event.question,
                            options: event.options,
                          },
                        }
                      : mm,
                  ),
                );
              }
              if (event.type === "confirm_required") {
                setMessages((m) =>
                  m.map((mm) =>
                    mm.id === assistantId
                      ? {
                          ...mm,
                          pending: false,
                          confirm: {
                            kind: event.kind,
                            summary: event.summary,
                            tool_call_id: event.tool_call_id,
                          },
                        }
                      : mm,
                  ),
                );
              }
              if (event.type === "open_ui_at") {
                setMessages((m) =>
                  m.map((mm) =>
                    mm.id === assistantId
                      ? {
                          ...mm,
                          navHint: { path: event.path, label: event.label },
                        }
                      : mm,
                  ),
                );
              }
              // todo_set + plan_proposed render in future commits;
              // ignored for now so they don't crash the parser.
            } catch {
              /* ignore malformed event */
            }
          }
        }
      }
    } finally {
      setSending(false);
      setMessages((m) =>
        m.map((mm) =>
          mm.id === assistantId ? { ...mm, pending: false } : mm,
        ),
      );
      // Refresh sidebar so the new/bumped thread floats to the top.
      if (agentId) {
        void listThreads(agentId).then(setThreads);
      }
    }
    },
    [agentId, input, messages, sending, activeThreadId],
  );

  if (agents.length === 0) {
    // No agents yet — clicking the bubble routes the user straight to the
    // marketplace so they can install (or sees the empty marketplace if
    // somehow that's also empty). Better than a dead-end alert.
    const emptyBubble = (
      <div
        className="chatbox"
        title="Voeg eerst een agent toe — klik om naar de marketplace te gaan"
        style={chatboxDockStyle}
        onClick={() => {
          if (firstBusinessId && workspaceSlug) {
            router.push(
              `/${workspaceSlug}/business/${firstBusinessId}/agents`,
            );
          } else if (workspaceSlug) {
            router.push(`/${workspaceSlug}/marketplace`);
          }
        }}
      >
        <ChatIcon />
      </div>
    );

    return mounted ? createPortal(emptyBubble, document.body) : null;
  }

  const chatPanel = (
    <>
      <div
        className="chatbox"
        title="Chat met AI"
        onClick={() => setOpen((v) => !v)}
        style={chatboxDockStyle}
      >
        <ChatIcon />
        {unreadPingCount > 0 && (
          <span
            style={{
              position: "absolute",
              top: -4,
              right: -4,
              minWidth: 18,
              height: 18,
              borderRadius: 999,
              background: "var(--rose)",
              color: "#fff",
              fontSize: 10,
              fontWeight: 800,
              display: "grid",
              placeItems: "center",
              border: "2px solid var(--app-bg)",
            }}
          >
            {unreadPingCount > 9 ? "9+" : unreadPingCount}
          </span>
        )}
      </div>

      {open && (
        <div
          ref={panelRef}
          className="chat-panel"
          style={{
            position: "fixed",
            background: "var(--app-card)",
            border: "1.5px solid var(--app-border)",
            boxShadow: "0 24px 60px -12px rgba(0,0,0,0.55)",
            display: "flex",
            flexDirection: "column",
            zIndex: 10,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "10px 12px",
              borderBottom: "1px solid var(--app-border-2)",
            }}
          >
            <button
              type="button"
              onClick={() => setShowSidebar((v) => !v)}
              title={showSidebar ? "Verberg threads" : "Toon threads"}
              style={{
                background: "transparent",
                border: "1.5px solid var(--app-border)",
                color: "var(--app-fg-2)",
                width: 30,
                height: 30,
                borderRadius: 6,
                fontSize: 14,
                cursor: "pointer",
                padding: 0,
                lineHeight: 1,
              }}
            >
              ☰
            </button>
            <span
              className="node brand"
              style={{
                ["--size" as string]: "30px",
                fontSize: 12,
                flexShrink: 0,
              }}
            >
              AI
            </span>
            <select
              value={agentId ?? ""}
              onChange={(e) => {
                setAgentId(e.target.value);
                restoredThreadRef.current = false;
                autoLoadedThreadRef.current = false;
                setMessages([]);
                setActiveThreadId(null);
              }}
              style={{
                flex: 1,
                background: "var(--app-card-2)",
                border: "1.5px solid var(--app-border)",
                color: "var(--app-fg)",
                borderRadius: 8,
                padding: "6px 8px",
                fontSize: 12.5,
                minWidth: 0,
              }}
            >
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} · {a.provider}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={startNewThread}
              title="Nieuwe chat"
              style={{
                border: "1.5px solid var(--app-border)",
                background: "transparent",
                color: "var(--app-fg-2)",
                borderRadius: 8,
                width: 30,
                height: 30,
                display: "grid",
                placeItems: "center",
                cursor: "pointer",
                padding: 0,
                flexShrink: 0,
              }}
            >
              <PlusIcon size={15} />
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              title="Sluit chat"
              style={{
                border: "1.5px solid var(--app-border)",
                background: "transparent",
                color: "var(--app-fg-2)",
                borderRadius: 8,
                fontSize: 16,
                width: 30,
                height: 30,
                padding: 0,
                cursor: "pointer",
                flexShrink: 0,
              }}
            >
              ✕
            </button>
          </div>

          {showSidebar && (
            <div
              data-sidebar
              style={{
                borderBottom: "1px solid var(--app-border-2)",
                background: "var(--app-card-2)",
                maxHeight: 200,
                overflowY: "auto",
              }}
            >
              <div
                style={{
                  padding: "8px 12px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  borderBottom: "1px solid var(--app-border-2)",
                }}
              >
                <span
                  style={{
                    fontSize: 10.5,
                    fontWeight: 700,
                    color: "var(--app-fg-3)",
                    letterSpacing: "0.14em",
                    textTransform: "uppercase",
                  }}
                >
                  Threads
                </span>
                <button
                  type="button"
                  onClick={startNewThread}
                  style={{
                    background: "transparent",
                    border: "1px solid var(--app-border)",
                    color: "var(--app-fg-2)",
                    fontSize: 10.5,
                    fontWeight: 700,
                    padding: "3px 8px",
                    borderRadius: 6,
                    cursor: "pointer",
                  }}
                >
                  + Nieuwe
                </button>
              </div>
              {threads.length === 0 ? (
                <p style={{ fontSize: 11, color: "var(--app-fg-3)", padding: 10 }}>
                  Nog geen threads.
                </p>
              ) : (
                threads.map((t) => (
                  <div
                    key={t.id}
                    onClick={() => switchThread(t.id)}
                    style={{
                      padding: "7px 12px",
                      cursor: "pointer",
                      fontSize: 12,
                      borderBottom: "1px solid var(--app-border-2)",
                      background:
                        activeThreadId === t.id
                          ? "rgba(57,178,85,0.10)"
                          : "transparent",
                      color:
                        activeThreadId === t.id
                          ? "var(--tt-green)"
                          : "var(--app-fg)",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <span
                      style={{
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {t.title ?? "(geen titel)"}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!confirm("Thread verwijderen?")) return;
                        void deleteThread({ thread_id: t.id }).then(() => {
                          setThreads((prev) =>
                            prev.filter((x) => x.id !== t.id),
                          );
                          if (activeThreadId === t.id) {
                            setActiveThreadId(null);
                            setMessages([]);
                          }
                        });
                      }}
                      style={{
                        background: "transparent",
                        border: "none",
                        color: "var(--app-fg-3)",
                        cursor: "pointer",
                        fontSize: 11,
                        padding: "2px 6px",
                      }}
                      title="Verwijder thread"
                    >
                      ✕
                    </button>
                  </div>
                ))
              )}
            </div>
          )}

          <div
            ref={listRef}
            style={{
              flex: 1,
              padding: 14,
              overflowY: "auto",
              display: "flex",
              flexDirection: "column",
              gap: 10,
              fontSize: 13,
            }}
          >
            {messages.length === 0 && (
              <p
                style={{
                  color: "var(--app-fg-3)",
                  fontSize: 12.5,
                  margin: 0,
                }}
              >
                Stel een vraag aan de geselecteerde agent. Streaming antwoord.
              </p>
            )}
            {messages.map((m) => (
              <div
                key={m.id}
                style={{
                  alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                  width: m.role === "user" ? "auto" : "100%",
                  maxWidth: m.role === "user" ? "82%" : "100%",
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: m.role === "user" ? "flex-end" : "flex-start",
                    alignItems: "flex-end",
                    gap: 6,
                    width: "100%",
                  }}
                >
                  <div
                    style={{
                      background:
                        m.role === "user"
                          ? "var(--tt-green)"
                          : m.role === "error"
                            ? "rgba(230,82,107,0.10)"
                            : "var(--app-card-2)",
                      color:
                        m.role === "user"
                          ? "#fff"
                          : m.role === "error"
                            ? "var(--rose)"
                            : "var(--app-fg)",
                      border:
                        m.role === "error"
                          ? "1px solid rgba(230,82,107,0.4)"
                          : "1px solid var(--app-border-2)",
                      borderRadius: 12,
                      padding: "8px 11px",
                      maxWidth:
                        m.role === "user"
                          ? "82%"
                          : "calc(100% - 46px)",
                      whiteSpace: m.role === "assistant" ? "normal" : "pre-wrap",
                      lineHeight: 1.42,
                      overflowWrap: "anywhere",
                    }}
                  >
                    {m.role === "assistant" && m.text ? (
                      <MarkdownText text={m.text} />
                    ) : (
                      m.text || (m.pending ? "…" : "")
                    )}
                  </div>
                  <span
                    style={{
                      fontSize: 10.5,
                      color: "var(--app-fg-3)",
                      padding: "0 2px",
                      flexShrink: 0,
                      fontFamily: "var(--mono, monospace)",
                    }}
                  >
                    {m.createdAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>

                {/* Tool-call chips so the user sees what the agent is
                    doing while it runs. */}
                {m.usage &&
                  (m.role === "assistant" || m.role === "error") &&
                  (m.pending ||
                    m.usage.inputTokens != null ||
                    m.usage.outputTokens != null) && (
                    <TokenUsageLine usage={m.usage} />
                  )}

                {m.toolCalls && m.toolCalls.length > 0 && (
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: 4,
                    }}
                  >
                    {m.toolCalls.map((tc) => (
                      <span
                        key={tc.id}
                        style={{
                          fontSize: 10.5,
                          padding: "2px 7px",
                          borderRadius: 6,
                          background: "var(--app-card-2)",
                          border: "1px solid var(--app-border-2)",
                          fontFamily: "var(--mono, monospace)",
                          color: "var(--app-fg-3)",
                        }}
                        title={tc.argsPreview}
                      >
                        {tc.name}
                      </span>
                    ))}
                  </div>
                )}

                {/* ask_followup — the agent paused for clarification.
                    Render the question + optional multiple-choice
                    buttons. Click sends the option label as the
                    next user turn. */}
                {m.askFollowup && (
                  <div
                    style={{
                      background: "var(--app-card-2)",
                      border: "1.5px solid var(--tt-green)",
                      borderRadius: 12,
                      padding: 10,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 12.5,
                        fontWeight: 700,
                        marginBottom: 8,
                      }}
                    >
                      {m.askFollowup.question}
                    </div>
                    {m.askFollowup.options && m.askFollowup.options.length > 0 ? (
                      <div
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          gap: 6,
                        }}
                      >
                        {m.askFollowup.options.map((o) => (
                          <button
                            key={o.label}
                            type="button"
                            disabled={sending}
                            onClick={() => {
                              setInput(o.label);
                              // Defer to next tick so React commits
                              // the input value first.
                              setTimeout(() => void send(), 0);
                            }}
                            title={o.description}
                            style={{
                              padding: "6px 10px",
                              fontSize: 12,
                              fontWeight: 700,
                              border: "1.5px solid var(--app-border)",
                              background: "var(--app-card)",
                              color: "var(--app-fg)",
                              borderRadius: 8,
                              cursor: sending ? "wait" : "pointer",
                            }}
                          >
                            {o.label}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div
                        style={{
                          fontSize: 11,
                          color: "var(--app-fg-3)",
                          fontStyle: "italic",
                        }}
                      >
                        Typ je antwoord hieronder.
                      </div>
                    )}
                  </div>
                )}

                {/* confirm_required — write tool wants approval. */}
                {m.confirm && (
                  <div
                    style={{
                      background: "rgba(230,82,107,0.06)",
                      border: "1.5px solid var(--rose)",
                      borderRadius: 12,
                      padding: 10,
                      fontSize: 12,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        color: "var(--rose)",
                        textTransform: "uppercase",
                        letterSpacing: 0.5,
                        marginBottom: 4,
                      }}
                    >
                      Bevestig: {m.confirm.kind}
                    </div>
                    <pre
                      style={{
                        fontSize: 10.5,
                        lineHeight: 1.4,
                        margin: 0,
                        whiteSpace: "pre-wrap",
                        fontFamily: "var(--mono, monospace)",
                        color: "var(--app-fg-2)",
                      }}
                    >
                      {m.confirm.summary}
                    </pre>
                    {m.confirm.decided ? (
                      <p
                        style={{
                          fontSize: 11,
                          color:
                            m.confirm.decided === "approve"
                              ? "var(--tt-green)"
                              : "var(--app-fg-3)",
                          fontWeight: 700,
                          margin: "8px 0 0",
                        }}
                      >
                        {m.confirm.decided === "approve"
                          ? "✓ Goedgekeurd — uitgevoerd."
                          : "✕ Geannuleerd."}
                      </p>
                    ) : (
                      <div
                        style={{
                          display: "flex",
                          gap: 8,
                          marginTop: 10,
                        }}
                      >
                        <button
                          type="button"
                          disabled={sending}
                          onClick={() =>
                            void send({
                              approveTool: {
                                tool_call_id: m.confirm!.tool_call_id,
                                decision: "approve",
                              },
                            })
                          }
                          style={{
                            padding: "6px 12px",
                            fontSize: 12,
                            fontWeight: 700,
                            border: "1.5px solid var(--tt-green)",
                            background: "var(--tt-green)",
                            color: "#fff",
                            borderRadius: 8,
                            cursor: sending ? "wait" : "pointer",
                          }}
                        >
                          ✓ Goedkeuren
                        </button>
                        <button
                          type="button"
                          disabled={sending}
                          onClick={() =>
                            void send({
                              approveTool: {
                                tool_call_id: m.confirm!.tool_call_id,
                                decision: "cancel",
                              },
                            })
                          }
                          style={{
                            padding: "6px 12px",
                            fontSize: 12,
                            fontWeight: 700,
                            border: "1.5px solid var(--app-border)",
                            background: "var(--app-card-2)",
                            color: "var(--app-fg)",
                            borderRadius: 8,
                            cursor: sending ? "wait" : "pointer",
                          }}
                        >
                          ✕ Annuleren
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* open_ui_at — agent suggests navigating somewhere. */}
                {m.navHint && (
                  <a
                    href={m.navHint.path}
                    style={{
                      alignSelf: "flex-start",
                      fontSize: 12,
                      fontWeight: 700,
                      color: "var(--tt-green)",
                      textDecoration: "underline",
                    }}
                  >
                    → {m.navHint.label ?? m.navHint.path}
                  </a>
                )}
              </div>
            ))}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
            style={{
              borderTop: "1px solid var(--app-border-2)",
              padding: 10,
              display: "flex",
              gap: 8,
              position: "relative",
            }}
          >
            {slashCommands.length > 0 && (
              <div
                style={{
                  position: "absolute",
                  left: 10,
                  right: 58,
                  bottom: 52,
                  maxHeight: 260,
                  overflowY: "auto",
                  background: "var(--app-card)",
                  border: "1.5px solid var(--app-border)",
                  borderRadius: 10,
                  boxShadow: "0 14px 34px rgba(0,0,0,0.35)",
                  padding: 6,
                  zIndex: 2,
                }}
              >
                {slashCommands.map((item, idx) => (
                  <button
                    key={item.id}
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      applyCommand(item);
                    }}
                    style={{
                      width: "100%",
                      display: "grid",
                      gridTemplateColumns: "92px 1fr auto",
                      gap: 8,
                      alignItems: "center",
                      padding: "7px 8px",
                      border: "none",
                      borderRadius: 7,
                      background:
                        idx === commandIndex
                          ? "rgba(57,178,85,0.12)"
                          : "transparent",
                      color: "var(--app-fg)",
                      textAlign: "left",
                      cursor: "pointer",
                      fontFamily: "var(--type)",
                    }}
                  >
                    <code
                      style={{
                        fontSize: 11,
                        color: "var(--tt-green)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {item.command}
                    </code>
                    <span style={{ minWidth: 0 }}>
                      <span
                        style={{
                          display: "block",
                          fontSize: 12,
                          fontWeight: 700,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {item.title}
                      </span>
                      <span
                        style={{
                          display: "block",
                          fontSize: 10.5,
                          color: "var(--app-fg-3)",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {item.description}
                      </span>
                    </span>
                    <span
                      style={{
                        fontSize: 9.5,
                        fontWeight: 700,
                        color: "var(--app-fg-3)",
                        textTransform: "uppercase",
                      }}
                    >
                      {item.kind}
                    </span>
                  </button>
                ))}
              </div>
            )}
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (slashCommands.length === 0) return;
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setCommandIndex((idx) => (idx + 1) % slashCommands.length);
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setCommandIndex(
                    (idx) => (idx - 1 + slashCommands.length) % slashCommands.length,
                  );
                } else if (e.key === "Tab") {
                  e.preventDefault();
                  const item = slashCommands[commandIndex] ?? slashCommands[0];
                  if (item) applyCommand(item);
                } else if (e.key === "Escape") {
                  setCommandIndex(0);
                }
              }}
              placeholder="Vraag iets aan de agent…"
              disabled={sending}
              style={{
                flex: 1,
                background: "var(--app-card-2)",
                border: "1.5px solid var(--app-border)",
                color: "var(--app-fg)",
                borderRadius: 10,
                padding: "9px 11px",
                fontSize: 13,
              }}
            />
            <button
              type={sending ? "button" : "submit"}
              onClick={sending ? () => abortControllerRef.current?.abort() : undefined}
              disabled={sending ? false : !input.trim()}
              style={{
                background: sending ? "var(--rose)" : "var(--tt-green)",
                border: `1.5px solid ${sending ? "var(--rose)" : "var(--tt-green)"}`,
                color: "#fff",
                borderRadius: 10,
                padding: "0 14px",
                fontWeight: 700,
                fontSize: 12.5,
                cursor: sending ? "pointer" : !input.trim() ? "not-allowed" : "pointer",
                opacity: sending ? 1 : !input.trim() ? 0.7 : 1,
                minWidth: 42,
                textAlign: "center",
              }}
            >
              {sending ? "⏹" : "↵"}
            </button>
          </form>
        </div>
      )}
    </>
  );

  return mounted ? createPortal(chatPanel, document.body) : null;
}

function estimateTokens(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return Math.max(1, Math.ceil(trimmed.length / 4));
}

function formatTokenCount(value?: number, estimated?: boolean): string {
  if (value == null) return "?";
  return `${estimated ? "~" : ""}${value.toLocaleString("nl-NL")}`;
}

function TokenUsageLine({
  usage,
}: {
  usage: NonNullable<UIMessage["usage"]>;
}) {
  const cost =
    usage.costCents != null ? ` · €${(usage.costCents / 100).toFixed(4)}` : "";
  return (
    <div
      style={{
        alignSelf: "flex-start",
        fontSize: 10.5,
        color: "var(--app-fg-3)",
        fontFamily: "var(--mono, ui-monospace, monospace)",
      }}
    >
      {formatTokenCount(usage.inputTokens, usage.estimatedInput)} in /{" "}
      {formatTokenCount(usage.outputTokens, usage.estimatedOutput)} out
      {cost}
    </div>
  );
}
