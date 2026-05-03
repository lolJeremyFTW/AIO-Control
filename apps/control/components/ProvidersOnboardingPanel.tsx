// /[ws]/settings/providers — guided setup for self-hosted providers.
//
// Each provider gets a card with:
//   1. A header explaining what it is + a "what is this?" link.
//   2. A short "How to install" checklist (3-4 steps).
//   3. Endpoint input + "Test connection" + "Save".
//   4. A success badge with timestamp once the test passes.
//
// The whole thing is meant for someone who shouldn't have to read docs
// to wire Hermes / OpenClaw / Ollama up. We tell them exactly what to
// type, where to point it, and confirm visually when it works.

"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

import { OpenIcon } from "@aio/ui/icon";

import {
  saveHermesEndpoint,
  saveOpenClawEndpoint,
  testHermesEndpoint,
  testOpenClawEndpoint,
} from "../app/actions/providers";

type Initial = {
  ollama_host: string | null;
  ollama_port: number | null;
  ollama_models_count: number;
  ollama_last_scan_at: string | null;
  hermes_endpoint: string | null;
  hermes_last_test_at: string | null;
  openclaw_endpoint: string | null;
  openclaw_last_test_at: string | null;
};

type Props = {
  workspaceId: string;
  workspaceSlug: string;
  initial: Initial;
};

export function ProvidersOnboardingPanel({
  workspaceId,
  workspaceSlug,
  initial,
}: Props) {
  return (
    <div style={{ display: "grid", gap: 18 }}>
      <OllamaCard
        workspaceSlug={workspaceSlug}
        host={initial.ollama_host}
        port={initial.ollama_port}
        modelsCount={initial.ollama_models_count}
        lastScanAt={initial.ollama_last_scan_at}
      />
      <HermesCard
        workspaceId={workspaceId}
        workspaceSlug={workspaceSlug}
        initial={initial.hermes_endpoint}
        lastTestAt={initial.hermes_last_test_at}
      />
      <OpenClawCard
        workspaceId={workspaceId}
        workspaceSlug={workspaceSlug}
        initial={initial.openclaw_endpoint}
        lastTestAt={initial.openclaw_last_test_at}
      />
    </div>
  );
}

// ─── Cards ───────────────────────────────────────────────────────────

function OllamaCard({
  workspaceSlug,
  host,
  port,
  modelsCount,
  lastScanAt,
}: {
  workspaceSlug: string;
  host: string | null;
  port: number | null;
  modelsCount: number;
  lastScanAt: string | null;
}) {
  const configured = !!host;
  return (
    <ProviderCard
      title="Ollama"
      tagline="Lokale LLM. Gratis, snel als je een GPU hebt, geen api-keys."
      docsHref="https://ollama.com/download"
      status={
        configured && modelsCount > 0
          ? { kind: "ready", label: `${modelsCount} models beschikbaar` }
          : configured
            ? { kind: "partial", label: "Endpoint ingevuld, nog geen scan" }
            : { kind: "missing", label: "Niet ingesteld" }
      }
      lastTestedAt={lastScanAt}
      steps={[
        "Installeer Ollama op de machine die je modellen draait (laptop, VPS, andere server).",
        "Start Ollama. Default luistert hij op poort 11434.",
        'Pull een model — bijvoorbeeld: ollama pull llama3.2',
        "Vul host + poort in op de Ollama-instellingen page en klik Scan.",
      ]}
    >
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <Link
          href={`/${workspaceSlug}/settings/ollama`}
          style={ctaStyle("primary")}
        >
          <OpenIcon /> Naar Ollama-instellingen
        </Link>
        {host && (
          <span style={{ fontSize: 12, color: "var(--app-fg-3)" }}>
            <code>http://{host}:{port ?? 11434}</code>
          </span>
        )}
      </div>
    </ProviderCard>
  );
}

