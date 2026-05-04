// Multi-select checkbox UI for picking which workspace skills the
// agent is allowed to use. Mirrors the layout of McpServersField so
// the agent dialog stays visually consistent. The selected ids end up
// in agents.allowed_skills (uuid[]) — the system-prompt builder
// injects each enabled skill's body into the agent's preamble.

"use client";

type SkillOption = {
  id: string;
  name: string;
  description: string;
};

export function SkillsPickerField({
  options,
  value,
  onToggle,
  workspaceSlug,
}: {
  options: SkillOption[];
  value: string[];
  onToggle: (id: string) => void;
  workspaceSlug: string;
}) {
  return (
    <div
      style={{
        border: "1.5px solid var(--app-border-2)",
        borderRadius: 10,
        padding: "10px 12px",
        marginBottom: 12,
        background: "var(--app-card-2)",
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          gap: 10,
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: 0.4,
            textTransform: "uppercase",
            color: "var(--app-fg-3)",
          }}
        >
          Skills — welke procedurele kennis krijgt deze agent?
        </span>
        <a
          href={`/${workspaceSlug}/skills`}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            fontSize: 10.5,
            color: "var(--tt-green)",
            fontWeight: 700,
          }}
        >
          beheer skills →
        </a>
      </div>
      {options.length === 0 ? (
        <p
          style={{
            fontSize: 11.5,
            color: "var(--app-fg-3)",
            margin: 0,
            lineHeight: 1.5,
          }}
        >
          Nog geen skills in deze workspace. Maak er één aan via{" "}
          <a
            href={`/${workspaceSlug}/skills`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "var(--tt-green)", fontWeight: 700 }}
          >
            /{workspaceSlug}/skills
          </a>
          .
        </p>
      ) : (
        options.map((opt) => {
          const checked = value.includes(opt.id);
          return (
            <label
              key={opt.id}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 10,
                cursor: "pointer",
                fontSize: 12.5,
                padding: "4px 0",
              }}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => onToggle(opt.id)}
                style={{ accentColor: "var(--tt-green)", marginTop: 3 }}
              />
              <span>
                <span style={{ fontWeight: 700 }}>{opt.name}</span>
                <span
                  style={{
                    display: "block",
                    fontSize: 11,
                    color: "var(--app-fg-3)",
                    marginTop: 2,
                    lineHeight: 1.5,
                  }}
                >
                  {opt.description}
                </span>
              </span>
            </label>
          );
        })
      )}
      <p
        style={{
          fontSize: 10.5,
          color: "var(--app-fg-3)",
          margin: "4px 0 0",
          lineHeight: 1.5,
        }}
      >
        Geen skills aangevinkt = agent krijgt geen extra procedurele
        kennis (alleen de workspace-defaults). Aangevinkte skills
        worden volledig in de system-prompt geïnjecteerd.
      </p>
    </div>
  );
}
