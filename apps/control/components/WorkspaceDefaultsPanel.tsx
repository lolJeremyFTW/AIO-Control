// Workspace-wide defaults applied to every NEW agent unless the user
// picks something else. Resolution at run-time is unchanged:
//   per-agent provider/model > business override > workspace default

"use client";

import { useState, useTransition } from "react";

import { updateWorkspaceDefaults } from "../app/actions/workspace-settings";

const PROVIDERS = [
  { id: "claude", label: "Claude (Anthropic API key)", defaultModel: "claude-sonnet-4-6" },
  { id: "claude_cli", label: "Claude CLI (subscription)", defaultModel: "sonnet" },
  { id: "openrouter", label: "OpenRouter", defaultModel: "openrouter/auto" },
  { id: "minimax", label: "MiniMax (Coder Plan)", defaultModel: "MiniMax-M2.7-Highspeed" },
  { id: "ollama", label: "Ollama (lokaal/VPS)", defaultModel: "llama3" },
  { id: "openclaw", label: "OpenClaw (CLI subprocess)", defaultModel: "" },
  { id: "hermes", label: "Hermes-agent (CLI subprocess)", defaultModel: "" },
];

type Props = {
  workspaceSlug: string;
  workspaceId: string;
  initial: {
    provider: string | null;
    model: string | null;
    system_prompt: string | null;
  };
};

export function WorkspaceDefaultsPanel({
  workspaceSlug,
  workspaceId,
  initial,
}: Props) {
  const [provider, setProvider] = useState(initial.provider ?? "");
  const [model, setModel] = useState(initial.model ?? "");
  const [systemPrompt, setSystemPrompt] = useState(initial.system_prompt ?? "");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const spec = PROVIDERS.find((p) => p.id === provider);

  const submit = () => {
    setError(null);
    setInfo(null);
    startTransition(async () => {
      const res = await updateWorkspaceDefaults({
        workspace_slug: workspaceSlug,
        workspace_id: workspaceId,
        default_provider: provider || null,
        default_model: model || null,
        default_system_prompt: systemPrompt || null,
      });
      if (!res.ok) setError(res.error);
      else setInfo("Defaults opgeslagen. Nieuwe agents starten hier mee.");
    });
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
        Wat moet elke nieuwe agent als <strong>default</strong> krijgen? Per
        business + per topic kun je nog overschrijven via right-click →
        Instellingen op de business of in de agent zelf.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Field label="Default provider">
          <select
            value={provider}
            onChange={(e) => {
              setProvider(e.target.value);
              const sp = PROVIDERS.find((p) => p.id === e.target.value);
              if (sp && !model) setModel(sp.defaultModel);
            }}
            style={inp}
          >
            <option value="">— Geen default (user kiest per agent) —</option>
            {PROVIDERS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </Field>
        <Field
          label={`Default model${spec?.defaultModel ? ` (suggestie: ${spec.defaultModel})` : ""}`}
        >
          <input
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder={spec?.defaultModel ?? "model id"}
            style={inp}
          />
        </Field>
      </div>
      <Field label="Default system prompt (wordt aan élke agent's prompt voorgevoegd)">
        <textarea
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
          rows={4}
          placeholder={`Bijv.\n• Schrijf in NL u-vorm\n• Cite claims met [SOURCE:url] of [UNVERIFIED]\n• Geen click-bait`}
          style={{ ...inp, resize: "vertical", fontFamily: "var(--type)" }}
        />
      </Field>
      {error && (
        <p style={{ color: "var(--rose)", fontSize: 12, margin: 0 }}>{error}</p>
      )}
      {info && (
        <p style={{ color: "var(--tt-green)", fontSize: 12, margin: 0 }}>
          {info}
        </p>
      )}
      <div>
        <button
          onClick={submit}
          disabled={pending}
          style={{
            padding: "8px 14px",
            border: "1.5px solid var(--tt-green)",
            background: "var(--tt-green)",
            color: "#fff",
            borderRadius: 10,
            fontWeight: 700,
            fontSize: 12.5,
            cursor: pending ? "wait" : "pointer",
            opacity: pending ? 0.7 : 1,
          }}
        >
          {pending ? "Opslaan…" : "Opslaan"}
        </button>
      </div>
    </div>
  );
}

const inp: React.CSSProperties = {
  width: "100%",
  background: "var(--app-card-2)",
  border: "1.5px solid var(--app-border)",
  color: "var(--app-fg)",
  padding: "8px 10px",
  borderRadius: 8,
  fontSize: 13,
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
