// Shared per-agent MCP server picker. Each entry maps to a known
// server in the native host registry (packages/ai/src/mcp/host.ts).
// Flipping a checkbox writes the server id into agent.config.mcpServers
// (string[]). When empty the agent runs as plain HTTP — no tools,
// fastest path, no extra subprocesses.

"use client";

import { useState } from "react";

export type McpPermissions = {
  filesystem?: "off" | "ro" | "rw";
  aio?: "off" | "ro" | "rw";
};

const BUILTIN_SERVERS: Array<{ id: string; label: string; desc: string; badge?: string }> = [
  {
    id: "minimax",
    label: "MiniMax Coder-Plan",
    desc: "web_search + understand_image (vereist MINIMAX_API_KEY env).",
  },
  {
    id: "aio",
    label: "AIO Control",
    desc: "list_businesses, list_agents, list_runs, send_telegram_message.",
  },
  {
    id: "bash",
    label: "Bash Shell",
    desc: "Volledige shell-toegang op de VPS. Gevaarlijke commands vereisen goedkeuring.",
  },
  {
    id: "filesystem",
    label: "Filesystem",
    desc: "Read / Write / List binnen MCP_FS_ROOT (default /home/jeremy).",
  },
  {
    id: "fetch",
    label: "Web Fetch",
    desc: "Trekt willekeurige URLs op en retourneert de body als tekst/markdown. Officieel Anthropic MCP.",
    badge: "official",
  },
  {
    id: "playwright",
    label: "Playwright Browser",
    desc: "Volledig Chromium browser met JS-rendering. Navigeren, klikken, formulieren, screenshots. Models zijn hier op getraind.",
    badge: "official",
  },
  {
    id: "brave",
    label: "Brave Search",
    desc: "Hoge-kwaliteit web + nieuws zoekopdrachten via Brave Search API. Vereist BRAVE_API_KEY in workspace secrets.",
    badge: "official",
  },
  {
    id: "memory",
    label: "Memory (Knowledge Graph)",
    desc: "Persistent geheugen tussen runs: entities, relaties, observaties. Agents kunnen feiten opslaan en ophalen.",
    badge: "official",
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
  // Split built-in vs custom servers
  const builtinIds = BUILTIN_SERVERS.map((s) => s.id);
  const customServers = value.filter((id) => !builtinIds.includes(id));

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

      {BUILTIN_SERVERS.map((opt) => {
        const checked = value.includes(opt.id);
        // Filesystem and AIO get a scope picker when checked
        const showScope =
          checked && (opt.id === "filesystem" || opt.id === "aio");
        const scope =
          opt.id === "filesystem"
            ? permissions?.filesystem ?? "rw"
            : permissions?.aio ?? "rw";
        const scopeKey = opt.id === "filesystem" ? "filesystem" : "aio";

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
                {opt.badge === "official" && (
                  <span style={{
                    display: "inline-block",
                    marginLeft: 6,
                    fontSize: 9,
                    fontWeight: 700,
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    background: "rgba(57,178,85,0.15)",
                    color: "var(--tt-green)",
                    border: "1px solid var(--tt-green)",
                    borderRadius: 4,
                    padding: "1px 5px",
                    verticalAlign: "middle",
                  }}>official</span>
                )}
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
                {opt.id === "aio" ? (
                  ([
                    { id: "ro", label: "Read-only", color: "var(--amber)" },
                    { id: "rw", label: "Read + Write", color: "var(--tt-green)" },
                  ] as const).map((mode) => {
                    const active = scope === mode.id;
                    return (
                      <button
                        key={mode.id}
                        type="button"
                        onClick={() =>
                          onPermissionsChange({ ...permissions, aio: mode.id })
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
                  })
                ) : (
                  ([
                    { id: "ro", label: "Read-only", color: "var(--amber)" },
                    { id: "rw", label: "Read + Write", color: "var(--tt-green)" },
                  ] as const).map((mode) => {
                    const active = scope === mode.id;
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
                  })
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Custom server inputs */}
      {customServers.map((id) => (
        <div
          key={id}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "4px 0",
          }}
        >
          <span
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: "var(--tt-green)",
              background: "var(--app-card)",
              border: "1px solid var(--app-border)",
              borderRadius: 6,
              padding: "2px 8px",
            }}
          >
            {id}
          </span>
          <button
            type="button"
            onClick={() => onToggle(id)}
            style={{
              background: "none",
              border: "none",
              color: "var(--app-fg-3)",
              cursor: "pointer",
              fontSize: 14,
              padding: "0 4px",
            }}
            title="Remove custom server"
          >
            ×
          </button>
        </div>
      ))}

      {/* Add custom MCP server */}
      <CustomMcpAdder
        onAdd={(id) => {
          onToggle(id); // adds to mcpServers
        }}
        takenIds={value}
      />

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

// ── Custom MCP server adder ─────────────────────────────────────────────────

function CustomMcpAdder({
  onAdd,
  takenIds,
}: {
  onAdd: (id: string) => void;
  takenIds: string[];
}) {
  const [open, setOpen] = useState(false);
  const [inputId, setInputId] = useState("");
  const [error, setError] = useState("");

  const submit = () => {
    const id = inputId.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "-");
    if (!id) {
      setError("Voer een naam in");
      return;
    }
    if (takenIds.includes(id)) {
      setError("Deze server is al toegevoegd");
      return;
    }
    onAdd(id);
    setInputId("");
    setError("");
    setOpen(false);
  };

  return (
    <div style={{ marginTop: 4 }}>
      {open ? (
        <div
          style={{
            display: "flex",
            gap: 6,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <input
            type="text"
            value={inputId}
            onChange={(e) => {
              setInputId(e.target.value);
              setError("");
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
              if (e.key === "Escape") {
                setOpen(false);
                setInputId("");
                setError("");
              }
            }}
            placeholder="my-custom-server"
            style={{
              flex: 1,
              minWidth: 140,
              padding: "4px 8px",
              fontSize: 12,
              border: "1.5px solid var(--app-border)",
              borderRadius: 6,
              background: "var(--app-card)",
              color: "var(--app-fg)",
              outline: "none",
            }}
          />
          <button
            type="button"
            onClick={submit}
            style={{
              padding: "4px 10px",
              fontSize: 11,
              fontWeight: 700,
              background: "var(--tt-green)",
              color: "#fff",
              border: "none",
              borderRadius: 6,
              cursor: "pointer",
            }}
          >
            Toevoegen
          </button>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              setInputId("");
              setError("");
            }}
            style={{
              padding: "4px 8px",
              fontSize: 11,
              background: "transparent",
              color: "var(--app-fg-3)",
              border: "none",
              cursor: "pointer",
            }}
          >
            Annuleer
          </button>
          {error && (
            <span style={{ fontSize: 10.5, color: "var(--tt-red)" }}>
              {error}
            </span>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          style={{
            background: "none",
            border: "1.5px dashed var(--app-border-2)",
            borderRadius: 8,
            padding: "5px 10px",
            fontSize: 11.5,
            color: "var(--app-fg-3)",
            cursor: "pointer",
            width: "100%",
            textAlign: "left",
          }}
        >
          + Eigen MCP server toevoegen
        </button>
      )}
    </div>
  );
}
