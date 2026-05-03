// Settings panel: pick the host + port for the workspace's local
// Ollama server, scan it for models, save the result. Once saved every
// Ollama-backed agent in the workspace points at this endpoint via the
// router resolver.
//
// Surfaces in the right-hand stack on /[ws]/settings — the same UI
// shape as the other panels (input rows + a "Save" / "Scan" button
// pair). Optimistic-feeling: the scan button shows the model list
// inline before persisting.

"use client";

import { useState, useTransition } from "react";

import {
  saveOllamaEndpoint,
  scanOllamaModels,
  type OllamaModel,
} from "../app/actions/ollama";

export type OllamaInitial = {
  host: string | null;
  port: number | null;
  models: OllamaModel[];
  lastScanAt: string | null;
};

type Props = {
  workspaceId: string;
  workspaceSlug: string;
  initial: OllamaInitial;
};

export function OllamaPanel({ workspaceId, workspaceSlug, initial }: Props) {
  const [host, setHost] = useState(initial.host ?? "");
  const [port, setPort] = useState<string>(
    initial.port ? String(initial.port) : "11434",
  );
  const [models, setModels] = useState<OllamaModel[]>(initial.models);
  const [lastScanAt, setLastScanAt] = useState(initial.lastScanAt);
  const [resolvedEndpoint, setResolvedEndpoint] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [scanPending, startScan] = useTransition();
  const [savePending, startSave] = useTransition();

  const portNum = port.trim() ? Number(port) : null;

  const onScan = () => {
    setError(null);
    startScan(async () => {
      const res = await scanOllamaModels({
        workspace_id: workspaceId,
        workspace_slug: workspaceSlug,
        host: host.trim() || null,
        port: portNum,
      });
      if (res.ok) {
        setModels(res.data.models);
        setResolvedEndpoint(res.data.endpoint);
        setLastScanAt(new Date().toISOString());
      } else {
        setError(res.error);
      }
    });
  };

  const onSave = () => {
    setError(null);
    startSave(async () => {
      const res = await saveOllamaEndpoint({
        workspace_id: workspaceId,
        workspace_slug: workspaceSlug,
        host: host.trim() || null,
        port: portNum,
      });
      if (res.ok) {
        setSavedAt(Date.now());
        setTimeout(() => setSavedAt(null), 2000);
      } else {
        setError(res.error);
      }
    });
  };

  const friendlyTime = lastScanAt
    ? formatRelative(new Date(lastScanAt))
    : null;

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 120px",
          gap: 10,
        }}
      >
        <div>
          <label
            style={{
              display: "block",
              fontSize: 12,
              fontWeight: 700,
              color: "var(--app-fg-3)",
              marginBottom: 4,
              textTransform: "uppercase",
              letterSpacing: 0.4,
            }}
          >
            Host
          </label>
          <input
            type="text"
            placeholder="localhost · 192.168.0.42 · vps.tail-scale.ts.net"
            value={host}
            onChange={(e) => setHost(e.target.value)}
            style={inputStyle}
          />
        </div>
        <div>
          <label
            style={{
              display: "block",
              fontSize: 12,
              fontWeight: 700,
              color: "var(--app-fg-3)",
              marginBottom: 4,
              textTransform: "uppercase",
              letterSpacing: 0.4,
            }}
          >
            Poort
          </label>
          <input
            type="number"
            placeholder="11434"
            value={port}
            onChange={(e) => setPort(e.target.value)}
            style={inputStyle}
          />
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button
          type="button"
          onClick={onScan}
          disabled={scanPending}
          style={{
            ...buttonStyle,
            background: "var(--app-card-2)",
            border: "1.5px solid var(--app-border)",
            color: "var(--app-fg)",
          }}
        >
          {scanPending ? "Scannen…" : "Scan models"}
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={savePending}
          style={{
            ...buttonStyle,
            background: "var(--tt-green)",
            border: "1.5px solid var(--tt-green)",
            color: "#fff",
          }}
        >
          {savePending ? "Opslaan…" : "Opslaan"}
        </button>
        {savedAt && (
          <span style={{ fontSize: 12, color: "var(--tt-green)" }}>
            ✓ Opgeslagen
          </span>
        )}
      </div>

      {error && (
        <div
          style={{
            background: "rgba(230,82,107,0.1)",
            border: "1.5px solid rgba(230,82,107,0.4)",
            borderRadius: 10,
            padding: "10px 12px",
            color: "var(--rose)",
            fontSize: 13,
          }}
        >
          {error}
        </div>
      )}

      {(resolvedEndpoint || friendlyTime) && (
        <p style={{ fontSize: 12, color: "var(--app-fg-3)", margin: 0 }}>
          {resolvedEndpoint && <>Endpoint: <code>{resolvedEndpoint}</code> · </>}
          {friendlyTime && <>laatst gescand {friendlyTime}</>}
        </p>
      )}

      {models.length > 0 ? (
        <div
          style={{
            border: "1.5px solid var(--app-border-2)",
            borderRadius: 12,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              padding: "8px 12px",
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: 0.4,
              textTransform: "uppercase",
              color: "var(--app-fg-3)",
              borderBottom: "1px solid var(--app-border-2)",
              background: "var(--app-card-2)",
            }}
          >
            {models.length} model{models.length === 1 ? "" : "s"} beschikbaar
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {models.map((m) => (
              <div
                key={m.name}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr auto",
                  gap: 12,
                  padding: "8px 12px",
                  borderBottom: "1px solid var(--app-border-2)",
                  fontSize: 13,
                }}
              >
                <span style={{ fontWeight: 600 }}>
                  {m.name}
                  {m.parameter_size && (
                    <span
                      style={{
                        marginLeft: 8,
                        fontSize: 11,
                        color: "var(--app-fg-3)",
                      }}
                    >
                      {m.parameter_size}
                    </span>
                  )}
                </span>
                <span style={{ fontSize: 12, color: "var(--app-fg-3)" }}>
                  {fmtSize(m.size)}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p
          style={{
            fontSize: 12,
            color: "var(--app-fg-3)",
            margin: 0,
            fontStyle: "italic",
          }}
        >
          Nog geen models gescand. Vul host + poort in en klik &quot;Scan
          models&quot;.
        </p>
      )}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 12px",
  borderRadius: 10,
  border: "1.5px solid var(--app-border)",
  background: "var(--app-card-2)",
  color: "var(--app-fg)",
  fontSize: 13,
};

const buttonStyle: React.CSSProperties = {
  padding: "8px 14px",
  borderRadius: 10,
  fontSize: 12.5,
  fontWeight: 700,
  cursor: "pointer",
};

function fmtSize(bytes: number): string {
  if (!bytes) return "—";
  const gb = bytes / 1024 ** 3;
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  const mb = bytes / 1024 ** 2;
  return `${mb.toFixed(0)} MB`;
}

function formatRelative(d: Date): string {
  const ms = Date.now() - d.getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s geleden`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m geleden`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}u geleden`;
  return `${Math.floor(h / 24)}d geleden`;
}
