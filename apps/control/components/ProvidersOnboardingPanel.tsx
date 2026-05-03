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
  setRuntimeAgentName,
  testHermesEndpoint,
  testOpenClawEndpoint,
  verifyRuntimeAgent,
} from "../app/actions/providers";
import { translate, type Locale } from "../lib/i18n/dict";
import { useLocale } from "../lib/i18n/client";
import {
  defaultRuntimeAgentName,
  runtimeInstallCommand,
  type RuntimeAgentProvider,
} from "../lib/providers/runtime";

type Tr = (
  key: string,
  vars?: Record<string, string | number>,
) => string;

type Initial = {
  ollama_host: string | null;
  ollama_port: number | null;
  ollama_models_count: number;
  ollama_last_scan_at: string | null;
  hermes_endpoint: string | null;
  hermes_last_test_at: string | null;
  hermes_agent_name: string | null;
  hermes_agent_initialized_at: string | null;
  openclaw_endpoint: string | null;
  openclaw_last_test_at: string | null;
  openclaw_agent_name: string | null;
  openclaw_agent_initialized_at: string | null;
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
  const locale: Locale = useLocale();
  const t: Tr = (key, vars) => translate(locale, key, vars);
  return (
    <div style={{ display: "grid", gap: 18 }}>
      <OllamaCard
        t={t}
        workspaceSlug={workspaceSlug}
        host={initial.ollama_host}
        port={initial.ollama_port}
        modelsCount={initial.ollama_models_count}
        lastScanAt={initial.ollama_last_scan_at}
      />
      <HermesCard
        t={t}
        workspaceId={workspaceId}
        workspaceSlug={workspaceSlug}
        initial={initial.hermes_endpoint}
        lastTestAt={initial.hermes_last_test_at}
        agentName={initial.hermes_agent_name}
        agentInitializedAt={initial.hermes_agent_initialized_at}
      />
      <OpenClawCard
        t={t}
        workspaceId={workspaceId}
        workspaceSlug={workspaceSlug}
        initial={initial.openclaw_endpoint}
        lastTestAt={initial.openclaw_last_test_at}
        agentName={initial.openclaw_agent_name}
        agentInitializedAt={initial.openclaw_agent_initialized_at}
      />
    </div>
  );
}

// ─── Cards ───────────────────────────────────────────────────────────

function OllamaCard({
  t,
  workspaceSlug,
  host,
  port,
  modelsCount,
  lastScanAt,
}: {
  t: Tr;
  workspaceSlug: string;
  host: string | null;
  port: number | null;
  modelsCount: number;
  lastScanAt: string | null;
}) {
  const configured = !!host;
  return (
    <ProviderCard
      t={t}
      title="Ollama"
      tagline={t("providers.ollama.tagline")}
      docsHref="https://ollama.com/download"
      status={
        configured && modelsCount > 0
          ? {
              kind: "ready",
              label: t("providers.ollama.modelsAvailable", {
                count: modelsCount,
              }),
            }
          : configured
            ? { kind: "partial", label: t("providers.status.partial.scan") }
            : { kind: "missing", label: t("providers.status.notConfigured") }
      }
      lastTestedAt={lastScanAt}
      steps={[
        t("providers.ollama.step1"),
        t("providers.ollama.step2"),
        t("providers.ollama.step3"),
        t("providers.ollama.step4"),
      ]}
    >
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <Link
          href={`/${workspaceSlug}/settings/ollama`}
          style={ctaStyle("primary")}
        >
          <OpenIcon /> {t("providers.ollama.gotoSettings")}
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
  t,
  workspaceId,
  workspaceSlug,
  initial,
  lastTestAt,
  agentName,
  agentInitializedAt,
}: {
  t: Tr;
  workspaceId: string;
  workspaceSlug: string;
  initial: string | null;
  lastTestAt: string | null;
  agentName: string | null;
  agentInitializedAt: string | null;
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
      t={t}
      title="Hermes-agent"
      tagline={t("providers.hermes.tagline")}
      docsHref="https://github.com/NousResearch/hermes-agent"
      status={
        agentInitializedAt
          ? {
              kind: "ready",
              label: t("providers.status.runtimeReady", {
                name: agentName ?? "?",
              }),
            }
          : tested
            ? endpoint.trim()
              ? { kind: "ready", label: t("providers.status.httpReady") }
              : { kind: "ready", label: t("providers.status.cliReady") }
            : endpoint.trim()
              ? { kind: "partial", label: t("providers.status.partial.url") }
              : { kind: "partial", label: t("providers.status.partial.cli") }
      }
      lastTestedAt={tested}
      steps={[
        t("providers.hermes.step1"),
        t("providers.hermes.step2"),
        t("providers.hermes.step3"),
        t("providers.hermes.step4"),
      ]}
    >
      <EndpointForm
        t={t}
        placeholder="http://192.168.0.42:8080"
        value={endpoint}
        onChange={setEndpoint}
        onTest={onTest}
        onSave={onSave}
        pending={pending}
        error={error}
      />
      <RuntimeAgentSection
        t={t}
        provider="hermes"
        workspaceId={workspaceId}
        workspaceSlug={workspaceSlug}
        agentName={agentName}
        agentInitializedAt={agentInitializedAt}
      />
    </ProviderCard>
  );
}

