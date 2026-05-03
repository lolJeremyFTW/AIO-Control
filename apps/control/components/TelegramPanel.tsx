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
  setTelegramAutoCreateTopics,
  testTelegramTarget,
} from "../app/actions/telegram";
import { updateTelegramTopology } from "../app/actions/workspace-settings";
import type { BusinessRow } from "../lib/queries/businesses";
import type { NavNode } from "../lib/queries/nav-nodes";
import { translate } from "../lib/i18n/dict";
import { useLocale } from "../lib/i18n/client";

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
  auto_create_topics_for_businesses?: boolean;
};

export type TelegramTopology =
  | "manual"
  | "topic_per_business"
  | "topic_per_business_and_node";

type Props = {
  workspaceSlug: string;
  workspaceId: string;
  initialTargets: TelegramTargetRow[];
  businesses: BusinessRow[];
  navNodes: NavNode[];
  initialTopology: TelegramTopology;
};

export function TelegramPanel({
  workspaceSlug,
  workspaceId,
  initialTargets,
  businesses,
  navNodes,
  initialTopology,
}: Props) {
  const locale = useLocale();
  const tt = (key: string, vars?: Record<string, string | number>) =>
    translate(locale, key, vars);
  const [topology, setTopology] = useState<TelegramTopology>(initialTopology);
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

  const setTopologyAndPersist = (next: TelegramTopology) =>
    startTransition(async () => {
      setError(null);
      setInfo(null);
      const prev = topology;
      setTopology(next);
      const res = await updateTelegramTopology({
        workspace_slug: workspaceSlug,
        workspace_id: workspaceId,
        topology: next,
      });
      if (!res.ok) {
        setTopology(prev);
        setError(res.error);
      } else {
        setInfo(`Topology gezet op "${next}".`);
      }
    });

  const toggleAutoCreate = (id: string, enabled: boolean) =>
    startTransition(async () => {
      setError(null);
      setInfo(null);
      const res = await setTelegramAutoCreateTopics({
        workspace_slug: workspaceSlug,
        workspace_id: workspaceId,
        target_id: id,
        enabled,
      });
      if (!res.ok) setError(res.error);
      else {
        setTargets((prev) =>
          prev.map((t) => ({
            ...t,
            // Only one workspace-scope target may have it on at once
            // — clear siblings to mirror the server-side behaviour.
            auto_create_topics_for_businesses:
              t.id === id ? enabled : enabled ? false : t.auto_create_topics_for_businesses,
          })),
        );
        setInfo(
          enabled
            ? "Auto-topic creation aan. Nieuwe businesses krijgen vanaf nu automatisch een topic in deze groep."
            : "Auto-topic creation uit.",
        );
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
        {tt("tg.intro")}
      </p>

      <fieldset
        style={{
          border: "1.5px solid var(--app-border-2)",
          borderRadius: 10,
          padding: "10px 14px 12px",
          margin: 0,
          background: "var(--app-card-2)",
        }}
      >
        <legend
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: "var(--app-fg-2)",
            padding: "0 6px",
          }}
        >
          {tt("tg.topology.title")}
        </legend>
        {(
          [
            {
              id: "manual" as const,
              label: tt("tg.topology.manual"),
              desc: tt("tg.topology.manual.desc"),
            },
            {
              id: "topic_per_business" as const,
              label: tt("tg.topology.perBiz"),
              desc: tt("tg.topology.perBiz.desc"),
            },
            {
              id: "topic_per_business_and_node" as const,
              label: tt("tg.topology.perBizAndNode"),
              desc: tt("tg.topology.perBizAndNode.desc"),
            },
          ] as const
        ).map((opt) => (
          <label
            key={opt.id}
            style={{
              display: "flex",
              gap: 10,
              alignItems: "flex-start",
              padding: "6px 4px",
              cursor: "pointer",
              fontSize: 12,
              borderRadius: 6,
            }}
          >
            <input
              type="radio"
              name="tg-topology"
              checked={topology === opt.id}
              onChange={() => setTopologyAndPersist(opt.id)}
              style={{ accentColor: "var(--tt-green)", marginTop: 3 }}
            />
            <div>
              <div style={{ fontWeight: 700 }}>{opt.label}</div>
              <div style={{ color: "var(--app-fg-3)", marginTop: 2, fontSize: 11.5 }}>
                {opt.desc}
              </div>
            </div>
          </label>
        ))}
      </fieldset>

      <details
        style={{
          background: "var(--app-card-2)",
          border: "1px solid var(--app-border-2)",
          borderRadius: 10,
          padding: "10px 12px",
          fontSize: 12,
        }}
      >
        <summary
          style={{
            cursor: "pointer",
            fontWeight: 700,
            color: "var(--app-fg-2)",
          }}
        >
          🪄 Auto-create topic per business — setup
        </summary>
        <ol
          style={{
            paddingLeft: 18,
            margin: "8px 0 0",
            color: "var(--app-fg-3)",
            lineHeight: 1.55,
          }}
        >
          <li>
            Maak een Telegram <strong>supergroup</strong> en zet onder{" "}
            <em>Manage → Topics</em> de optie <strong>Topics</strong> AAN.
          </li>
          <li>
            Voeg je bot toe als <strong>admin</strong> met de permissie{" "}
            <strong>Manage Topics</strong> (en Send Messages, Edit, Delete).
          </li>
          <li>
            Pak de chat_id (start met <code>-100…</code>) via{" "}
            <a
              href="https://t.me/RawDataBot"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "var(--tt-green)" }}
            >
              @RawDataBot
            </a>
            , voeg hier een nieuwe channel toe scope ={" "}
            <strong>Workspace default</strong>, laat topic_id leeg.
          </li>
          <li>
            Vink hieronder <strong>&quot;Auto-create forum topic per nieuwe
            business&quot;</strong> aan op die row.
          </li>
          <li>
            Klaar — vanaf nu krijgt élke nieuwe business automatisch een
            eigen forum topic met dezelfde naam (+ emoji als je die set).
            Bestaande businesses krijgen NIET automatisch een topic; maak ze
            handmatig of dupliceer ze.
          </li>
        </ol>
      </details>

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
          {tt("tg.empty")}
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
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    flexWrap: "wrap",
                  }}
                >
                  {t.name}
                  {t.auto_create_topics_for_businesses && (
                    <span
                      style={{
                        fontSize: 9.5,
                        fontWeight: 700,
                        letterSpacing: "0.14em",
                        padding: "2px 6px",
                        borderRadius: 999,
                        border: "1px solid var(--tt-green)",
                        color: "var(--tt-green)",
                        background: "rgba(57,178,85,0.10)",
                      }}
                    >
                      {tt("tg.row.autoTopics")}
                    </span>
                  )}
                </div>
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
                {t.scope === "workspace" && (
                  <label
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      fontSize: 10.5,
                      color: "var(--app-fg-2)",
                      marginTop: 6,
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={
                        t.auto_create_topics_for_businesses ?? false
                      }
                      onChange={(e) =>
                        toggleAutoCreate(t.id, e.target.checked)
                      }
                      style={{ accentColor: "var(--tt-green)" }}
                    />
                    {tt("tg.row.autoCreateLabel")}
                  </label>
                )}
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
                {t.enabled ? tt("tg.row.on") : tt("tg.row.off")}
              </span>
              <button
                onClick={() => test(t.id)}
                disabled={pending}
                style={btnTertiary}
              >
                {tt("tg.row.test")}
              </button>
              <button
                onClick={() => remove(t.id)}
                disabled={pending}
                style={btnDanger}
              >
                {tt("tg.row.delete")}
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
          {tt("tg.add")}
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
            <Field label={tt("tg.field.name")}>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="bv. Tromptech ops"
                style={inp}
              />
            </Field>
            <Field label={tt("tg.field.scope")}>
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
                <option value="workspace">{tt("tg.field.scope.workspace")}</option>
                <option value="business" disabled={businesses.length === 0}>
                  {tt("tg.field.scope.business")}
                </option>
                <option value="navnode" disabled={navNodes.length === 0}>
                  {tt("tg.field.scope.navnode")}
                </option>
              </select>
            </Field>
          </div>

          {scope === "business" && (
            <Field label={tt("tg.field.scope.business")}>
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
            <Field label={tt("tg.field.scope.navnode")}>
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
            <Field label={tt("tg.field.chatId")}>
              <input
                value={chatId}
                onChange={(e) => setChatId(e.target.value)}
                placeholder="-1001234567890"
                style={inp}
              />
            </Field>
            <Field label={tt("tg.field.topicId")}>
              <input
                value={topicId}
                onChange={(e) => setTopicId(e.target.value)}
                placeholder="2"
                style={inp}
                inputMode="numeric"
              />
            </Field>
          </div>

          <Field label={tt("tg.field.allowlist")}>
            <input
              value={allowlist}
              onChange={(e) => setAllowlist(e.target.value)}
              placeholder="jeremy_tromp,lieftenant"
              style={inp}
            />
          </Field>

          <Field label={tt("tg.field.denylist")}>
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
              {tt("common.cancel")}
            </button>
            <button
              onClick={submit}
              disabled={pending || !name.trim() || !chatId.trim()}
              style={btnPrimary(pending)}
            >
              {pending ? tt("common.busy") : tt("common.save")}
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
