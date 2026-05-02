// Telegram-channels manager. Lives in Settings → Telegram. Lets the
// user create one or more telegram_targets per workspace/business/topic
// scope, test them with a one-shot ping, and delete.
//
// The bot TOKEN itself is set via Settings → API Keys (provider=
// 'telegram'). This panel only manages where reports get routed.

"use client";

import { useState, useTransition } from "react";

import {
  createTelegramTarget,
  deleteTelegramTarget,
  testTelegramTarget,
} from "../app/actions/telegram";
import type { BusinessRow } from "../lib/queries/businesses";
import type { NavNode } from "../lib/queries/nav-nodes";

export type TelegramTargetRow = {
  id: string;
  scope: "workspace" | "business" | "navnode";
  scope_id: string;
  name: string;
  chat_id: string;
  topic_id: number | null;
  allowlist: string[];
  denylist: string[];
  send_run_done: boolean;
  send_run_fail: boolean;
  send_queue_review: boolean;
  enabled: boolean;
};

type Props = {
  workspaceSlug: string;
  workspaceId: string;
  initialTargets: TelegramTargetRow[];
  businesses: BusinessRow[];
  navNodes: NavNode[];
};

export function TelegramPanel({
  workspaceSlug,
  workspaceId,
  initialTargets,
  businesses,
  navNodes,
}: Props) {
  const [targets, setTargets] = useState(initialTargets);
  const [adding, setAdding] = useState(false);
  const [scope, setScope] = useState<"workspace" | "business" | "navnode">(
    "workspace",
  );
  const [scopeId, setScopeId] = useState(workspaceId);
  const [name, setName] = useState("");
  const [chatId, setChatId] = useState("");
  const [topicId, setTopicId] = useState("");
  const [allowlist, setAllowlist] = useState("");
  const [denylist, setDenylist] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const res = await createTelegramTarget({
        workspace_slug: workspaceSlug,
        workspace_id: workspaceId,
        scope,
        scope_id: scope === "workspace" ? workspaceId : scopeId,
        name,
        chat_id: chatId,
        topic_id: topicId ? Number(topicId) : null,
        allowlist: allowlist
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        denylist: denylist
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setTargets((prev) => [
        ...prev,
        {
          id: res.data.id,
          scope,
          scope_id: scope === "workspace" ? workspaceId : scopeId,
          name,
          chat_id: chatId,
          topic_id: topicId ? Number(topicId) : null,
          allowlist: allowlist
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          denylist: denylist
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          send_run_done: true,
          send_run_fail: true,
          send_queue_review: true,
          enabled: true,
        },
      ]);
      setAdding(false);
      setName("");
      setChatId("");
      setTopicId("");
      setAllowlist("");
      setDenylist("");
    });
  };

  const remove = (id: string) =>
    startTransition(async () => {
      const res = await deleteTelegramTarget({
        workspace_slug: workspaceSlug,
        id,
      });
      if (res.ok) setTargets((prev) => prev.filter((t) => t.id !== id));
    });

  const test = (id: string) =>
    startTransition(async () => {
      setInfo(null);
      setError(null);
      const res = await testTelegramTarget({
        workspace_id: workspaceId,
        target_id: id,
      });
      if (res.ok) {
        setInfo(`Test verstuurd via @${res.data.username}.`);
      } else {
        setError(res.error);
      }
    });

  const labelFor = (t: TelegramTargetRow) => {
    if (t.scope === "workspace") return "Workspace";
    if (t.scope === "business") {
      const b = businesses.find((bb) => bb.id === t.scope_id);
      return `Business · ${b?.name ?? "(verwijderd)"}`;
    }
    const n = navNodes.find((nn) => nn.id === t.scope_id);
    return `Topic · ${n?.name ?? "(verwijderd)"}`;
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <p
        style={{
          fontSize: 12.5,
          color: "var(--app-fg-3)",
          margin: 0,
          lineHeight: 1.5,
        }}
      >
        Bot-token zet je in <strong>Settings → API Keys</strong> als provider
        &quot;Telegram&quot;. Hier definieer je waar reports heen gaan: chat_id +
        optioneel topic_id voor forum-style groepen.
      </p>

      {targets.length === 0 ? (
        <p
          style={{
            fontSize: 12.5,
            color: "var(--app-fg-3)",
            padding: 16,
            border: "1px dashed var(--app-border)",
            borderRadius: 10,
            margin: 0,
          }}
        >
          Geen Telegram-channels nog. Klik &quot;+ Channel toevoegen&quot;.
        </p>
      ) : (
        <div
          style={{
            border: "1px solid var(--app-border)",
            borderRadius: 10,
            overflow: "hidden",
          }}
        >
          {targets.map((t) => (
            <div
              key={t.id}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 80px 80px 80px",
                gap: 8,
                alignItems: "center",
                padding: "10px 12px",
                borderBottom: "1px solid var(--app-border-2)",
                background: "var(--app-card-2)",
              }}
            >
              <div>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{t.name}</div>
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--app-fg-3)",
                    marginTop: 2,
                  }}
                >
                  chat {t.chat_id}
                  {t.topic_id != null && ` · topic ${t.topic_id}`}
                </div>
              </div>
              <div style={{ fontSize: 12, color: "var(--app-fg-2)" }}>
                {labelFor(t)}
              </div>
              <span
                style={{
                  fontSize: 10.5,
                  fontWeight: 700,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color: t.enabled ? "var(--tt-green)" : "var(--rose)",
                }}
              >
                {t.enabled ? "aan" : "uit"}
              </span>
              <button
                onClick={() => test(t.id)}
                disabled={pending}
                style={btnTertiary}
              >
                Test
              </button>
              <button
                onClick={() => remove(t.id)}
                disabled={pending}
                style={btnDanger}
              >
                Verwijder
              </button>
            </div>
          ))}
        </div>
      )}

      {info && (
        <p style={{ color: "var(--tt-green)", fontSize: 12, margin: 0 }}>
          {info}
        </p>
      )}
      {error && (
        <p style={{ color: "var(--rose)", fontSize: 12, margin: 0 }}>
          {error}
        </p>
      )}

      {!adding && (
        <button onClick={() => setAdding(true)} style={btnAdd}>
          + Channel toevoegen
        </button>
      )}

      {adding && (
        <div
          style={{
            border: "1.5px solid var(--app-border)",
            background: "var(--app-card-2)",
            borderRadius: 12,
            padding: 14,
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Field label="Naam">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="bv. Tromptech ops"
                style={inp}
              />
            </Field>
            <Field label="Scope">
              <select
                value={scope}
                onChange={(e) => {
                  const s = e.target.value as typeof scope;
                  setScope(s);
                  setScopeId(
                    s === "workspace"
                      ? workspaceId
                      : s === "business"
                        ? businesses[0]?.id ?? ""
                        : navNodes[0]?.id ?? "",
                  );
                }}
                style={inp}
              >
                <option value="workspace">Workspace default</option>
                <option value="business" disabled={businesses.length === 0}>
                  Business
                </option>
                <option value="navnode" disabled={navNodes.length === 0}>
                  Topic
                </option>
              </select>
            </Field>
          </div>

          {scope === "business" && (
            <Field label="Business">
              <select
                value={scopeId}
                onChange={(e) => setScopeId(e.target.value)}
                style={inp}
              >
                {businesses.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </Field>
          )}
          {scope === "navnode" && (
            <Field label="Topic">
              <select
                value={scopeId}
                onChange={(e) => setScopeId(e.target.value)}
                style={inp}
              >
                {navNodes.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.name}
                  </option>
                ))}
              </select>
            </Field>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Field label="Chat ID (start met -100… voor groups)">
              <input
                value={chatId}
                onChange={(e) => setChatId(e.target.value)}
                placeholder="-1001234567890"
                style={inp}
              />
            </Field>
            <Field label="Topic ID (optioneel — alleen voor forum-groups)">
              <input
                value={topicId}
                onChange={(e) => setTopicId(e.target.value)}
                placeholder="2"
                style={inp}
                inputMode="numeric"
              />
            </Field>
          </div>

          <Field label="Allowlist (komma-gescheiden usernames, optioneel)">
            <input
              value={allowlist}
              onChange={(e) => setAllowlist(e.target.value)}
              placeholder="jeremy_tromp,lieftenant"
              style={inp}
            />
          </Field>

          <Field label="Denylist (komma-gescheiden usernames, optioneel)">
            <input
              value={denylist}
              onChange={(e) => setDenylist(e.target.value)}
              placeholder="spammer123"
              style={inp}
            />
          </Field>

          <div
            style={{
              display: "flex",
              gap: 8,
              justifyContent: "flex-end",
              marginTop: 4,
            }}
          >
            <button
              onClick={() => setAdding(false)}
              style={btnSecondary}
              disabled={pending}
            >
              Annuleer
            </button>
            <button
              onClick={submit}
              disabled={pending || !name.trim() || !chatId.trim()}
              style={btnPrimary(pending)}
            >
              {pending ? "Bezig…" : "Opslaan"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const inp: React.CSSProperties = {
  width: "100%",
  background: "var(--app-card)",
  border: "1.5px solid var(--app-border)",
  color: "var(--app-fg)",
  padding: "8px 10px",
  borderRadius: 8,
  fontFamily: "var(--type)",
  fontSize: 13,
};

const btnSecondary: React.CSSProperties = {
  padding: "8px 14px",
  border: "1.5px solid var(--app-border)",
  background: "transparent",
  color: "var(--app-fg)",
  borderRadius: 10,
  fontWeight: 700,
  fontSize: 12.5,
  cursor: "pointer",
};

const btnPrimary = (pending: boolean): React.CSSProperties => ({
  padding: "8px 14px",
  border: "1.5px solid var(--tt-green)",
  background: "var(--tt-green)",
  color: "#fff",
  borderRadius: 10,
  fontWeight: 700,
  fontSize: 12.5,
  cursor: pending ? "wait" : "pointer",
  opacity: pending ? 0.7 : 1,
});

const btnAdd: React.CSSProperties = {
  padding: "9px 14px",
  border: "1.5px dashed var(--app-border)",
  background: "transparent",
  color: "var(--app-fg-2)",
  borderRadius: 10,
  fontWeight: 700,
  fontSize: 12.5,
  cursor: "pointer",
  alignSelf: "flex-start",
};

const btnTertiary: React.CSSProperties = {
  padding: "5px 8px",
  border: "1px solid var(--app-border)",
  background: "transparent",
  color: "var(--app-fg-2)",
  borderRadius: 6,
  fontSize: 11,
  cursor: "pointer",
};

const btnDanger: React.CSSProperties = {
  padding: "5px 8px",
  border: "1px solid var(--app-border)",
  background: "transparent",
  color: "var(--rose)",
  borderRadius: 6,
  fontSize: 11,
  cursor: "pointer",
};

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label style={{ display: "block", fontSize: 11, fontWeight: 600 }}>
      <span
        style={{
          display: "block",
          marginBottom: 4,
          color: "var(--app-fg-2)",
        }}
      >
        {label}
      </span>
      {children}
    </label>
  );
}