function HermesCard({
  workspaceId,
  workspaceSlug,
  initial,
  lastTestAt,
}: {
  workspaceId: string;
  workspaceSlug: string;
  initial: string | null;
  lastTestAt: string | null;
}) {
  const [endpoint, setEndpoint] = useState(initial ?? "");
  const [error, setError] = useState<string | null>(null);
  const [tested, setTested] = useState(lastTestAt);
  const [pending, startTransition] = useTransition();

  const onTest = () => {
    setError(null);
    startTransition(async () => {
      const r = await testHermesEndpoint({
        workspace_id: workspaceId,
        workspace_slug: workspaceSlug,
        endpoint: endpoint.trim() || null,
      });
      if (r.ok) {
        setTested(new Date().toISOString());
      } else {
        setError(r.error);
      }
    });
  };
  const onSave = () => {
    setError(null);
    startTransition(async () => {
      const r = await saveHermesEndpoint({
        workspace_id: workspaceId,
        workspace_slug: workspaceSlug,
        endpoint: endpoint.trim() || null,
      });
      if (!r.ok) setError(r.error);
    });
  };

  return (
    <ProviderCard
      title="Hermes-agent"
      tagline="Self-hosted Hermes runner. AIO Control praat met de hermes CLI via subprocess (default) of een HTTP-wrapper als je die zelf draait."
      docsHref="https://github.com/NousResearch/hermes-agent"
      status={
        tested
          ? { kind: "ready", label: "HTTP wrapper getest ✓" }
          : endpoint.trim()
            ? { kind: "partial", label: "URL ingevuld, nog niet getest" }
            : { kind: "missing", label: "CLI default — geen URL nodig" }
      }
      lastTestedAt={tested}
      steps={[
        "Installeer de hermes CLI op deze server: clone github.com/NousResearch/hermes-agent en volg de README (Python entrypoint).",
        "Zorg dat 'hermes --version' werkt vanaf de shell waarin de Node-server draait. Anders: zet HERMES_BIN in de env naar het absolute pad.",
        "Klaar — geen URL invullen nodig. AIO Control spawnt de CLI per chat / run.",
        "Optioneel: draai je een eigen HTTP-wrapper voor Hermes? Plak die URL hieronder en klik Test (verwacht /healthz → 200).",
      ]}
    >
      <EndpointForm
        placeholder="http://192.168.0.42:8080"
        value={endpoint}
        onChange={setEndpoint}
        onTest={onTest}
        onSave={onSave}
        pending={pending}
        error={error}
      />
    </ProviderCard>
  );
}

function OpenClawCard({
  workspaceId,
  workspaceSlug,
  initial,
  lastTestAt,
}: {
  workspaceId: string;
  workspaceSlug: string;
  initial: string | null;
  lastTestAt: string | null;
}) {
  const [endpoint, setEndpoint] = useState(initial ?? "");
  const [error, setError] = useState<string | null>(null);
  const [tested, setTested] = useState(lastTestAt);
  const [pending, startTransition] = useTransition();

  const onTest = () => {
    setError(null);
    startTransition(async () => {
      const r = await testOpenClawEndpoint({
        workspace_id: workspaceId,
        workspace_slug: workspaceSlug,
        endpoint: endpoint.trim() || null,
      });
      if (r.ok) {
        setTested(new Date().toISOString());
      } else {
        setError(r.error);
      }
    });
  };
  const onSave = () => {
    setError(null);
    startTransition(async () => {
      const r = await saveOpenClawEndpoint({
        workspace_id: workspaceId,
        workspace_slug: workspaceSlug,
        endpoint: endpoint.trim() || null,
      });
      if (!r.ok) setError(r.error);
    });
  };

  return (
    <ProviderCard
      title="OpenClaw"
      tagline="Local agent runtime — eigen tools + custom MCP. Spawned als CLI subprocess (default) of via HTTP-wrapper als je die zelf draait."
      docsHref="https://github.com/tromptech/openclaw"
      status={
        tested
          ? { kind: "ready", label: "HTTP wrapper getest ✓" }
          : endpoint.trim()
            ? { kind: "partial", label: "URL ingevuld, nog niet getest" }
            : { kind: "missing", label: "CLI default — geen URL nodig" }
      }
      lastTestedAt={tested}
      steps={[
        "Installeer OpenClaw — npm i -g @tromptech/openclaw, of clone + npm link.",
        "Bevestig dat 'openclaw --version' werkt in de shell waarin Node draait. Anders: zet OPENCLAW_BIN naar het absolute pad.",
        "Klaar — AIO Control spawnt de CLI per chat / run.",
        "Optioneel: draai je openclaw als HTTP-daemon? Plak de URL hieronder en klik Test (verwacht /healthz).",
      ]}
    >
      <EndpointForm
        placeholder="http://localhost:9001"
        value={endpoint}
        onChange={setEndpoint}
        onTest={onTest}
        onSave={onSave}
        pending={pending}
        error={error}
      />
    </ProviderCard>
  );
}

// ─── Generic chrome ───────────────────────────────────────────────────

type Status =
  | { kind: "ready"; label: string }
  | { kind: "partial"; label: string }
  | { kind: "missing"; label: string };

