// Modal for creating an agent within a business. Picks a provider + model +
// optional system prompt. We keep it deliberately minimal in fase 5 — fase 6
// adds an edit-drawer with Schedule + Secrets + MCP tabs.

"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { createAgent, type AgentInput } from "../app/actions/agents";
import { translate, type Locale } from "../lib/i18n/dict";
import { useLocale } from "../lib/i18n/client";
import { RoutingRulesEditor } from "./RoutingRulesEditor";

type Provider = AgentInput["provider"];
type Kind = NonNullable<AgentInput["kind"]>;

type Target = { id: string; name: string };

type Props = {
  workspaceSlug: string;
  workspaceId: string;
  /** null = workspace-global agent (business_id IS NULL). */
  businessId: string | null;
  telegramTargets?: Target[];
  customIntegrations?: Target[];
  /** Workspace-level defaults applied when the user opens a fresh
   *  agent dialog (he can still override). */
  defaults?: {
    provider?: string | null;
    model?: string | null;
    systemPrompt?: string | null;
  };
  /** Flattened nav_nodes tree — same shape as EditAgentDialog. Lets
   *  the user pin a fresh agent to a topic at create time so its
   *  first runs already show up on the per-topic dashboard. Empty =
   *  picker hidden. */
  navOptions?: { id: string; name: string; depth: number }[];
  /** Active UI locale — translates labels via the shared dict. */
  locale?: Locale;
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

export function NewAgentDialog({
  workspaceSlug,
  workspaceId,
  businessId,
  telegramTargets = [],
  customIntegrations = [],
  defaults,
  navOptions = [],
  locale: localeProp,
  onClose,
}: Props) {
  const cookieLocale = useLocale();
  const locale: Locale = localeProp ?? cookieLocale;
  const t = (key: string, vars?: Record<string, string | number>) =>
    translate(locale, key, vars);
  const ref = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<Kind>("chat");
  const [provider, setProvider] = useState<Provider>(
    (defaults?.provider as Provider) || "claude",
  );
  const [model, setModel] = useState(defaults?.model ?? "");
  const [systemPrompt, setSystemPrompt] = useState(defaults?.systemPrompt ?? "");
  const [endpoint, setEndpoint] = useState("");
  const [routingRulesJson, setRoutingRulesJson] = useState("");
  const [telegramTargetId, setTelegramTargetId] = useState("");
  const [customIntegrationId, setCustomIntegrationId] = useState("");
  const [navNodeId, setNavNodeId] = useState("");
  // Where this agent gets its Claude credentials. Subscription =
  // Claude Pro/Max/Team — runs on Claude's own infra (Routines for
  // cron, claude-cli for chat). api_key = Anthropic API key wired
  // through our own dispatcher + local cron. env = legacy default
  // for the rest of the providers.
  const [keySource, setKeySource] = useState<
    "subscription" | "api_key" | "env"
  >("env");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  const providerSpec = PROVIDERS.find((p) => p.id === provider)!;
  // openclaw + hermes are CLI subprocesses (binary path via env), not
  // HTTP — no per-agent endpoint needed.
  const needsEndpoint = false;

  const submit = async () => {
    setError(null);
    setPending(true);
    const res = await createAgent({
      workspace_slug: workspaceSlug,
      workspace_id: workspaceId,
      business_id: businessId,
      name,
      kind,
      provider,
      model: model || providerSpec.defaultModel,
      systemPrompt,
      endpoint: needsEndpoint ? endpoint : undefined,
      routingRulesJson: routingRulesJson || undefined,
      telegram_target_id: telegramTargetId || null,
      custom_integration_id: customIntegrationId || null,
      key_source: keySource,
      nav_node_id: navNodeId || null,
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
        style={{ padding: "22px 24px" }}
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
          {t("agent.dialog.title")}
        </h2>
        <p
          style={{
            color: "var(--app-fg-3)",
            fontSize: 12.5,
            margin: "0 0 16px",
          }}
        >
          {businessId === null
            ? t("agent.dialog.workspaceGlobal")
            : t("agent.dialog.businessScoped")}
        </p>

        <Field label={t("agent.field.name")}>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="YouTube script writer"
            style={inputStyle}
            required
          />
        </Field>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label={t("agent.field.kind")}>
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as Kind)}
              style={inputStyle}
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
              onChange={(e) => {
                const next = e.target.value as Provider;
                setProvider(next);
                setModel("");
              }}
              style={inputStyle}
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
          <input
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder={providerSpec.defaultModel ?? "model id"}
            style={inputStyle}
          />
        </Field>

        {needsEndpoint && (
          <Field label="Endpoint URL (optioneel — env default wordt gebruikt als leeg)">
            <input
              value={endpoint}
              onChange={(e) => setEndpoint(e.target.value)}
              placeholder={
                provider === "openclaw"
                  ? "http://127.0.0.1:8001/v1/chat/completions  (of laat leeg voor OPENCLAW_URL env)"
                  : "http://127.0.0.1:8002/v1/chat/completions  (of laat leeg voor HERMES_URL env)"
              }
              style={inputStyle}
            />
          </Field>
        )}

        {provider === "claude_cli" && (
          <Hint>
            Gebruikt de <code>claude</code> CLI op de VPS. Geen API key nodig
            — quotum komt uit je Claude Pro/Max/Team abonnement. Model-veld
            accepteert <code>sonnet</code>, <code>opus</code>,{" "}
            <code>haiku</code> of een full model id.
          </Hint>
        )}

        {(provider === "claude" || provider === "claude_cli") && (
          <Field label={t("agent.field.credentials")}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr",
                gap: 6,
              }}
            >
              <KeySourceRadio
                checked={keySource === "subscription"}
                label={t("agent.creds.subscription")}
                desc={t("agent.creds.subscription.desc")}
                onSelect={() => setKeySource("subscription")}
              />
              <KeySourceRadio
                checked={keySource === "api_key"}
                label={t("agent.creds.apiKey")}
                desc={t("agent.creds.apiKey.desc")}
                onSelect={() => setKeySource("api_key")}
              />
              <KeySourceRadio
                checked={keySource === "env"}
                label={t("agent.creds.env")}
                desc={t("agent.creds.env.desc")}
                onSelect={() => setKeySource("env")}
              />
            </div>
          </Field>
        )}
        {provider === "openclaw" && (
          <Hint>
            Roept <code>openclaw agent --local --json -m &lt;prompt&gt;</code> aan op de
            VPS. Override binary via <code>OPENCLAW_BIN</code> env als{" "}
            <code>openclaw</code> niet in PATH staat. Geen API key nodig in
            AIO Control — OpenClaw regelt zijn eigen provider keys.
          </Hint>
        )}
        {provider === "hermes" && (
          <Hint>
            Roept <code>hermes chat --json --message &lt;prompt&gt;</code> aan op de
            VPS. Set <code>HERMES_BIN</code> in env naar het absolute pad
            (b.v. <code>/root/.hermes/hermes-agent/hermes</code>). Let op
            user-permissies — de aio-control service draait als{" "}
            <code>jeremy</code>.
          </Hint>
        )}

        <Field label={t("agent.field.systemPrompt")}>
          <textarea
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            placeholder="Je bent een YouTube scriptwriter voor TrompTech…"
            rows={4}
            style={{ ...inputStyle, resize: "vertical", minHeight: 80 }}
          />
        </Field>

        {navOptions.length > 0 && (
          <Field label={t("agent.field.topic")}>
            <select
              value={navNodeId}
              onChange={(e) => setNavNodeId(e.target.value)}
              style={inputStyle}
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

        {(telegramTargets.length > 0 || customIntegrations.length > 0) && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 12,
            }}
          >
            {telegramTargets.length > 0 && (
              <Field label={t("agent.field.telegramTarget")}>
                <select
                  value={telegramTargetId}
                  onChange={(e) => setTelegramTargetId(e.target.value)}
                  style={inputStyle}
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
                  style={inputStyle}
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

        <details style={{ marginBottom: 12 }}>
          <summary
            style={{
              cursor: "pointer",
              fontSize: 12,
              fontWeight: 600,
              color: "var(--app-fg-2)",
              padding: "4px 0",
            }}
          >
            {t("agent.routing.title")}
          </summary>
          <p
            style={{
              fontSize: 11.5,
              color: "var(--app-fg-3)",
              margin: "6px 0",
              lineHeight: 1.45,
            }}
          >
            {t("agent.routing.desc")}
          </p>
          <RoutingRulesEditor
            value={routingRulesJson}
            onChange={setRoutingRulesJson}
          />
        </details>

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
          <button
            type="button"
            onClick={onClose}
            style={btnSecondary}
          >
            {t("common.cancel")}
          </button>
          <button type="submit" disabled={pending} style={btnPrimary(pending)}>
            {pending ? t("common.busy") : t("agent.cta.create")}
          </button>
        </div>
      </form>
    </dialog>
  );
}

const inputStyle: React.CSSProperties = {
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

function KeySourceRadio({
  checked,
  label,
  desc,
  onSelect,
}: {
  checked: boolean;
  label: string;
  desc: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      style={{
        display: "flex",
        gap: 10,
        alignItems: "flex-start",
        padding: "10px 12px",
        textAlign: "left",
        border: `1.5px solid ${checked ? "var(--tt-green)" : "var(--app-border)"}`,
        background: checked ? "rgba(57,178,85,0.08)" : "var(--app-card-2)",
        borderRadius: 10,
        color: "var(--app-fg)",
        cursor: "pointer",
        fontFamily: "var(--type)",
      }}
    >
      <span
        aria-hidden
        style={{
          width: 16,
          height: 16,
          marginTop: 1,
          borderRadius: "50%",
          border: `2px solid ${checked ? "var(--tt-green)" : "var(--app-border)"}`,
          background: checked ? "var(--tt-green)" : "transparent",
          flexShrink: 0,
        }}
      />
      <span style={{ display: "block" }}>
        <span style={{ fontSize: 13, fontWeight: 700 }}>{label}</span>
        <span
          style={{
            display: "block",
            fontSize: 11.5,
            color: "var(--app-fg-3)",
            marginTop: 2,
            lineHeight: 1.45,
          }}
        >
          {desc}
        </span>
      </span>
    </button>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return (
    <p
      style={{
        fontSize: 11.5,
        color: "var(--app-fg-3)",
        background: "var(--app-card-2)",
        border: "1px solid var(--app-border-2)",
        borderRadius: 8,
        padding: "8px 10px",
        margin: "0 0 12px",
        lineHeight: 1.45,
      }}
    >
      {children}
    </p>
  );
}

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
