// Modal for creating an agent within a business. Picks a provider + model +
// optional system prompt. We keep it deliberately minimal in fase 5 — fase 6
// adds an edit-drawer with Schedule + Secrets + MCP tabs.

"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { createAgent, type AgentInput } from "../app/actions/agents";
import { RoutingRulesEditor } from "./RoutingRulesEditor";

type Provider = AgentInput["provider"];
type Kind = NonNullable<AgentInput["kind"]>;

type Target = { id: string; name: string };

type Props = {
  workspaceSlug: string;
  workspaceId: string;
  businessId: string;
  telegramTargets?: Target[];
  customIntegrations?: Target[];
  onClose: () => void;
};

const PROVIDERS: { id: Provider; label: string; defaultModel?: string }[] = [
  { id: "claude", label: "Claude (Anthropic)", defaultModel: "claude-sonnet-4-6" },
  { id: "openrouter", label: "OpenRouter", defaultModel: "openrouter/auto" },
  { id: "minimax", label: "MiniMax (Coder Plan)", defaultModel: "MiniMax-M2.7-Highspeed" },
  { id: "ollama", label: "Ollama (lokaal/VPS)", defaultModel: "llama3" },
  { id: "openclaw", label: "OpenClaw (eigen)" },
  { id: "hermes", label: "Hermes-agent (eigen)" },
  { id: "codex", label: "Codex / OpenAI" },
];

const KINDS: { id: Kind; label: string }[] = [
  { id: "chat", label: "Chat (interactief)" },
  { id: "worker", label: "Worker (scheduled / event-driven)" },
  { id: "reviewer", label: "Reviewer (HITL gate)" },
  { id: "generator", label: "Generator (content)" },
  { id: "router", label: "Router (smart-select)" },
];

export function NewAgentDialog({
  workspaceSlug,
  workspaceId,
  businessId,
  telegramTargets = [],
  customIntegrations = [],
  onClose,
}: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<Kind>("chat");
  const [provider, setProvider] = useState<Provider>("claude");
  const [model, setModel] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [endpoint, setEndpoint] = useState("");
  const [routingRulesJson, setRoutingRulesJson] = useState("");
  const [telegramTargetId, setTelegramTargetId] = useState("");
  const [customIntegrationId, setCustomIntegrationId] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  const providerSpec = PROVIDERS.find((p) => p.id === provider)!;
  const needsEndpoint = provider === "openclaw" || provider === "hermes";

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
          Nieuwe agent
        </h2>
        <p
          style={{
            color: "var(--app-fg-3)",
            fontSize: 12.5,
            margin: "0 0 16px",
          }}
        >
          Een agent verbindt een provider (Claude, MiniMax, …) aan deze
          business. Schedule en secrets stellen we in fase 6 in.
        </p>

        <Field label="Naam">
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
          <Field label="Soort">
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as Kind)}
              style={inputStyle}
            >
              {KINDS.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Provider">
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

        <Field label={`Model${providerSpec.defaultModel ? ` (default: ${providerSpec.defaultModel})` : ""}`}>
          <input
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder={providerSpec.defaultModel ?? "model id"}
            style={inputStyle}
          />
        </Field>

        {needsEndpoint && (
          <Field label="Endpoint URL">
            <input
              value={endpoint}
              onChange={(e) => setEndpoint(e.target.value)}
              placeholder="https://hermes.tromptech.life/v1/chat"
              style={inputStyle}
              required
            />
          </Field>
        )}

        <Field label="System prompt (optioneel)">
          <textarea
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            placeholder="Je bent een YouTube scriptwriter voor TrompTech…"
            rows={4}
            style={{ ...inputStyle, resize: "vertical", minHeight: 80 }}
          />
        </Field>

        {(telegramTargets.length > 0 || customIntegrations.length > 0) && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 12,
            }}
          >
            {telegramTargets.length > 0 && (
              <Field label="Telegram channel (optioneel)">
                <select
                  value={telegramTargetId}
                  onChange={(e) => setTelegramTargetId(e.target.value)}
                  style={inputStyle}
                >
                  <option value="">— Workspace default —</option>
                  {telegramTargets.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            {customIntegrations.length > 0 && (
              <Field label="Custom integration (optioneel)">
                <select
                  value={customIntegrationId}
                  onChange={(e) => setCustomIntegrationId(e.target.value)}
                  style={inputStyle}
                >
                  <option value="">— Workspace default —</option>
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
            Smart routing rules (advanced)
          </summary>
          <p
            style={{
              fontSize: 11.5,
              color: "var(--app-fg-3)",
              margin: "6px 0",
              lineHeight: 1.45,
            }}
          >
            Voeg regels toe die op runtime de provider+model kiezen op basis
            van de input. Eerste matching regel wint. Voorbeeld: korte inputs
            naar Haiku, lange naar Opus.
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
            Annuleer
          </button>
          <button type="submit" disabled={pending} style={btnPrimary(pending)}>
            {pending ? "Bezig…" : "Aanmaken"}
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
