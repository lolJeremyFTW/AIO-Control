// Slack/Discord notification target manager. Telegram stays on its
// legacy settings page for now; this panel proves the generic target
// model with test pings before run fanout is switched over.

"use client";

import { useState, useTransition } from "react";

import {
  createNotificationTarget,
  deleteNotificationTarget,
  testNotificationTarget,
  type ChannelProvider,
  type NotificationTargetRow,
} from "../app/actions/notification-targets";
import type { BusinessRow } from "../lib/queries/businesses";
import type { NavNode } from "../lib/queries/nav-nodes";

type Scope = "workspace" | "business" | "navnode";
type Mode = "bot_token" | "incoming_webhook" | "webhook";

type Props = {
  workspaceSlug: string;
  workspaceId: string;
  initialTargets: NotificationTargetRow[];
  businesses: BusinessRow[];
  navNodes: NavNode[];
};

export function NotificationTargetsPanel({
  workspaceSlug,
  workspaceId,
  initialTargets,
  businesses,
  navNodes,
}: Props) {
  const [targets, setTargets] = useState(initialTargets);
  const [adding, setAdding] = useState(false);
  const [provider, setProvider] = useState<ChannelProvider>("slack");
  const [mode, setMode] = useState<Mode>("bot_token");
  const [scope, setScope] = useState<Scope>("workspace");
  const [scopeId, setScopeId] = useState(workspaceId);
  const [name, setName] = useState("");
  const [channelId, setChannelId] = useState("");
  const [teamId, setTeamId] = useState("");
  const [guildId, setGuildId] = useState("");
  const [threadRef, setThreadRef] = useState("");
  const [secretName, setSecretName] = useState("");
  const [allowlist, setAllowlist] = useState("");
  const [denylist, setDenylist] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const effectiveMode =
    provider === "slack" && mode === "webhook"
      ? "incoming_webhook"
      : provider === "discord" && mode === "incoming_webhook"
        ? "webhook"
        : mode;

  const submit = () => {
    setError(null);
    setInfo(null);
    startTransition(async () => {
      const config =
        effectiveMode === "bot_token"
          ? provider === "slack"
            ? {
                mode: effectiveMode,
                channel_id: channelId,
                team_id: teamId || null,
                thread_ts: threadRef || null,
              }
            : {
                mode: effectiveMode,
                channel_id: channelId,
                guild_id: guildId || null,
                thread_id: threadRef || null,
              }
          : {
              mode: effectiveMode,
              webhook_url_secret_provider: secretName,
              ...(provider === "slack"
                ? { thread_ts: threadRef || null }
                : { thread_id: threadRef || null }),
            };

      const res = await createNotificationTarget({
        workspace_slug: workspaceSlug,
        workspace_id: workspaceId,
        provider,
        scope,
        scope_id: scope === "workspace" ? workspaceId : scopeId,
        name,
        config,
        allowlist: splitList(allowlist),
        denylist: splitList(denylist),
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }

      setTargets((prev) => [
        ...prev,
        {
          id: res.data.id,
          provider,
          scope,
          scope_id: scope === "workspace" ? workspaceId : scopeId,
          name,
          config,
          allowlist: splitList(allowlist),
          denylist: splitList(denylist),
          send_run_done: true,
          send_run_fail: true,
          send_queue_review: true,
          enabled: true,
        },
      ]);
      setAdding(false);
      setName("");
      setChannelId("");
      setTeamId("");
      setGuildId("");
      setThreadRef("");
      setSecretName("");
      setAllowlist("");
      setDenylist("");
    });
  };

  const remove = (id: string) =>
    startTransition(async () => {
      const res = await deleteNotificationTarget({
        workspace_slug: workspaceSlug,
        id,
      });
      if (res.ok) setTargets((prev) => prev.filter((t) => t.id !== id));
      else setError(res.error);
    });

  const test = (id: string) =>
    startTransition(async () => {
      setInfo(null);
      setError(null);
      const res = await testNotificationTarget({
        workspace_id: workspaceId,
        target_id: id,
      });
      if (res.ok) {
        setInfo(
          `Test verstuurd${res.data.label ? ` naar ${res.data.label}` : ""}.`,
        );
      } else {
        setError(res.error);
      }
    });

  const labelFor = (target: NotificationTargetRow) => {
    if (target.scope === "workspace") return "Workspace";
    if (target.scope === "business") {
      const business = businesses.find((b) => b.id === target.scope_id);
      return `Business · ${business?.name ?? "(verwijderd)"}`;
    }
    const node = navNodes.find((n) => n.id === target.scope_id);
    return `Topic · ${node?.name ?? "(verwijderd)"}`;
  };

  const canSubmit = Boolean(
    name.trim() &&
    (effectiveMode === "bot_token" ? channelId.trim() : secretName.trim()),
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <p style={intro}>
        Configureer Slack- en Discord-kanalen voor de nieuwe notificatielaag.
        Secrets blijven in API Keys; deze rows bewaren alleen routing en
        kanaalconfig.
      </p>

      {targets.length === 0 ? (
        <p style={empty}>Nog geen Slack/Discord-kanalen.</p>
      ) : (
        <div style={list}>
          {targets.map((target) => (
            <div key={target.id} style={row}>
              <div>
                <div style={rowTitle}>
                  <span style={providerPill(target.provider)}>
                    {target.provider}
                  </span>
                  {target.name}
                </div>
                <div style={muted}>{describeConfig(target)}</div>
              </div>
              <div style={{ fontSize: 12, color: "var(--app-fg-2)" }}>
                {labelFor(target)}
              </div>
              <span style={statePill(target.enabled)}>
                {target.enabled ? "aan" : "uit"}
              </span>
              <button
                type="button"
                onClick={() => test(target.id)}
                disabled={pending}
                style={btnTertiary}
              >
                Test
              </button>
              <button
                type="button"
                onClick={() => remove(target.id)}
                disabled={pending}
                style={btnDanger}
              >
                Verwijder
              </button>
            </div>
          ))}
        </div>
      )}

      {info && <p style={okText}>{info}</p>}
      {error && <p style={errText}>{error}</p>}

      {!adding && (
        <button type="button" onClick={() => setAdding(true)} style={btnAdd}>
          + Kanaal toevoegen
        </button>
      )}

      {adding && (
        <div style={formShell}>
          <div style={grid2}>
            <Field label="Provider">
              <select
                value={provider}
                onChange={(e) => {
                  const next = e.target.value as ChannelProvider;
                  setProvider(next);
                  setMode("bot_token");
                }}
                style={inp}
              >
                <option value="slack">Slack</option>
                <option value="discord">Discord</option>
              </select>
            </Field>
            <Field label="Naam">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="bv. Ops alerts"
                style={inp}
              />
            </Field>
          </div>

          <div style={grid2}>
            <Field label="Mode">
              <select
                value={effectiveMode}
                onChange={(e) => setMode(e.target.value as Mode)}
                style={inp}
              >
                <option value="bot_token">Bot token</option>
                <option
                  value={provider === "slack" ? "incoming_webhook" : "webhook"}
                >
                  Webhook URL secret
                </option>
              </select>
            </Field>
            <Field label="Scope">
              <select
                value={scope}
                onChange={(e) => {
                  const next = e.target.value as Scope;
                  setScope(next);
                  setScopeId(
                    next === "workspace"
                      ? workspaceId
                      : next === "business"
                        ? (businesses[0]?.id ?? "")
                        : (navNodes[0]?.id ?? ""),
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
                {businesses.map((business) => (
                  <option key={business.id} value={business.id}>
                    {business.name}
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
                {navNodes.map((node) => (
                  <option key={node.id} value={node.id}>
                    {node.name}
                  </option>
                ))}
              </select>
            </Field>
          )}

          {effectiveMode === "bot_token" ? (
            <>
              <div style={grid2}>
                <Field
                  label={`${provider === "slack" ? "Slack" : "Discord"} channel_id`}
                >
                  <input
                    value={channelId}
                    onChange={(e) => setChannelId(e.target.value)}
                    placeholder={
                      provider === "slack" ? "C0123..." : "1234567890"
                    }
                    style={inp}
                  />
                </Field>
                {provider === "slack" ? (
                  <Field label="team_id (optioneel)">
                    <input
                      value={teamId}
                      onChange={(e) => setTeamId(e.target.value)}
                      placeholder="T0123..."
                      style={inp}
                    />
                  </Field>
                ) : (
                  <Field label="guild_id (optioneel)">
                    <input
                      value={guildId}
                      onChange={(e) => setGuildId(e.target.value)}
                      placeholder="1234567890"
                      style={inp}
                    />
                  </Field>
                )}
              </div>
              <Field
                label={
                  provider === "slack"
                    ? "thread_ts (optioneel)"
                    : "thread_id (optioneel)"
                }
              >
                <input
                  value={threadRef}
                  onChange={(e) => setThreadRef(e.target.value)}
                  placeholder={
                    provider === "slack" ? "1715000000.000000" : "1234567890"
                  }
                  style={inp}
                />
              </Field>
            </>
          ) : (
            <>
              <Field label="Webhook URL secretnaam">
                <input
                  value={secretName}
                  onChange={(e) => setSecretName(e.target.value)}
                  placeholder={
                    provider === "slack"
                      ? "SLACK_WEBHOOK_URL_OPS"
                      : "DISCORD_WEBHOOK_URL_OPS"
                  }
                  style={inp}
                />
              </Field>
              <Field
                label={
                  provider === "slack"
                    ? "thread_ts (optioneel)"
                    : "thread_id (optioneel)"
                }
              >
                <input
                  value={threadRef}
                  onChange={(e) => setThreadRef(e.target.value)}
                  placeholder={
                    provider === "slack" ? "1715000000.000000" : "1234567890"
                  }
                  style={inp}
                />
              </Field>
            </>
          )}

          <div style={grid2}>
            <Field label="Allowlist (optioneel)">
              <input
                value={allowlist}
                onChange={(e) => setAllowlist(e.target.value)}
                placeholder="jeremy,ops-lead"
                style={inp}
              />
            </Field>
            <Field label="Denylist (optioneel)">
              <input
                value={denylist}
                onChange={(e) => setDenylist(e.target.value)}
                placeholder="blocked-user"
                style={inp}
              />
            </Field>
          </div>

          <div style={actions}>
            <button
              type="button"
              onClick={() => setAdding(false)}
              style={btnSecondary}
              disabled={pending}
            >
              Annuleer
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={pending || !canSubmit}
              style={btnPrimary(pending)}
            >
              {pending ? "Bezig..." : "Opslaan"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function splitList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function describeConfig(target: NotificationTargetRow): string {
  const mode =
    typeof target.config.mode === "string" ? target.config.mode : "bot_token";
  const thread =
    typeof target.config.thread_ts === "string" && target.config.thread_ts
      ? ` thread ${target.config.thread_ts}`
      : typeof target.config.thread_id === "string" && target.config.thread_id
        ? ` thread ${target.config.thread_id}`
        : "";
  if (mode === "incoming_webhook" || mode === "webhook") {
    return `webhook secret ${String(target.config.webhook_url_secret_provider ?? "")}${thread}`;
  }
  return `channel ${String(target.config.channel_id ?? "")}${thread}`;
}

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

const intro: React.CSSProperties = {
  fontSize: 12.5,
  color: "var(--app-fg-3)",
  margin: 0,
  lineHeight: 1.5,
};

const empty: React.CSSProperties = {
  fontSize: 12.5,
  color: "var(--app-fg-3)",
  padding: 16,
  border: "1px dashed var(--app-border)",
  borderRadius: 10,
  margin: 0,
};

const list: React.CSSProperties = {
  border: "1px solid var(--app-border)",
  borderRadius: 10,
  overflow: "hidden",
};

const row: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr 80px 80px 80px",
  gap: 8,
  alignItems: "center",
  padding: "10px 12px",
  borderBottom: "1px solid var(--app-border-2)",
  background: "var(--app-card-2)",
};

const rowTitle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  display: "flex",
  alignItems: "center",
  gap: 6,
  flexWrap: "wrap",
};

const muted: React.CSSProperties = {
  fontSize: 11,
  color: "var(--app-fg-3)",
  marginTop: 2,
};

const okText: React.CSSProperties = {
  color: "var(--tt-green)",
  fontSize: 12,
  margin: 0,
};

const errText: React.CSSProperties = {
  color: "var(--rose)",
  fontSize: 12,
  margin: 0,
};

const formShell: React.CSSProperties = {
  border: "1.5px solid var(--app-border)",
  background: "var(--app-card-2)",
  borderRadius: 12,
  padding: 14,
  display: "flex",
  flexDirection: "column",
  gap: 10,
};

const grid2: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 10,
};

const actions: React.CSSProperties = {
  display: "flex",
  gap: 8,
  justifyContent: "flex-end",
  marginTop: 4,
};

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

const providerPill = (provider: ChannelProvider): React.CSSProperties => ({
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  padding: "2px 6px",
  borderRadius: 999,
  border: "1px solid var(--app-border)",
  color: provider === "slack" ? "var(--tt-green)" : "var(--app-fg-2)",
});

const statePill = (enabled: boolean): React.CSSProperties => ({
  fontSize: 10.5,
  fontWeight: 700,
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  color: enabled ? "var(--tt-green)" : "var(--rose)",
});
