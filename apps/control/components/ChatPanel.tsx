// Floating green chatbot bubble + the panel that opens when you click it.
// Lightweight, no external chat library — just streams AG-UI events from
// /api/chat/[agent_id] and renders tokens as they arrive.
//
// Phase 3 ships chat-with-one-agent. Multi-thread history lands in fase 3.5
// once we wire up chat_threads queries.

"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { ChatIcon } from "@aio/ui/icon";
import type { AGUIEvent, ChatMessage } from "@aio/ai/ag-ui";

import type { AgentRow } from "../lib/queries/agents";
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

export function ChatPanel({ agents, workspaceSlug, firstBusinessId }: Props) {
  const router = useRouter();
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
  const listRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Reload thread list whenever the open agent changes.
  useEffect(() => {
    if (!agentId) {
      setThreads([]);
      return;
    }
    let cancelled = false;
    void listThreads(agentId).then((rows) => {
      if (!cancelled) setThreads(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [agentId, open]);

  // Switch threads → load history.
  const switchThread = useCallback(async (threadId: string | null) => {
    setOpen(false);
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

  // Close panel when clicking outside.
  useEffect(() => {
    if (!open) return;
    // Delay listener attachment so the click that opened the panel doesn't immediately close it.
    const timeoutId = setTimeout(() => {
      const handleClickOutside = (e: MouseEvent) => {
        if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
          setOpen(false);
        }
      };
      document.addEventListener("click", handleClickOutside);
      return () => document.removeEventListener("click", handleClickOutside);
    }, 0);
    return () => clearTimeout(timeoutId);
  }, [open]);

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

    setMessages((m) => {
      // For approval requests we don't add a user bubble; we just
      // append a fresh assistant placeholder for the continuation.
      const next = isApproval
        ? [...m, { id: assistantId, role: "assistant" as const, text: "", pending: true, createdAt: new Date() }]
        : [
            ...m,
            { id: userId, role: "user" as const, text, createdAt: new Date() },
            { id: assistantId, role: "assistant" as const, text: "", pending: true, createdAt: new Date() },
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
                      ? { ...mm, text: mm.text + event.delta }
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
                    mm.id === assistantId ? { ...mm, pending: false } : mm,
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
    return (
      <div
        className="chatbox"
        title="Voeg eerst een agent toe — klik om naar de marketplace te gaan"
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
  }

  return (
    <>
      <div
        className="chatbox"
        title="Chat met AI"
        onClick={() => setOpen((v) => !v)}
      >
        <ChatIcon />
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
              gap: 10,
              padding: "12px 14px",
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
                width: 28,
                height: 28,
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
              style={{ ["--size" as string]: "28px", fontSize: 12 }}
            >
              AI
            </span>
            <select
              value={agentId ?? ""}
              onChange={(e) => {
                setAgentId(e.target.value);
                setMessages([]);
                setActiveThreadId(null);
              }}
              style={{
                flex: 1,
                background: "var(--app-card-2)",
                border: "1.5px solid var(--app-border)",
                color: "var(--app-fg)",
                borderRadius: 8,
                padding: "5px 8px",
                fontSize: 12.5,
              }}
            >
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} · {a.provider}
                </option>
              ))}
            </select>
            <button
              onClick={() => setOpen(false)}
              style={{
                border: "1.5px solid var(--app-border)",
                background: "transparent",
                color: "var(--app-fg-2)",
                borderRadius: 8,
                fontSize: 12,
                padding: "4px 8px",
                cursor: "pointer",
              }}
            >
              ✕
            </button>
          </div>

          {showSidebar && (
            <div
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
                  onClick={() => {
                    setActiveThreadId(null);
                    setMessages([]);
                  }}
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
                  maxWidth: "82%",
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
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
                    // assistant text already structures itself via
                    // MarkdownText; user/error stay literal so newlines
                    // they typed render verbatim.
                    whiteSpace: m.role === "assistant" ? "normal" : "pre-wrap",
                    lineHeight: 1.42,
                  }}
                >
                  {m.role === "assistant" && m.text ? (
                    <MarkdownText text={m.text} />
                  ) : (
                    m.text || (m.pending ? "…" : "")
                  )}
                </div>

                {/* Timestamp */}
                <div
                  style={{
                    fontSize: 10,
                    color: "var(--app-fg-3)",
                    padding: "0 2px",
                  }}
                >
                  {m.createdAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </div>

                {/* Tool-call chips so the user sees what the agent is
                    doing while it runs. */}
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
            }}
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
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
}
