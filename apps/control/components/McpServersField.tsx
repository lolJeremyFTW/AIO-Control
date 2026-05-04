// Shared per-agent MCP server picker. Each entry maps to a known
// server in the native host registry (packages/ai/src/mcp/host.ts).
// Flipping a checkbox writes the server id into agent.config.mcpServers
// (string[]). When empty the agent runs as plain HTTP — no tools,
// fastest path, no extra subprocesses.

"use client";

export type McpPermissions = {
  filesystem?: "off" | "ro" | "rw";
};

const MCP_OPTIONS: Array<{ id: string; label: string; desc: string }> = [
  {
    id: "minimax",
    label: "MiniMax Coder-Plan",
    desc: "web_search + understand_image (vereist MINIMAX_API_KEY env).",
  },
  {
    id: "filesystem",
    label: "Filesystem",
    desc: "Read / Write / List binnen MCP_FS_ROOT (default /home/jeremy/aio-control). Equivalent van Claude Code's Read/Write tools.",
  },
  {
    id: "fetch",
    label: "Web Fetch",
    desc: "Trekt willekeurige URLs op en geeft de body terug. Equivalent van Claude Code's WebFetch.",
  },
];

export function McpServersField({
  value,
  onToggle,
  permissions,
  onPermissionsChange,
}: {
  value: string[];
  onToggle: (id: string) => void;
  permissions?: McpPermissions;
  onPermissionsChange?: (next: McpPermissions) => void;
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
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: 0.4,
          textTransform: "uppercase",
          color: "var(--app-fg-3)",
        }}
      >
        MCP servers — welke tools mag deze agent aanroepen?
      </div>
      {MCP_OPTIONS.map((opt) => {
        const checked = value.includes(opt.id);
        // Filesystem gets a ro/rw scope picker; other servers don't
        // need one yet (minimax is read-only by nature, fetch is GET).
        const showScope = checked && opt.id === "filesystem";
        const fsScope = permissions?.filesystem ?? "rw";
        return (
          <div
            key={opt.id}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 6,
              padding: "4px 0",
            }}
          >
            <label
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 10,
                cursor: "pointer",
                fontSize: 12.5,
              }}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => onToggle(opt.id)}
                style={{ accentColor: "var(--tt-green)", marginTop: 3 }}
              />
              <span>
                <span style={{ fontWeight: 700 }}>{opt.label}</span>
                <span
                  style={{
                    display: "block",
                    fontSize: 11,
                    color: "var(--app-fg-3)",
                    marginTop: 2,
                    lineHeight: 1.5,
                  }}
                >
                  {opt.desc}
                </span>
              </span>
            </label>
            {showScope && onPermissionsChange && (
              <div
                style={{
                  display: "inline-flex",
                  marginLeft: 24,
                  border: "1.5px solid var(--app-border)",
                  borderRadius: 8,
                  background: "var(--app-card)",
                  overflow: "hidden",
                  alignSelf: "flex-start",
                }}
              >
                {(
                  [
                    { id: "ro", label: "Read-only", color: "var(--amber)" },
                    { id: "rw", label: "Read + Write", color: "var(--tt-green)" },
                  ] as const
                ).map((mode) => {
                  const active = fsScope === mode.id;
                  return (
                    <button
                      key={mode.id}
                      type="button"
                      onClick={() =>
                        onPermissionsChange({
                          ...permissions,
                          filesystem: mode.id,
                        })
                      }
                      style={{
                        padding: "4px 10px",
                        fontSize: 11,
                        fontWeight: 700,
                        background: active ? mode.color : "transparent",
                        color: active ? "#fff" : "var(--app-fg-2)",
                        border: "none",
                        cursor: "pointer",
                      }}
                    >
                      {mode.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
      <p
        style={{
          fontSize: 10.5,
          color: "var(--app-fg-3)",
          margin: "4px 0 0",
          lineHeight: 1.5,
        }}
      >
        Geen tools aangevinkt = de agent draait als plain HTTP (snel,
        goedkoop, maar zonder filesystem/web/MCP toegang).
      </p>
    </div>
  );
}
