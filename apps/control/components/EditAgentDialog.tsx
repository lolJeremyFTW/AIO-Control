// Edit a single existing agent. Mirrors NewAgentDialog but pre-filled,
// and dispatches updateAgent (config-merge aware) instead of create.
//
// Opened from the right-click menu on an agent card. On save we
// router.refresh so the AgentsList re-renders with the new values + a
// new key-status pill if the provider changed.

"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import {
  AIO_TOOLS,
  defaultToolsForKind,
  type AioToolSpec,
} from "@aio/ai/aio-tools";

import { updateAgent } from "../app/actions/agents";
import type { AgentRow } from "../lib/queries/agents";
import { translate } from "../lib/i18n/dict";
import { useLocale } from "../lib/i18n/client";
import { McpServersField } from "./McpServersField";
import { ProviderModelPicker } from "./ProviderModelPicker";
import { SkillsPickerField } from "./SkillsPickerField";
import { WorkflowGraph } from "./WorkflowGraph";

type Provider = AgentRow["provider"];
type Kind = AgentRow["kind"];

type Target = { id: string; name: string };

type Props = {
  workspaceSlug: string;
  /** null = workspace-global agent (business_id IS NULL). */
  businessId: string | null;
  agent: AgentRow & {
    telegram_target_id?: string | null;
    custom_integration_id?: string | null;
    next_agent_on_done?: string | null;
    next_agent_on_fail?: string | null;
    notify_email?: string | null;
    /** Allow-list of AIO Control tool names. null = use defaults for
     *  agent kind (see @aio/ai/aio-tools defaultToolsForKind). */
    allowed_tools?: string[] | null;
    /** Allow-list of workspace skill ids whose markdown bodies the
     *  system-prompt builder injects into the preamble. */
    allowed_skills?: string[] | null;
  };
  /** Workspace skills available for selection. Empty list collapses
   *  the picker into a "create your first skill" hint. */
  availableSkills?: { id: string; name: string; description: string }[];
  telegramTargets?: Target[];
  customIntegrations?: Target[];
  /** Other agents in the same workspace — used as options for the
   *  "next agent on done / fail" chain dropdowns. */
  siblingAgents?: { id: string; name: string }[];
  /** Flattened nav_nodes tree for this business — pin the agent to a
   *  topic so it shows on the per-topic dashboard. depth drives the
   *  indent in the dropdown. Empty/undefined = hide the picker
   *  (workspace-global agents have no topics to pin to). */
  navOptions?: { id: string; name: string; depth: number }[];
  onClose: () => void;
};

const PROVIDERS: { id: Provider; label: string; defaultModel?: string }[] = [
  { id: "claude", label: "Claude (Anthropic API key)", defaultModel: "claude-sonnet-4-6" },
  { id: "claude_cli", label: "Claude CLI (subscription, geen API key)", defaultModel: "sonnet" },
  { id: "openrouter", label: "OpenRouter", defaultModel: "openrouter/auto" },
  { id: "minimax", label: "MiniMax (Coder Plan)", defaultModel: "MiniMax-M2.7-Highspeed" },
  { id: "ollama", label: "Ollama (lokaal/VPS)", defaultModel: "llama3" },
  { id: "openclaw", label: "OpenClaw (CLI subprocess op VPS)" },
  { id: "hermes", label: "Hermes-agent (CLI subprocess op VPS)" },
  { id: "codex", label: "Codex / OpenAI" },
];

const KINDS: { id: Kind; labelKey: string }[] = [
  { id: "chat", labelKey: "agent.kind.chat" },
  { id: "worker", labelKey: "agent.kind.worker" },
  { id: "reviewer", labelKey: "agent.kind.reviewer" },
  { id: "generator", labelKey: "agent.kind.generator" },
  { id: "router", labelKey: "agent.kind.router" },
];

