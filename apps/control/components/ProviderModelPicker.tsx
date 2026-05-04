// Lazy-loaded model dropdown for CLI providers (openclaw, hermes).
// Fetches the host's actual configured models on mount and falls back
// gracefully to a free-text input when the API returns nothing or fails
// (e.g. the config file isn't readable yet). The "Custom…" entry always
// flips to the text mode so the user can type a model id we haven't
// pre-listed.

"use client";

import { useEffect, useMemo, useState } from "react";

type Model = { id: string; label: string; group: string };

type Props = {
  provider: "openclaw" | "hermes";
  value: string;
  onChange: (next: string) => void;
  /** Fallback placeholder when no models load (e.g. CLI not on this host). */
  placeholder?: string;
};

export function ProviderModelPicker({
  provider,
  value,
  onChange,
  placeholder,
}: Props) {
  const [models, setModels] = useState<Model[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"select" | "custom">("custom");

  useEffect(() => {
    const ctl = new AbortController();
    const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
    fetch(`${base}/api/providers/${provider}/models`, { signal: ctl.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(await res.text());
        return res.json() as Promise<{ models: Model[] }>;
      })
      .then((data) => {
        setModels(data.models);
        // Open in select mode when we got something AND the current
        // value either matches one of the entries or is empty.
        const matches = data.models.some((m) => m.id === value);
        if (data.models.length > 0 && (matches || !value)) {
          setMode("select");
        }
      })
      .catch((err) => {
        if (err instanceof Error && err.name !== "AbortError") {
          setError(err.message);
        }
        setModels([]);
      });
    return () => ctl.abort();
  }, [provider, value]);

  const grouped = useMemo(() => {
    if (!models) return [];
    const byGroup = new Map<string, Model[]>();
    for (const m of models) {
      const arr = byGroup.get(m.group) ?? [];
      arr.push(m);
      byGroup.set(m.group, arr);
    }
    return Array.from(byGroup.entries()).sort(([a], [b]) =>
      a.localeCompare(b),
    );
  }, [models]);

  if (models === null) {
    return (
      <div
        style={{
          padding: "9px 11px",
          background: "var(--app-card-2)",
          border: "1.5px solid var(--app-border)",
          color: "var(--app-fg-3)",
          borderRadius: 9,
          fontSize: 12.5,
        }}
      >
        Modellen ophalen…
      </div>
    );
  }

  if (mode === "custom" || models.length === 0) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={
            placeholder ??
            (provider === "openclaw"
              ? // openai-codex/gpt-5.5 is the canonical name for users
                // authenticated via ChatGPT Plus OAuth (most common
                // OpenClaw setup). codex/<x> is a separate provider
                // that requires a different token format.
                "openai-codex/gpt-5.5 of amazon-bedrock/anthropic.claude-..."
              : "302ai/qwen3-235b-a22b of …")
          }
          style={inputStyle}
        />
        {models.length > 0 && (
          <button
            type="button"
            onClick={() => setMode("select")}
            style={linkStyle}
          >
            ← Kies uit beschikbare modellen ({models.length})
          </button>
        )}
        {error && (
          <p style={{ fontSize: 11, color: "var(--rose)", margin: 0 }}>
            Kon model-lijst niet laden: {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <select
        value={value}
        onChange={(e) => {
          if (e.target.value === "__custom__") setMode("custom");
          else onChange(e.target.value);
        }}
        style={inputStyle}
      >
        <option value="">— Default ({provider} kiest) —</option>
        {grouped.map(([group, arr]) => (
          <optgroup key={group} label={group}>
            {arr.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </optgroup>
        ))}
        <option value="__custom__">+ Custom model id…</option>
      </select>
      <p
        style={{
          fontSize: 10.5,
          color: "var(--app-fg-3)",
          margin: 0,
        }}
      >
        Gevonden in {provider}'s eigen config op de server. Werkt alleen
        als de CLI er auth voor heeft.
      </p>
    </div>
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

const linkStyle: React.CSSProperties = {
  alignSelf: "flex-start",
  background: "transparent",
  border: "none",
  color: "var(--tt-green)",
  fontSize: 11,
  fontWeight: 600,
  cursor: "pointer",
  padding: 0,
  textDecoration: "underline",
};
