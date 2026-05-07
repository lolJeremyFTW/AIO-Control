"use client";

export type AgentTopicChoice = {
  id: string;
  name: string;
  depth: number;
};

type Props = {
  options: AgentTopicChoice[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  label?: string;
  emptyLabel?: string;
};

export function AgentTopicsField({
  options,
  selectedIds,
  onChange,
  label = "Topics",
  emptyLabel = "Gehele business",
}: Props) {
  if (options.length === 0) return null;

  const selected = new Set(selectedIds);
  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(options.filter((option) => next.has(option.id)).map((o) => o.id));
  };

  return (
    <div style={field}>
      <span style={labelStyle}>{label}</span>
      <div style={grid} role="group" aria-label={label}>
        <button
          type="button"
          onClick={() => onChange([])}
          style={wholeBusiness(selected.size === 0)}
        >
          {emptyLabel}
        </button>
        {options.map((option) => {
          const checked = selected.has(option.id);
          return (
            <label key={option.id} style={choice(checked)}>
              <input
                type="checkbox"
                checked={checked}
                onChange={() => toggle(option.id)}
                style={checkbox}
              />
              <span
                style={{
                  ...topicName,
                  paddingLeft: option.depth * 12,
                }}
              >
                {option.name}
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

const field: React.CSSProperties = {
  display: "block",
  marginBottom: 12,
  fontSize: 12,
  fontWeight: 600,
  color: "var(--app-fg-2)",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  marginBottom: 4,
};

const grid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 8,
};

const wholeBusiness = (checked: boolean): React.CSSProperties => ({
  minHeight: 38,
  display: "flex",
  alignItems: "center",
  padding: "8px 10px",
  border: `1.5px solid ${checked ? "var(--tt-green)" : "var(--app-border)"}`,
  background: checked ? "rgba(57,178,85,0.08)" : "var(--app-card-2)",
  borderRadius: 8,
  color: "var(--app-fg)",
  cursor: "pointer",
  fontFamily: "var(--type)",
  fontSize: 12,
  fontWeight: 700,
  textAlign: "left",
});

const choice = (checked: boolean): React.CSSProperties => ({
  minHeight: 38,
  display: "flex",
  alignItems: "center",
  gap: 7,
  padding: "8px 9px",
  border: `1.5px solid ${checked ? "var(--tt-green)" : "var(--app-border)"}`,
  background: checked ? "rgba(57,178,85,0.08)" : "var(--app-card-2)",
  borderRadius: 8,
  color: "var(--app-fg)",
  cursor: "pointer",
  minWidth: 0,
});

const checkbox: React.CSSProperties = {
  accentColor: "var(--tt-green)",
  flexShrink: 0,
};

const topicName: React.CSSProperties = {
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  fontSize: 12,
  fontWeight: 700,
};