function ProviderCard({
  title,
  tagline,
  docsHref,
  status,
  lastTestedAt,
  steps,
  children,
}: {
  title: string;
  tagline: string;
  docsHref: string;
  status: Status;
  lastTestedAt: string | null;
  steps: string[];
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        border: "1.5px solid var(--app-border-2)",
        borderRadius: 14,
        padding: "18px 20px",
        background: "var(--app-card-2)",
        display: "grid",
        gap: 12,
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr auto",
          alignItems: "start",
          gap: 14,
        }}
      >
        <div>
          <h4
            style={{
              fontFamily: "var(--hand)",
              fontWeight: 700,
              fontSize: 19,
              margin: "0 0 4px",
              letterSpacing: "-0.2px",
            }}
          >
            {title}
          </h4>
          <p
            style={{
              fontSize: 13,
              color: "var(--app-fg-3)",
              margin: 0,
            }}
          >
            {tagline}{" "}
            <a
              href={docsHref}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                color: "var(--tt-green)",
                fontWeight: 700,
                textDecoration: "none",
              }}
            >
              docs ↗
            </a>
          </p>
        </div>
        <StatusPill status={status} />
      </div>

      <details
        style={{
          fontSize: 12.5,
          background: "var(--app-card)",
          border: "1px solid var(--app-border-2)",
          borderRadius: 10,
          padding: "8px 12px",
        }}
      >
        <summary
          style={{
            cursor: "pointer",
            fontWeight: 700,
            color: "var(--app-fg-2)",
          }}
        >
          Hoe installeer ik {title}?
        </summary>
        <ol style={{ margin: "10px 0 4px 18px", lineHeight: 1.6 }}>
          {steps.map((s, i) => (
            <li key={i} style={{ marginBottom: 6 }}>
              {s}
            </li>
          ))}
        </ol>
      </details>

      {children}

      {lastTestedAt && (
        <p
          style={{
            fontSize: 11,
            color: "var(--app-fg-3)",
            margin: 0,
          }}
        >
          Laatst getest {formatRelative(new Date(lastTestedAt))}
        </p>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: Status }) {
  const { color, bg, border } = statusColors(status.kind);
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 700,
        color,
        background: bg,
        border: `1.5px solid ${border}`,
        borderRadius: 999,
        padding: "4px 10px",
        whiteSpace: "nowrap",
        height: "fit-content",
      }}
    >
      {status.label}
    </span>
  );
}

function EndpointForm({
  placeholder,
  value,
  onChange,
  onTest,
  onSave,
  pending,
  error,
}: {
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  onTest: () => void;
  onSave: () => void;
  pending: boolean;
  error: string | null;
}) {
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: "100%",
          padding: "8px 12px",
          borderRadius: 10,
          border: "1.5px solid var(--app-border)",
          background: "var(--app-card)",
          color: "var(--app-fg)",
          fontSize: 13,
          fontFamily: "ui-monospace, Menlo, monospace",
        }}
      />
      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="button"
          onClick={onTest}
          disabled={pending}
          style={ctaStyle("ghost")}
        >
          {pending ? "Testen…" : "Test connection"}
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={pending}
          style={ctaStyle("primary")}
        >
          {pending ? "Opslaan…" : "Opslaan"}
        </button>
      </div>
      {error && (
        <div
          style={{
            background: "rgba(230,82,107,0.1)",
            border: "1.5px solid rgba(230,82,107,0.4)",
            borderRadius: 8,
            padding: "8px 10px",
            color: "var(--rose)",
            fontSize: 12,
          }}
        >
          {error}
        </div>
      )}
    </div>
  );
}

function ctaStyle(kind: "primary" | "ghost"): React.CSSProperties {
  if (kind === "primary") {
    return {
      padding: "8px 14px",
      borderRadius: 10,
      border: "1.5px solid var(--tt-green)",
      background: "var(--tt-green)",
      color: "#fff",
      fontSize: 12.5,
      fontWeight: 700,
      cursor: "pointer",
      textDecoration: "none",
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
    };
  }
  return {
    padding: "8px 14px",
    borderRadius: 10,
    border: "1.5px solid var(--app-border)",
    background: "transparent",
    color: "var(--app-fg)",
    fontSize: 12.5,
    fontWeight: 700,
    cursor: "pointer",
  };
}

function statusColors(kind: Status["kind"]) {
  switch (kind) {
    case "ready":
      return {
        color: "var(--tt-green)",
        bg: "rgba(57,178,85,0.12)",
        border: "rgba(57,178,85,0.45)",
      };
    case "partial":
      return {
        color: "#a3741a",
        bg: "rgba(230,180,80,0.16)",
        border: "rgba(230,180,80,0.45)",
      };
    case "missing":
    default:
      return {
        color: "var(--app-fg-3)",
        bg: "var(--app-card)",
        border: "var(--app-border-2)",
      };
  }
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
