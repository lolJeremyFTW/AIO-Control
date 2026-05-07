"use client";

export type NotificationTargetChoice = {
  id: string;
  name: string;
  provider: "slack" | "discord";
};

type Props = {
  targets: NotificationTargetChoice[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  label?: string;
};

export function NotificationBindingsField({
  targets,
  selectedIds,
  onChange,
  label = "Slack/Discord reports",
}: Props) {
  if (targets.length === 0) return null;

  const selected = new Set(selectedIds);
  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange([...next]);
  };

  return (
    <label style={field}>
      <span style={labelStyle}>{label}</span>
      <div style={grid} role="group" aria-label={label}>
        {targets.map((target) => {
          const checked = selected.has(target.id);
          return (
            <label key={target.id} style={choice(checked)}>
              <input
                type="checkbox"
                checked={checked}
                onChange={() => toggle(target.id)}
                style={checkbox}
              />
              <span style={providerPill(target.provider)}>
                {target.provider}
              </span>
              <span style={name}>{target.name}</span>
            </label>
          );
        })}
      </div>
    </label>
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
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
  gap: 8,
};

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

const providerPill = (
  provider: NotificationTargetChoice["provider"],
): React.CSSProperties => ({
  flexShrink: 0,
  fontSize: 9.5,
  fontWeight: 800,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  padding: "2px 5px",
  borderRadius: 999,
  border: "1px solid var(--app-border-2)",
  color: provider === "slack" ? "var(--tt-green)" : "var(--app-fg-2)",
});

const name: React.CSSProperties = {
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  fontSize: 12,
  fontWeight: 700,
};
