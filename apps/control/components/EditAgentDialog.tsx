// Edit a single existing agent. Mirrors NewAgentDialog but pre-filled,
// and dispatches updateAgent (config-merge aware) instead of create.
//
// Opened from the right-click menu on an agent card. On save we
// router.refresh so the AgentsList re-renders with the new values + a
// new key-status pill if the provider changed.

"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { updateAgent } from "../app/actions/agents";
import type { AgentRow } from "../lib/queries/agents";

type Provider = AgentRow["provider"];
type Kind = AgentRow["kind"];

type Target = { id: string; name: string };

type Props = {
  workspaceSlug: string;
  businessId: string;
  agent: AgentRow & {
    telegram_target_id?: string | null;
    custom_integration_id?: string | null;
    next_agent_on_done?: string | null;
    next_agent_on_fail?: string | null;
    notify_email?: string | null;
  };
  telegramTargets?: Target[];
  customIntegrations?: Target[];
  /** Other agents in the same workspace — used as options for the
   *  "next agent on done / fail" chain dropdowns. */
  siblingAgents?: { id: string; name: string }[];
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

export function EditAgentDialog({
  workspaceSlug,
  businessId,
  agent,
  telegramTargets = [],
  customIntegrations = [],
  siblingAgents = [],
  onClose,
}: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const router = useRouter();

  const cfg = (agent.config ?? {}) as {
    systemPrompt?: string | null;
    endpoint?: string | null;
  };

  const [name, setName] = useState(agent.name);
  const [kind, setKind] = useState<Kind>(agent.kind);
  const [provider, setProvider] = useState<Provider>(agent.provider);
  const [model, setModel] = useState(agent.model ?? "");
  const [systemPrompt, setSystemPrompt] = useState(cfg.systemPrompt ?? "");
  const [endpoint, setEndpoint] = useState(cfg.endpoint ?? "");
  const [telegramTargetId, setTelegramTargetId] = useState(
    agent.telegram_target_id ?? "",
  );
  const [customIntegrationId, setCustomIntegrationId] = useState(
    agent.custom_integration_id ?? "",
  );
  const [nextOnDone, setNextOnDone] = useState(agent.next_agent_on_done ?? "");
  const [nextOnFail, setNextOnFail] = useState(agent.next_agent_on_fail ?? "");
  const [notifyEmail, setNotifyEmail] = useState(agent.notify_email ?? "");
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
          Agent bewerken
        </h2>
        <p
          style={{
            color: "var(--app-fg-3)",
            fontSize: 12.5,
            margin: "0 0 16px",
          }}
        >
          Pas naam, provider, system prompt en reporting targets aan.
        </p>

        <Field label="Naam">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={inp}
            required
          />
        </Field>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="Soort">
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as Kind)}
              style={inp}
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
          label={`Model${providerSpec.defaultModel ? ` (default: ${providerSpec.defaultModel})` : ""}`}
        >
          <input
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder={providerSpec.defaultModel ?? "model id"}
            style={inp}
          />
        </Field>

        {needsEndpoint && (
          <Field label="Endpoint URL">
            <input
              value={endpoint}
              onChange={(e) => setEndpoint(e.target.value)}
              placeholder="https://hermes.tromptech.life/v1/chat"
              style={inp}
              required
            />
          </Field>
        )}

        <Field label="System prompt">
          <textarea
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            rows={4}
            style={{ ...inp, resize: "vertical", minHeight: 80 }}
          />
        </Field>

        <Field label="Email (override workspace default)">
          <input
            value={notifyEmail}
            onChange={(e) => setNotifyEmail(e.target.value)}
            placeholder="ops@tromptech.life"
            style={inp}
          />
        </Field>

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
              Chain — wat draait er na deze agent?
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <Field label="Bij DONE → run agent">
                <select
                  value={nextOnDone}
                  onChange={(e) => setNextOnDone(e.target.value)}
                  style={inp}
                >
                  <option value="">— Geen chain —</option>
                  {siblingAgents
                    .filter((a) => a.id !== agent.id)
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                </select>
              </Field>
              <Field label="Bij FAIL → run agent (triage)">
                <select
                  value={nextOnFail}
                  onChange={(e) => setNextOnFail(e.target.value)}
                  style={inp}
                >
                  <option value="">— Geen triage —</option>
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
            <p style={{ fontSize: 11, color: "var(--app-fg-3)", margin: "8px 0 0" }}>
              De volgende agent ontvangt deze run&apos;s output als input
              prompt — perfect voor extract → translate → publish chains.
            </p>
          </div>
        )}

        {(telegramTargets.length > 0 || customIntegrations.length > 0) && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {telegramTargets.length > 0 && (
              <Field label="Telegram channel">
                <select
                  value={telegramTargetId}
                  onChange={(e) => setTelegramTargetId(e.target.value)}
                  style={inp}
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
              <Field label="Custom integration">
                <select
                  value={customIntegrationId}
                  onChange={(e) => setCustomIntegrationId(e.target.value)}
                  style={inp}
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
            Annuleer
          </button>
          <button type="submit" disabled={pending} style={btnPrimary(pending)}>
            {pending ? "Opslaan…" : "Opslaan"}
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
