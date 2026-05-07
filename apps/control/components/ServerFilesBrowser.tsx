"use client";

import { useEffect, useMemo, useState } from "react";

import { ExternalLinkIcon, FolderIcon, OpenIcon, RefreshIcon } from "@aio/ui/icon";

type FileEntry = {
  name: string;
  path: string;
  type: "directory" | "file" | "symlink" | "other";
  size: number | null;
  modifiedAt: string | null;
  readable: boolean;
};

type DirectoryResponse = {
  root: string;
  path: string;
  parent: string | null;
  entries: FileEntry[];
  previewLimitBytes: number;
};

type PreviewResponse = {
  path: string;
  size: number;
  modifiedAt: string;
  content: string;
};

function formatBytes(size: number | null) {
  if (size === null) return "-";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  if (size < 1024 * 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`;
  return `${(size / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

function formatDate(value: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("nl-NL", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function pathParts(pathname: string) {
  if (pathname === "/") return [{ label: "/", path: "/" }];
  const parts = pathname.split("/").filter(Boolean);
  return [
    { label: "/", path: "/" },
    ...parts.map((part, index) => ({
      label: part,
      path: `/${parts.slice(0, index + 1).join("/")}`,
    })),
  ];
}

export function ServerFilesBrowser() {
  const [currentPath, setCurrentPath] = useState("/");
  const [typedPath, setTypedPath] = useState("/");
  const [directory, setDirectory] = useState<DirectoryResponse | null>(null);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const breadcrumbs = useMemo(
    () => pathParts(directory?.path ?? currentPath),
    [directory?.path, currentPath],
  );

  async function loadDirectory(pathname = currentPath) {
    setLoading(true);
    setError(null);
    setPreview(null);
    try {
      const res = await fetch(
        `/api/admin/files?mode=list&path=${encodeURIComponent(pathname)}`,
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Kon map niet laden");
      setDirectory(json);
      setCurrentPath(json.path);
      setTypedPath(json.path);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Onbekende fout");
    } finally {
      setLoading(false);
    }
  }

  async function loadPreview(pathname: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/files?mode=read&path=${encodeURIComponent(pathname)}`,
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Kon bestand niet openen");
      setPreview(json);
    } catch (err) {
      setPreview(null);
      setError(err instanceof Error ? err.message : "Onbekende fout");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadDirectory("/");
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr auto auto",
          gap: 10,
          alignItems: "center",
        }}
      >
        <input
          value={typedPath}
          onChange={(e) => setTypedPath(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void loadDirectory(typedPath);
          }}
          aria-label="Pad"
          style={{
            border: "1.5px solid var(--app-border)",
            borderRadius: 10,
            background: "var(--app-card-2)",
            color: "var(--app-fg)",
            padding: "10px 12px",
            fontFamily: "var(--mono)",
            fontSize: 12,
          }}
        />
        <button type="button" onClick={() => void loadDirectory(typedPath)} style={buttonStyle}>
          <OpenIcon /> Open
        </button>
        <button type="button" onClick={() => void loadDirectory()} style={iconButtonStyle} title="Verversen">
          <RefreshIcon />
        </button>
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        {breadcrumbs.map((crumb, index) => (
          <button
            key={crumb.path}
            type="button"
            onClick={() => void loadDirectory(crumb.path)}
            style={{
              border: 0,
              background: "transparent",
              color: index === breadcrumbs.length - 1 ? "var(--app-fg)" : "var(--app-fg-3)",
              fontFamily: "var(--mono)",
              fontSize: 12,
              cursor: "pointer",
              padding: "2px 0",
            }}
          >
            {index > 0 ? "/ " : ""}
            {crumb.label}
          </button>
        ))}
      </div>

      {directory && (
        <div style={{ fontSize: 12, color: "var(--app-fg-3)" }}>
          Root: <code>{directory.root}</code> - preview tot {formatBytes(directory.previewLimitBytes)}
        </div>
      )}

      {error && (
        <div
          style={{
            border: "1.5px solid var(--rose)",
            color: "var(--rose)",
            borderRadius: 10,
            padding: "10px 12px",
            fontSize: 13,
            fontWeight: 700,
          }}
        >
          {error}
        </div>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))",
          gap: 16,
          alignItems: "start",
        }}
      >
        <div style={{ border: "1px solid var(--app-border-2)", borderRadius: 12, overflow: "auto" }}>
          {directory?.parent && (
            <button type="button" onClick={() => void loadDirectory(directory.parent!)} style={rowButtonStyle}>
              <span style={nameCellStyle}>..</span>
              <span style={metaCellStyle}>map omhoog</span>
              <span />
            </button>
          )}
          {directory?.entries.map((entry) => (
            <button
              key={entry.path}
              type="button"
              onClick={() =>
                entry.type === "directory"
                  ? void loadDirectory(entry.path)
                  : void loadPreview(entry.path)
              }
              disabled={!entry.readable}
              style={{
                ...rowButtonStyle,
                opacity: entry.readable ? 1 : 0.5,
                cursor: entry.readable ? "pointer" : "not-allowed",
              }}
            >
              <span style={nameCellStyle}>
                {entry.type === "directory" ? <FolderIcon size={15} /> : <span style={{ width: 15 }}>-</span>}
                <span title={entry.name} style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {entry.name}
                </span>
              </span>
              <span style={metaCellStyle}>{entry.type}</span>
              <span style={metaCellStyle}>{formatBytes(entry.size)}</span>
              <span style={metaCellStyle}>{formatDate(entry.modifiedAt)}</span>
            </button>
          ))}
          {loading && <div style={{ padding: 14, fontSize: 13 }}>Laden...</div>}
        </div>

        <div
          style={{
            border: "1px solid var(--app-border-2)",
            borderRadius: 12,
            minHeight: 360,
            overflow: "hidden",
            background: "var(--app-card-2)",
          }}
        >
          {preview ? (
            <>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  padding: "10px 12px",
                  borderBottom: "1px solid var(--app-border-2)",
                  alignItems: "center",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontFamily: "var(--mono)", fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {preview.path}
                  </div>
                  <div style={{ color: "var(--app-fg-3)", fontSize: 11 }}>
                    {formatBytes(preview.size)} - {formatDate(preview.modifiedAt)}
                  </div>
                </div>
                <a
                  href={`/api/admin/files?mode=download&path=${encodeURIComponent(preview.path)}`}
                  style={{ ...buttonStyle, textDecoration: "none" }}
                >
                  <ExternalLinkIcon /> Download
                </a>
              </div>
              <pre
                style={{
                  margin: 0,
                  padding: 14,
                  overflow: "auto",
                  maxHeight: 620,
                  fontFamily: "var(--mono)",
                  fontSize: 12,
                  lineHeight: 1.55,
                  whiteSpace: "pre-wrap",
                }}
              >
                {preview.content}
              </pre>
            </>
          ) : (
            <div style={{ padding: 18, color: "var(--app-fg-3)", fontSize: 13 }}>
              Selecteer een tekstbestand om de inhoud hier te bekijken.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const buttonStyle = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  padding: "9px 12px",
  border: "1.5px solid var(--app-border)",
  background: "var(--app-card)",
  color: "var(--app-fg)",
  borderRadius: 10,
  fontWeight: 800,
  fontSize: 12,
  cursor: "pointer",
} as const;

const iconButtonStyle = {
  ...buttonStyle,
  width: 40,
  padding: 9,
} as const;

const rowButtonStyle = {
  width: "100%",
  display: "grid",
  gridTemplateColumns: "minmax(160px, 1fr) 86px 84px 126px",
  gap: 10,
  alignItems: "center",
  textAlign: "left",
  border: 0,
  borderBottom: "1px solid var(--app-border-2)",
  background: "transparent",
  color: "var(--app-fg)",
  padding: "10px 12px",
} as const;

const nameCellStyle = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  minWidth: 0,
  fontWeight: 700,
  fontSize: 12.5,
} as const;

const metaCellStyle = {
  color: "var(--app-fg-3)",
  fontSize: 11,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
} as const;
