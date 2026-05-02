// Floating green chatbot bubble + the panel that opens when you click it.
// Lightweight, no external chat library — just streams AG-UI events from
// /api/chat/[agent_id] and renders tokens as they arrive.
//
// Phase 3 ships chat-with-one-agent. Multi-thread history lands in fase 3.5
// once we wire up chat_threads queries.

"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { ChatIcon } from "@aio/ui/icon";
import type { AGUIEvent, ChatMessage } from "@aio/ai/ag-ui";

import type { AgentRow } from "../lib/queries/agents";

type Props = {
  agents: AgentRow[];
};

type UIMessage = {
  id: string;
  role: "user" | "assistant" | "error";
  text: string;
  pending?: boolean;
};

export function ChatPanel({ agents }: Props) {
  const [open, setOpen] = useState(false);
  const [agentId, setAgentId] = useState<string | null>(
    agents[0]?.id ?? null,
  );
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) listRef.current?.scrollTo({ top: 99999 });
  }, [messages, open]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || !agentId || sending) return;
    setSending(true);
    setInput("");

    const userId = crypto.randomUUID();
    const assistantId = crypto.randomUUID();
    const history: ChatMessage[] = messages
      .filter((m) => m.role !== "error")
      .map((m) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: m.text,
      }));
    history.push({ role: "user", content: text });

    setMessages((m) => [
      ...m,
      { id: userId, role: "user", text },
      { id: assistantId, role: "assistant", text: "", pending: true },
    ]);

    try {
      const res = await fetch(`/api/chat/${agentId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: history }),
      });
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
      const reader = res.body.getReader();
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
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
    }
  }, [agentId, input, messages, sending]);

  if (agents.length === 0) {
    // No agents yet; we still show the bubble so the affordance is
    // discoverable. Clicking it pops a hint that points at the agents tab
    // of any business — that's where the user can create one.
    return (
      <div
        className="chatbox"
        title="Voeg eerst een agent toe in een business"
        onClick={() =>
          alert(
            "Maak eerst een agent aan: open een business in de left side nav → tab \"Agents\" → \"+ Nieuwe agent\".",
          )
        }
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
          style={{
            position: "fixed",
            bottom: 84,
            right: 18,
            width: 420,
            height: 540,
            background: "var(--app-card)",
            border: "1.5px solid var(--app-border)",
            borderRadius: 16,
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
                  whiteSpace: "pre-wrap",
                  lineHeight: 1.42,
                }}
              >
                {m.text || (m.pending ? "…" : "")}
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
              type="submit"
              disabled={sending || !input.trim()}
              style={{
                background: "var(--tt-green)",
                border: "1.5px solid var(--tt-green)",
                color: "#fff",
                borderRadius: 10,
                padding: "0 14px",
                fontWeight: 700,
                fontSize: 12.5,
                cursor: sending ? "wait" : "pointer",
                opacity: sending || !input.trim() ? 0.7 : 1,
              }}
            >
              ↵
            </button>
          </form>
        </div>
      )}
    </>
  );
}
