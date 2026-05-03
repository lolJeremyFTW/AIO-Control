// Inline editor for business KPIs / goals. Each row is a free-form
// target like "Make first 1k EUR" with optional current progress and
// deadline. Stored as jsonb on businesses.targets.
//
// The full target list also gets prepended to every agent's system
// prompt for that business — see lib/agents/business-context.ts.

"use client";

import { useState } from "react";

export type Target = {
  id: string;
  name: string;
  target: string;
  current?: string;
  deadline?: string | null;
  status?: "open" | "done" | "abandoned";
  notes?: string;
};

type Props = {
  value: Target[];
  onChange: (next: Target[]) => void;
};

export function TargetsEditor({ value, onChange }: Props) {
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [deadline, setDeadline] = useState("");

  const add = () => {
    if (!name.trim() || !target.trim()) return;
    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `t-${Date.now()}`;
    onChange([
      ...value,
      {
        id,
        name: name.trim(),
        target: target.trim(),
        deadline: deadline || null,
        status: "open",
      },
    ]);
    setName("");
    setTarget("");
    setDeadline("");
  };

  const update = (id: string, patch: Partial<Target>) =>
    onChange(value.map((t) => (t.id === id ? { ...t, ...patch } : t)));

  const remove = (id: string) =>
    onChange(value.filter((t) => t.id !== id));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {value.length === 0 && (
        <p
          style={{
            fontSize: 11,
            color: "var(--app-fg-3)",
            margin: 0,
            padding: "6px 0",
          }}
        >
          Nog geen targets — voeg ze hieronder toe. Agents zien deze in hun
          system prompt zodat ze weten waar naartoe te werken.
        </p>
      )}
      {value.map((t) => (
        <div
          key={t.id}
          style={{
            display: "grid",
            gridTemplateColumns: "auto 1fr 1fr 1fr 110px 28px",
            gap: 6,
            alignItems: "center",
            padding: "6px 8px",
            background: "var(--app-card-2)",
            border: "1px solid var(--app-border-2)",
            borderRadius: 8,
            fontSize: 11.5,
          }}
        >
          <select
            value={t.status ?? "open"}
            onChange={(e) =>
              update(t.id, { status: e.target.value as Target["status"] })
            }
            style={{ ...inp, padding: "4px 6px", width: 90 }}
            aria-label="Status"
          >
            <option value="open">Open</option>
            <option value="done">✓ Done</option>
            <option value="abandoned">✕ Abandoned</option>
          </select>
          <input
            value={t.name}
            onChange={(e) => update(t.id, { name: e.target.value })}
            placeholder="Naam (bv. First 1k revenue)"
            style={inp}
          />
          <input
            value={t.target}
            onChange={(e) => update(t.id, { target: e.target.value })}
            placeholder="Doel (bv. 1000 EUR)"
            style={inp}
          />
          <input
            value={t.current ?? ""}
            onChange={(e) => update(t.id, { current: e.target.value })}
            placeholder="Huidig (bv. 240 EUR)"
            style={inp}
          />
          <input
            type="date"
            value={t.deadline ?? ""}
            onChange={(e) => update(t.id, { deadline: e.target.value || null })}
            style={inp}
          />
          <button
            type="button"
            onClick={() => remove(t.id)}
            style={btnX}
            aria-label="Verwijder"
            title="Verwijder"
          >
            ✕
          </button>
        </div>
      ))}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 110px 80px",
          gap: 6,
          marginTop: 4,
        }}
      >
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="+ Naam (bv. First 1k revenue)"
          style={inp}
        />
        <input
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          placeholder="Doel (bv. 1000 EUR)"
          style={inp}
        />
        <input
          type="date"
          value={deadline}
          onChange={(e) => setDeadline(e.target.value)}
          style={inp}
        />
        <button
          type="button"
          onClick={add}
          disabled={!name.trim() || !target.trim()}
          style={{
            padding: "6px 10px",
            border: "1.5px solid var(--tt-green)",
            background: "var(--tt-green)",
            color: "#fff",
            borderRadius: 8,
            fontWeight: 700,
            fontSize: 11.5,
            cursor: "pointer",
          }}
        >
          + Voeg toe
        </button>
      </div>
    </div>
  );
}

const inp: React.CSSProperties = {
  background: "var(--app-card)",
  border: "1px solid var(--app-border)",
  color: "var(--app-fg)",
  padding: "5px 8px",
  borderRadius: 6,
  fontSize: 11.5,
  fontFamily: "var(--type)",
  minWidth: 0,
};

const btnX: React.CSSProperties = {
  width: 24,
  height: 24,
  border: "1px solid var(--app-border)",
  background: "transparent",
  color: "var(--rose)",
  borderRadius: 6,
  fontSize: 12,
  cursor: "pointer",
  padding: 0,
};