function OpenClawCard({
  t,
  workspaceId,
  workspaceSlug,
  initial,
  lastTestAt,
  agentName,
  agentInitializedAt,
}: {
  t: Tr;
  workspaceId: string;
  workspaceSlug: string;
  initial: string | null;
  lastTestAt: string | null;
  agentName: string | null;
  agentInitializedAt: string | null;
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
      t={t}
      title="OpenClaw"
      tagline={t("providers.openclaw.tagline")}
      docsHref="https://github.com/tromptech/openclaw"
      status={
        agentInitializedAt
          ? {
              kind: "ready",
              label: t("providers.status.runtimeReady", {
                name: agentName ?? "?",
              }),
            }
          : tested
            ? endpoint.trim()
              ? { kind: "ready", label: t("providers.status.httpReady") }
              : { kind: "ready", label: t("providers.status.cliReady") }
            : endpoint.trim()
              ? { kind: "partial", label: t("providers.status.partial.url") }
              : { kind: "partial", label: t("providers.status.partial.cli") }
      }
      lastTestedAt={tested}
      steps={[
        t("providers.openclaw.step1"),
        t("providers.openclaw.step2"),
        t("providers.openclaw.step3"),
        t("providers.openclaw.step4"),
      ]}
    >
      <EndpointForm
        t={t}
        placeholder="http://localhost:9001"
        value={endpoint}
        onChange={setEndpoint}
        onTest={onTest}
        onSave={onSave}
        pending={pending}
        error={error}
      />
      <RuntimeAgentSection
        t={t}
        provider="openclaw"
        workspaceId={workspaceId}
        workspaceSlug={workspaceSlug}
        agentName={agentName}
        agentInitializedAt={agentInitializedAt}
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
  t,
  title,
  tagline,
  docsHref,
  status,
  lastTestedAt,
  steps,
  children,
}: {
  t: Tr;
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
              {t("providers.docs")}
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
          {t("providers.howInstall", { name: title })}
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
          {t("providers.lastTested", {
            when: formatRelative(new Date(lastTestedAt), t),
          })}
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
  t,
  placeholder,
  value,
  onChange,
  onTest,
  onSave,
  pending,
  error,
}: {
  t: Tr;
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
          {pending ? t("providers.btn.testing") : t("providers.btn.test")}
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={pending}
          style={ctaStyle("primary")}
        >
          {pending ? t("providers.btn.saving") : t("providers.btn.save")}
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

function formatRelative(d: Date, t: Tr): string {
  const ms = Date.now() - d.getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return t("rel.s", { n: s });
  const m = Math.floor(s / 60);
  if (m < 60) return t("rel.m", { n: m });
  const h = Math.floor(m / 60);
  if (h < 24) return t("rel.h", { n: h });
  return t("rel.d", { n: Math.floor(h / 24) });
}

/** Onboarding sub-section for the named persistent profile/agent.
 *  Lives inside Hermes + OpenClaw cards. Steps:
 *    1. Pick a name (default `aio-<workspaceSlug>`).
 *    2. Save → `setRuntimeAgentName` writes to workspaces row.
 *    3. Copy the install command + run on the runtime host.
 *    4. Verify → `verifyRuntimeAgent` shells `<runtime> agents/profile
 *       list`, greps the name, stamps initialized_at on success.
 *  After step 4 the parent ProviderCard's status pill flips to
 *  "Runtime ready · <name>" and the providers/<runtime>.ts spawner
 *  starts using the named-profile path automatically. */
function RuntimeAgentSection({
  t,
  provider,
  workspaceId,
  workspaceSlug,
  agentName,
  agentInitializedAt,
}: {
  t: Tr;
  provider: RuntimeAgentProvider;
  workspaceId: string;
  workspaceSlug: string;
  agentName: string | null;
  agentInitializedAt: string | null;
}) {
  const [name, setName] = useState(
    agentName ?? defaultRuntimeAgentName(workspaceSlug),
  );
  const [savedName, setSavedName] = useState(agentName ?? null);
  const [initializedAt, setInitializedAt] = useState(agentInitializedAt);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  const installCmd = runtimeInstallCommand(provider, name);

  const onSaveName = () =>
    startTransition(async () => {
      setError(null);
      setInfo(null);
      const r = await setRuntimeAgentName({
        workspace_id: workspaceId,
        workspace_slug: workspaceSlug,
        provider,
        name,
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setSavedName(name.trim().toLowerCase());
      setInitializedAt(null);
      setInfo(t("providers.runtime.savedNotice"));
    });

  const onVerify = () =>
    startTransition(async () => {
      setError(null);
      setInfo(null);
      const r = await verifyRuntimeAgent({
        workspace_id: workspaceId,
        workspace_slug: workspaceSlug,
        provider,
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setInitializedAt(new Date().toISOString());
      setInfo(t("providers.runtime.verifiedNotice", { name: r.data.name }));
    });

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(installCmd);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Some browsers/embeds block clipboard outside HTTPS — show
      // a fallback so the user still has the text.
      setError(t("providers.runtime.copyFailed"));
    }
  };

  const dirty = savedName !== name.trim().toLowerCase();

  return (
    <details
      style={{
        marginTop: 8,
        background: "var(--app-card-2)",
        border: "1px solid var(--app-border-2)",
        borderRadius: 10,
        padding: "10px 12px",
      }}
      open={!initializedAt}
    >
      <summary
        style={{
          cursor: "pointer",
          fontWeight: 700,
          fontSize: 12.5,
          color: "var(--app-fg-2)",
        }}
      >
        {t("providers.runtime.title")}
      </summary>

      <p
        style={{
          fontSize: 11.5,
          color: "var(--app-fg-3)",
          margin: "8px 0 10px",
          lineHeight: 1.5,
        }}
      >
        {t("providers.runtime.desc")}
      </p>

      <div style={{ display: "grid", gap: 10 }}>
        <label
          style={{ display: "block", fontSize: 11, fontWeight: 600 }}
        >
          <span
            style={{
              display: "block",
              marginBottom: 4,
              color: "var(--app-fg-2)",
            }}
          >
            {t("providers.runtime.nameLabel")}
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              type="text"
              value={name}
              onChange={(e) =>
                setName(
                  e.target.value
                    .toLowerCase()
                    .replace(/[^a-z0-9_-]/g, "-"),
                )
              }
              placeholder={defaultRuntimeAgentName(workspaceSlug)}
              style={{
                flex: 1,
                padding: "6px 10px",
                borderRadius: 8,
                border: "1.5px solid var(--app-border)",
                background: "var(--app-card)",
                color: "var(--app-fg)",
                fontSize: 13,
                fontFamily: "ui-monospace, Menlo, monospace",
              }}
              autoComplete="off"
            />
            <button
              type="button"
              onClick={onSaveName}
              disabled={pending || !dirty}
              style={ctaStyle("ghost")}
            >
              {pending ? t("common.busy") : t("common.save")}
            </button>
          </div>
        </label>

        <div>
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: "var(--app-fg-2)",
              marginBottom: 4,
            }}
          >
            {t("providers.runtime.cmdLabel")}
          </div>
          <div
            style={{
              display: "flex",
              gap: 8,
              alignItems: "stretch",
            }}
          >
            <code
              style={{
                flex: 1,
                padding: "8px 10px",
                background: "var(--app-card)",
                border: "1.5px solid var(--app-border)",
                borderRadius: 8,
                fontSize: 12,
                fontFamily: "ui-monospace, Menlo, monospace",
                color: "var(--app-fg)",
                overflowX: "auto",
                whiteSpace: "nowrap",
              }}
            >
              {installCmd}
            </code>
            <button
              type="button"
              onClick={onCopy}
              style={ctaStyle("ghost")}
            >
              {copied ? t("providers.runtime.copied") : t("providers.runtime.copy")}
            </button>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={onVerify}
            disabled={pending || !savedName}
            style={ctaStyle("primary")}
          >
            {pending ? t("common.busy") : t("providers.runtime.verify")}
          </button>
          {initializedAt && (
            <span
              style={{
                fontSize: 11,
                color: "var(--tt-green)",
                alignSelf: "center",
              }}
            >
              {t("providers.runtime.initializedAgo", {
                when: formatRelative(new Date(initializedAt), t),
              })}
            </span>
          )}
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
        {info && !error && (
          <div
            style={{
              fontSize: 12,
              color: "var(--tt-green)",
            }}
          >
            {info}
          </div>
        )}
      </div>
    </details>
  );
}