export function EditAgentDialog({
  workspaceSlug,
  businessId,
  agent,
  telegramTargets = [],
  customIntegrations = [],
  siblingAgents = [],
  navOptions = [],
  availableSkills = [],
  onClose,
}: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const locale = useLocale();
  const t = (key: string, vars?: Record<string, string | number>) =>
    translate(locale, key, vars);

  const cfg = (agent.config ?? {}) as {
    systemPrompt?: string | null;
    endpoint?: string | null;
    mcpServers?: string[] | null;
    mcpPermissions?: { filesystem?: "off" | "ro" | "rw" } | null;
  };

  const [name, setName] = useState(agent.name);
  const [kind, setKind] = useState<Kind>(agent.kind);
  const [provider, setProvider] = useState<Provider>(agent.provider);
  const [model, setModel] = useState(agent.model ?? "");
  const [systemPrompt, setSystemPrompt] = useState(cfg.systemPrompt ?? "");
  const [endpoint, setEndpoint] = useState(cfg.endpoint ?? "");
  // MCP server allow-list. Each entry maps to one server in our native
  // host registry (packages/ai/src/mcp/host.ts). When non-empty,
  // streamMinimax spawns those servers, exposes their tools to the
  // model, and dispatches tool_calls back. No Claude in the loop.
  const [mcpServers, setMcpServers] = useState<string[]>(
    Array.isArray(cfg.mcpServers) ? cfg.mcpServers : [],
  );
  const toggleMcp = (id: string) =>
    setMcpServers((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id],
    );
  const [mcpPermissions, setMcpPermissions] = useState<{
    filesystem?: "off" | "ro" | "rw";
  }>(cfg.mcpPermissions ?? {});
  const [telegramTargetId, setTelegramTargetId] = useState(
    agent.telegram_target_id ?? "",
  );
  const [customIntegrationId, setCustomIntegrationId] = useState(
    agent.custom_integration_id ?? "",
  );
  const [nextOnDone, setNextOnDone] = useState(agent.next_agent_on_done ?? "");
  const [nextOnFail, setNextOnFail] = useState(agent.next_agent_on_fail ?? "");
  const [notifyEmail, setNotifyEmail] = useState(agent.notify_email ?? "");
  const [navNodeId, setNavNodeId] = useState(agent.nav_node_id ?? "");
  // Tools allow-list. `useDefaults` toggle short-circuits the picker
  // back to the kind-default set (sent as null on save).
  const [useToolsDefault, setUseToolsDefault] = useState(
    agent.allowed_tools == null,
  );
  const [allowedTools, setAllowedTools] = useState<string[]>(
    agent.allowed_tools ?? defaultToolsForKind(agent.kind),
  );
  // Skills allow-list. Stored as uuid[] on the row; empty = no extra
  // skills injected into the system prompt.
  const [allowedSkills, setAllowedSkills] = useState<string[]>(
    agent.allowed_skills ?? [],
  );
  const toggleSkill = (id: string) =>
    setAllowedSkills((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id],
    );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  const providerSpec = PROVIDERS.find((p) => p.id === provider)!;
  const needsEndpoint = provider === "openclaw" || provider === "hermes";

  const submit = async () => {
    setError(null);
    setPending(true);
    const res = await updateAgent({
      workspace_slug: workspaceSlug,
      business_id: businessId,
      id: agent.id,
      patch: {
        name,
        kind,
        provider,
        model: model || providerSpec.defaultModel || null,
        systemPrompt: systemPrompt || null,
        endpoint: needsEndpoint ? endpoint || null : null,
        telegram_target_id: telegramTargetId || null,
        custom_integration_id: customIntegrationId || null,
        next_agent_on_done: nextOnDone || null,
        next_agent_on_fail: nextOnFail || null,
        notify_email: notifyEmail || null,
        allowed_tools: useToolsDefault ? null : allowedTools,
        allowed_skills: allowedSkills,
        nav_node_id: navNodeId || null,
        // MCP servers are only wired through the minimax provider for
        // now (claude / openrouter come in a later phase). For other
        // providers we send an empty array which the action strips
        // out of config.
        mcpServers: provider === "minimax" ? mcpServers : [],
        mcpPermissions:
          provider === "minimax" ? mcpPermissions : null,
      },
    });
    setPending(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    onClose();
    router.refresh();
  };

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      style={{
        background: "var(--app-card)",
        border: "1.5px solid var(--app-border)",
        borderRadius: 16,
        color: "var(--app-fg)",
        padding: 0,
        width: "calc(100% - 32px)",
        maxWidth: 520,
        boxShadow: "0 24px 60px -12px rgba(0,0,0,0.55)",
      }}
    >
      <form
        method="dialog"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        style={{ padding: "22px 24px", maxHeight: "85vh", overflow: "auto" }}
      >
        <h2
          style={{
            fontFamily: "var(--hand)",
            fontSize: 26,
            fontWeight: 700,
            margin: "0 0 4px",
            letterSpacing: "-0.3px",
          }}
        >
          {t("agent.edit.title")}
        </h2>
        <p
          style={{
            color: "var(--app-fg-3)",
            fontSize: 12.5,
            margin: "0 0 16px",
          }}
        >
          {t("agent.edit.sub")}
        </p>

        <Field label={t("agent.field.name")}>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={inp}
            required
          />
        </Field>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label={t("agent.field.kind")}>
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as Kind)}
              style={inp}
            >
              {KINDS.map((k) => (
                <option key={k.id} value={k.id}>
                  {t(k.labelKey)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("agent.field.provider")}>
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value as Provider)}
              style={inp}
            >
              {PROVIDERS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field
          label={
            providerSpec.defaultModel
              ? t("agent.field.modelDefault", {
                  model: providerSpec.defaultModel,
                })
              : t("agent.field.model")
          }
        >
          {provider === "openclaw" || provider === "hermes" ? (
            <ProviderModelPicker
              provider={provider}
              value={model}
              onChange={setModel}
              placeholder={providerSpec.defaultModel ?? "model id"}
            />
          ) : (
            <input
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder={providerSpec.defaultModel ?? "model id"}
              style={inp}
            />
          )}
        </Field>

        {needsEndpoint && (
          <Field label={t("agent.field.endpoint")}>
            <input
              value={endpoint}
              onChange={(e) => setEndpoint(e.target.value)}
              placeholder="https://hermes.tromptech.life/v1/chat (leeg = env default)"
              style={inp}
            />
          </Field>
        )}

        <Field label={t("agent.field.systemPrompt")}>
          <textarea
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            rows={4}
            style={{ ...inp, resize: "vertical", minHeight: 80 }}
          />
        </Field>

        {provider === "minimax" && (
          <McpServersField
            value={mcpServers}
            onToggle={toggleMcp}
            permissions={mcpPermissions}
            onPermissionsChange={setMcpPermissions}
          />
        )}

        <SkillsPickerField
          options={availableSkills}
          value={allowedSkills}
          onToggle={toggleSkill}
          workspaceSlug={workspaceSlug}
        />

        <Field label={t("agent.field.notifyEmail")}>
          <input
            value={notifyEmail}
            onChange={(e) => setNotifyEmail(e.target.value)}
            placeholder="ops@tromptech.life"
            style={inp}
          />
        </Field>

        {navOptions.length > 0 && (
          <Field label={t("agent.field.topic")}>
            <select
              value={navNodeId}
              onChange={(e) => setNavNodeId(e.target.value)}
              style={inp}
            >
              <option value="">{t("agent.field.topic.business")}</option>
              {navOptions.map((n) => (
                <option key={n.id} value={n.id}>
                  {"— ".repeat(n.depth) + n.name}
                </option>
              ))}
            </select>
          </Field>
        )}

        <details style={{ marginBottom: 12 }}>
          <summary
            style={{
              cursor: "pointer",
              fontSize: 12,
              fontWeight: 700,
              color: "var(--app-fg-2)",
              padding: "4px 0",
            }}
          >
            {t("agent.tools.title")}
          </summary>
          <p
            style={{
              fontSize: 11.5,
              color: "var(--app-fg-3)",
              margin: "6px 0 8px",
              lineHeight: 1.45,
            }}
          >
            {t("agent.tools.desc")}
          </p>
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: 12.5,
              fontWeight: 600,
              marginBottom: 8,
            }}
          >
            <input
              type="checkbox"
              checked={useToolsDefault}
              onChange={(e) => setUseToolsDefault(e.target.checked)}
            />
            <span>
              {t("agent.tools.useDefault", {
                kind,
                count: defaultToolsForKind(kind).length,
              })}
            </span>
          </label>
          {!useToolsDefault && (
            <ToolsPicker
              tools={Object.values(AIO_TOOLS)}
              selected={allowedTools}
              onChange={setAllowedTools}
            />
          )}
        </details>

        {siblingAgents.length > 0 && (
          <div
            style={{
              border: "1.5px solid var(--app-border-2)",
              background: "var(--app-card-2)",
              borderRadius: 12,
              padding: 12,
              marginBottom: 12,
            }}
          >
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: "var(--app-fg-2)",
                marginBottom: 8,
              }}
            >
              {t("agent.chain.title")}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <Field label={t("agent.chain.onDone")}>
                <select
                  value={nextOnDone}
                  onChange={(e) => setNextOnDone(e.target.value)}
                  style={inp}
                >
                  <option value="">{t("agent.chain.noChain")}</option>
                  {siblingAgents
                    .filter((a) => a.id !== agent.id)
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                </select>
              </Field>
              <Field label={t("agent.chain.onFail")}>
                <select
                  value={nextOnFail}
                  onChange={(e) => setNextOnFail(e.target.value)}
                  style={inp}
                >
                  <option value="">{t("agent.chain.noTriage")}</option>
                  {siblingAgents
                    .filter((a) => a.id !== agent.id)
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                </select>
              </Field>
            </div>
            <p style={{ fontSize: 11, color: "var(--app-fg-3)", margin: "8px 0 8px" }}>
              {t("agent.chain.note")}
            </p>
            <WorkflowGraph
              focused={{
                id: agent.id,
                name: name || agent.name,
                next_agent_on_done: nextOnDone || null,
                next_agent_on_fail: nextOnFail || null,
              }}
              agents={siblingAgents.map((a) => ({
                id: a.id,
                name: a.name,
                // We don't have their next-pointers here, but the graph
                // walks them via id lookup; without data the chain
                // stops one hop deep, which is fine for this preview.
                next_agent_on_done: null,
                next_agent_on_fail: null,
              }))}
            />
          </div>
        )}

        {(telegramTargets.length > 0 || customIntegrations.length > 0) && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {telegramTargets.length > 0 && (
              <Field label={t("agent.field.telegramTarget")}>
                <select
                  value={telegramTargetId}
                  onChange={(e) => setTelegramTargetId(e.target.value)}
                  style={inp}
                >
                  <option value="">{t("agent.field.workspaceDefault")}</option>
                  {telegramTargets.map((tgt) => (
                    <option key={tgt.id} value={tgt.id}>
                      {tgt.name}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            {customIntegrations.length > 0 && (
              <Field label={t("agent.field.customIntegration")}>
                <select
                  value={customIntegrationId}
                  onChange={(e) => setCustomIntegrationId(e.target.value)}
                  style={inp}
                >
                  <option value="">{t("agent.field.workspaceDefault")}</option>
                  {customIntegrations.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name}
                    </option>
                  ))}
                </select>
              </Field>
            )}
          </div>
        )}

        {error && (
          <p
            role="alert"
            style={{
              color: "var(--rose)",
              background: "rgba(230,82,107,0.08)",
              border: "1px solid rgba(230,82,107,0.4)",
              borderRadius: 10,
              padding: "8px 10px",
              margin: "12px 0 4px",
              fontSize: 12.5,
            }}
          >
            {error}
          </p>
        )}

        <div
          style={{
            display: "flex",
            gap: 8,
            marginTop: 18,
            justifyContent: "flex-end",
          }}
        >
          <button type="button" onClick={onClose} style={btnSecondary}>
            {t("common.cancel")}
          </button>
          <button type="submit" disabled={pending} style={btnPrimary(pending)}>
            {pending ? t("common.busy") : t("agent.cta.save")}
          </button>
        </div>
      </form>
    </dialog>
  );
}

