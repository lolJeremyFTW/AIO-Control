// Visual rule builder for the agent's routingRules. Each row picks a
// match condition + a target provider/model. The component owns its
// internal state and emits the JSON the server action expects via
// onChange. We keep the data model minimal so it round-trips through
// JSON.parse/stringify without losing fidelity.

"use client";

import { useEffect, useMemo, useState } from "react";

type Provider =
  | "claude"
  | "openrouter"
  | "minimax"
  | "ollama"
  | "openclaw"
  | "hermes"
  | "codex";

type RuleMatch = {
  inputLengthMin?: number;
  inputLengthMax?: number;
  containsAny?: string[];
};

type Rule = {
  name?: string;
  match: RuleMatch;
  use: { provider: Provider; model?: string };
};

type Props = {
  /** JSON string that round-trips with the server action. */
  value: string;
  onChange: (jsonString: string) => void;
};

const PROVIDERS: Provider[] = [
  "claude",
  "openrouter",
  "minimax",
  "ollama",
  "openclaw",
  "hermes",
  "codex",
];

function safeParse(input: string): Rule[] {
  if (!input.trim()) return [];
  try {
    const parsed = JSON.parse(input);
    if (Array.isArray(parsed)) return parsed as Rule[];
    return [];
  } catch {
    return [];
  }
}

export function RoutingRulesEditor({ value, onChange }: Props) {
  const initial = useMemo(() => safeParse(value), [value]);
  const [rules, setRules] = useState<Rule[]>(initial);

  // Bubble up as JSON whenever rules change.
  useEffect(() => {
    onChange(rules.length ? JSON.stringify(rules, null, 2) : "");
  }, [rules, onChange]);

  const updateRule = (idx: number, patch: Partial<Rule>) => {
    setRules((rs) =>
      rs.map((r, i) => (i === idx ? { ...r, ...patch, match: { ...r.match, ...(patch.match ?? {}) }, use: { ...r.use, ...(patch.use ?? {}) } } : r)),
    );
  };

  const removeRule = (idx: number) => {
    setRules((rs) => rs.filter((_, i) => i !== idx));
  };

  const addRule = () => {
    setRules((rs) => [
      ...rs,
      {
        name: rs.length === 0 ? "Korte vraag → Haiku" : `Regel ${rs.length + 1}`,
        match: { inputLengthMax: 200 },
        use: { provider: "claude", model: "claude-haiku-4-5" },
      },
    ]);
  };

  if (rules.length === 0) {
    return (
      <div
        style={{
          padding: 12,
          border: "1.5px dashed var(--app-border)",
          borderRadius: 10,
        }}
      >
        <p
          style={{
            fontSize: 11.5,
            color: "var(--app-fg-3)",
            margin: "0 0 10px",
            lineHeight: 1.45,
          }}
        >
          Geen regels — alle requests gaan naar de provider+model die hierboven
          gekozen is. Voeg regels toe om bv. korte requests goedkoop te
          routeren.
        </p>
        <button type="button" onClick={addRule} style={btnSecondary}>
          + Regel toevoegen
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {rules.map((rule, idx) => (
        <div
          key={idx}
          style={{
            padding: 10,
            border: "1.5px solid var(--app-border)",
            borderRadius: 10,
            background: "var(--app-card-2)",
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <div style={{ display: "flex", gap: 8 }}>
            <input
              type="text"
              placeholder={`Regel ${idx + 1}`}
              value={rule.name ?? ""}
              onChange={(e) => updateRule(idx, { name: e.target.value })}
              style={{ ...input, flex: 1 }}
            />
            <button
              type="button"
              onClick={() => removeRule(idx)}
              style={{ ...btnSecondary, color: "var(--rose)", borderColor: "var(--rose)" }}
            >
              Verwijder
            </button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <label style={lbl}>
              <span style={lblText}>Min. lengte (chars)</span>
              <input
                type="number"
                min={0}
                value={rule.match.inputLengthMin ?? ""}
                onChange={(e) =>
                  updateRule(idx, {
                    match: {
                      inputLengthMin: e.target.value === "" ? undefined : Number(e.target.value),
                    },
                  })
                }
                style={input}
              />
            </label>
            <label style={lbl}>
              <span style={lblText}>Max. lengte (chars)</span>
              <input
                type="number"
                min={0}
                value={rule.match.inputLengthMax ?? ""}
                onChange={(e) =>
                  updateRule(idx, {
                    match: {
                      inputLengthMax: e.target.value === "" ? undefined : Number(e.target.value),
                    },
                  })
                }
                style={input}
              />
            </label>
          </div>

          <label style={lbl}>
            <span style={lblText}>
              Bevat één van (komma-gescheiden trefwoorden)
            </span>
            <input
              type="text"
              placeholder="bv. samenvat, vertaal, verzin titel"
              value={(rule.match.containsAny ?? []).join(", ")}
              onChange={(e) =>
                updateRule(idx, {
                  match: {
                    containsAny: e.target.value
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean),
                  },
                })
              }
              style={input}
            />
          </label>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <label style={lbl}>
              <span style={lblText}>Gebruik provider</span>
              <select
                value={rule.use.provider}
                onChange={(e) =>
                  updateRule(idx, { use: { provider: e.target.value as Provider } })
                }
                style={input}
              >
                {PROVIDERS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>
            <label style={lbl}>
              <span style={lblText}>Model (override)</span>
              <input
                type="text"
                value={rule.use.model ?? ""}
                onChange={(e) =>
                  updateRule(idx, {
                    use: { provider: rule.use.provider, model: e.target.value || undefined },
                  })
                }
                placeholder="claude-haiku-4-5"
                style={input}
              />
            </label>
          </div>
        </div>
      ))}
      <button type="button" onClick={addRule} style={btnSecondary}>
        + Regel toevoegen
      </button>
    </div>
  );
}

const input: React.CSSProperties = {
  width: "100%",
  background: "var(--app-card)",
  border: "1.5px solid var(--app-border)",
  color: "var(--app-fg)",
  padding: "7px 10px",
  borderRadius: 8,
  fontFamily: "var(--type)",
  fontSize: 12.5,
};

const lbl: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: "var(--app-fg-2)" };

const lblText: React.CSSProperties = { display: "block", marginBottom: 3 };

const btnSecondary: React.CSSProperties = {
  padding: "6px 12px",
  border: "1.5px solid var(--app-border)",
  background: "var(--app-card-2)",
  color: "var(--app-fg)",
  borderRadius: 8,
  fontWeight: 700,
  fontSize: 12,
  cursor: "pointer",
};