const inp: React.CSSProperties = {
  width: "100%",
  background: "var(--app-card-2)",
  border: "1.5px solid var(--app-border)",
  color: "var(--app-fg)",
  padding: "9px 11px",
  borderRadius: 9,
  fontFamily: "var(--type)",
  fontSize: 13.5,
};

const btnSecondary: React.CSSProperties = {
  padding: "9px 14px",
  border: "1.5px solid var(--app-border)",
  background: "var(--app-card-2)",
  color: "var(--app-fg)",
  borderRadius: 10,
  fontWeight: 700,
  fontSize: 12.5,
  cursor: "pointer",
};

const btnPrimary = (pending: boolean): React.CSSProperties => ({
  padding: "9px 16px",
  border: "1.5px solid var(--tt-green)",
  background: "var(--tt-green)",
  color: "#fff",
  borderRadius: 10,
  fontWeight: 700,
  fontSize: 12.5,
  cursor: pending ? "wait" : "pointer",
  opacity: pending ? 0.8 : 1,
});

function ToolsPicker({
  tools,
  selected,
  onChange,
}: {
  tools: AioToolSpec[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const sel = new Set(selected);
  const toggle = (name: string) => {
    const next = new Set(sel);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    onChange([...next]);
  };
  const groups = {
    read: tools.filter((t) => t.category === "read"),
    write: tools.filter((t) => t.category === "write"),
    meta: tools.filter((t) => t.category === "meta"),
  };
  const groupColors: Record<string, string> = {
    read: "var(--app-fg-3)",
    write: "var(--rose)",
    meta: "var(--tt-green)",
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {(["read", "write", "meta"] as const).map((g) => (
        <div key={g}>
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: groupColors[g],
              textTransform: "uppercase",
              letterSpacing: 0.5,
              marginBottom: 4,
            }}
          >
            {g}
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 6,
            }}
          >
            {groups[g].map((t) => {
              const on = sel.has(t.name);
              return (
                <button
                  key={t.name}
                  type="button"
                  onClick={() => toggle(t.name)}
                  title={t.description}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 6,
                    padding: "6px 8px",
                    border: `1.5px solid ${on ? "var(--tt-green)" : "var(--app-border)"}`,
                    background: on
                      ? "rgba(57,178,85,0.08)"
                      : "var(--app-card-2)",
                    color: "var(--app-fg)",
                    borderRadius: 8,
                    cursor: "pointer",
                    textAlign: "left",
                    fontFamily: "var(--mono, monospace)",
                    fontSize: 11.5,
                  }}
                >
                  <span
                    aria-hidden
                    style={{
                      width: 12,
                      height: 12,
                      marginTop: 1,
                      border: `1.5px solid ${on ? "var(--tt-green)" : "var(--app-border)"}`,
                      background: on ? "var(--tt-green)" : "transparent",
                      borderRadius: 3,
                      flexShrink: 0,
                    }}
                  />
                  {t.name}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// McpServersField is now imported from ./McpServersField — extracted
// so NewAgentDialog can share the same picker without duplication.

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label
      style={{
        display: "block",
        marginBottom: 12,
        fontSize: 12,
        fontWeight: 600,
        color: "var(--app-fg-2)",
      }}
    >
      <span style={{ display: "block", marginBottom: 4 }}>{label}</span>
      {children}
    </label>
  );
}
