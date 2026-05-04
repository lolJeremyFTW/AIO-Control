// /[ws]/settings/providers — guided setup for self-hosted + cloud providers.
//
// Cloud providers follow an "add-flow": start empty, pick a provider,
// paste key, test, then save. Self-hosted (Ollama, Hermes, OpenClaw)
// keep their own cards with endpoint + test-and-save.

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
import {
  saveCloudProviderKey,
  testCloudProviderKey,
} from "../app/actions/cloud-providers";
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
  /** Provider names that already have a workspace-scoped key set. */
  cloudKeysSet?: string[];
};

export function ProvidersOnboardingPanel({
  workspaceId,
  workspaceSlug,
  initial,
  cloudKeysSet = [],
}: Props) {
  const locale: Locale = useLocale();
  const t: Tr = (key, vars) => translate(locale, key, vars);

  const hasCloudProviders = cloudKeysSet.length > 0;
  const [addFlowOpen, setAddFlowOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const handleProviderAdded = () => {
    setAddFlowOpen(false);
    setRefreshKey((k) => k + 1);
  };

  return (
    <div style={{ display: "grid", gap: 18 }} key={refreshKey}>
      {/* ── Cloud / API providers ─────────────────────────────────── */}
      {!addFlowOpen ? (
        hasCloudProviders ? (
          <ConfiguredProvidersList
            configured={cloudKeysSet}
            onAddProvider={() => setAddFlowOpen(true)}
          />
        ) : (
          <CloudProvidersEmptyState onAddProvider={() => setAddFlowOpen(true)} />
        )
      ) : (
        <CloudProvidersAddFlow
          workspaceSlug={workspaceSlug}
          workspaceId={workspaceId}
          onComplete={handleProviderAdded}
          onCancel={() => setAddFlowOpen(false)}
        />
      )}

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

// ─── Cloud provider spec ─────────────────────────────────────────────

type CloudProviderSpec = {
  provider: string;
  label: string;
  tagline: string;
  signupUrl: string;
  keyUrl?: string;
  hint?: string;
  /** Fields needed beyond just the API key (e.g. Azure resource name). */
  extraFields?: { name: string; label: string; placeholder: string; hint?: string }[];
  /** How to format the full credential value for this provider. */
  formatCredential?: (key: string, extras: Record<string, string>) => string;
};

const CLOUD_PROVIDERS: CloudProviderSpec[] = [
  {
    provider: "openrouter",
    label: "OpenRouter",
    tagline:
      "Een key, 200+ modellen. Goedkoopste route om met meerdere LLMs te experimenteren.",
    signupUrl: "https://openrouter.ai/",
    keyUrl: "https://openrouter.ai/keys",
    hint: "sk-or-v1-…",
  },
  {
    provider: "anthropic",
    label: "Anthropic (Claude API)",
    tagline:
      "Claude direct via Anthropic. Beste kwaliteit voor Sonnet en Opus runs.",
    signupUrl: "https://console.anthropic.com/",
    keyUrl: "https://console.anthropic.com/settings/keys",
    hint: "sk-ant-…",
  },
  {
    provider: "openai",
    label: "OpenAI",
    tagline: "GPT-4o, o1 en o3 via OpenAI's API.",
    signupUrl: "https://platform.openai.com/",
    keyUrl: "https://platform.openai.com/api-keys",
    hint: "sk-…",
  },
  {
    provider: "minimax",
    label: "MiniMax",
    tagline:
      "MiniMax-M2.7 met native MCP-tools voor web search en code.",
    signupUrl: "https://platform.minimax.io/",
    keyUrl: "https://platform.minimax.io/account-management/keys",
    hint: "sk-cp-…",
  },
  {
    provider: "google_gemini",
    label: "Google Gemini",
    tagline: "Gemini 2.5 via Google AI Studio. Goedkoop voor high-volume taken.",
    signupUrl: "https://aistudio.google.com/",
    keyUrl: "https://aistudio.google.com/app/apikey",
    hint: "AIza…",
  },
  {
    provider: "deepseek",
    label: "DeepSeek",
    tagline:
      "DeepSeek-V3 en R1. Extreem goedkoop voor reasoning workloads.",
    signupUrl: "https://platform.deepseek.com/",
    keyUrl: "https://platform.deepseek.com/api_keys",
    hint: "sk-…",
  },
  {
    provider: "xai",
    label: "xAI (Grok)",
    tagline: "Grok 4 met lange context windows en Twitter-integratie.",
    signupUrl: "https://console.x.ai/",
    keyUrl: "https://console.x.ai/team/default/api-keys",
    hint: "xai-…",
  },
  {
    provider: "groq",
    label: "Groq",
    tagline:
      "Llama en Qwen op Groq's LPU's. Onmisbaar voor sub-second responses.",
    signupUrl: "https://console.groq.com/",
    keyUrl: "https://console.groq.com/keys",
    hint: "gsk_…",
  },
  {
    provider: "mistral",
    label: "Mistral",
    tagline: "Mistral Large en Codestral. Europees, snel en goedkoop.",
    signupUrl: "https://console.mistral.ai/",
    keyUrl: "https://console.mistral.ai/api-keys/",
  },
  {
    provider: "azure_openai",
    label: "Azure OpenAI",
    tagline:
      "OpenAI modellen via Microsoft's Azure cloud. Handig als je al Azure-klant bent.",
    signupUrl: "https://portal.azure.com/",
    hint: "API key",
    extraFields: [
      {
        name: "resource",
        label: "Azure resource naam",
        placeholder: "mijn-bedrijf",
        hint: "De naam uit je Azure Portal, voor het .openai.azure.com endpoint",
      },
    ],
    formatCredential: (key, extras) =>
      extras.resource ? `${extras.resource}:${key}` : key,
  },
  {
    provider: "aws_bedrock",
    label: "AWS Bedrock",
    tagline:
      "Claude en andere modellen via AWS Bedrock. Goed als je al AWS gebruikt.",
    signupUrl: "https://aws.amazon.com/bedrock/",
    hint: "Access Key ID",
    extraFields: [
      {
        name: "region",
        label: "AWS regio",
        placeholder: "us-east-1",
        hint: "De regio waar je Bedrock key geldt",
      },
    ],
    formatCredential: (key, extras) => {
      // Format: accessKeyId:secretAccessKey:region
      // For now we just store what we can validate
      const region = extras.region ?? "us-east-1";
      return `${key}:${region}`;
    },
  },
  {
    provider: "cohere",
    label: "Cohere",
    tagline: "Command R modellen voor RAG en reasoning.",
    signupUrl: "https://cohere.com/",
    keyUrl: "https://dashboard.cohere.com/api-keys",
  },
  {
    provider: "ai21",
    label: "AI21 (Jurassic)",
    tagline: "Jurassic-2 en Jamba modellen.",
    signupUrl: "https://www.ai21.com/",
    keyUrl: "https://studio.ai21.com/account/api-key",
    hint: "AI21-…",
  },
  {
    provider: "huggingface",
    label: "Hugging Face",
    tagline: "Inference API voor duizenden open modellen.",
    signupUrl: "https://huggingface.co/",
    keyUrl: "https://huggingface.co/settings/tokens",
    hint: "hf_…",
  },
  {
    provider: "replicate",
    label: "Replicate",
    tagline: "Run open modellen met één API call.",
    signupUrl: "https://replicate.com/",
    keyUrl: "https://replicate.com/account/api-tokens",
    hint: "r8_…",
  },
  {
    provider: "perplexity",
    label: "Perplexity",
    tagline: "Real-time web search modellen.",
    signupUrl: "https://perplexity.ai/",
    keyUrl: "https://perplexity.ai/settings/api",
    hint: "pplx-…",
  },
  {
    provider: "together_ai",
    label: "Together AI",
    tagline: "Competitief geprijsd voor open modellen.",
    signupUrl: "https://together.ai/",
    keyUrl: "https://together.ai/settings/api",
    hint: "together-…",
  },
  {
    provider: "cloudflare",
    label: "Cloudflare Workers AI",
    tagline: "Modellen aan de edge, wereldwijd snel.",
    signupUrl: "https://.cloudflare.com/",
    hint: "Account ID",
    extraFields: [
      {
        name: "accountId",
        label: "Cloudflare Account ID",
        placeholder: "abc123def456",
        hint: "Te vinden in Cloudflare Dashboard > Overview",
      },
    ],
    formatCredential: (key, extras) =>
      extras.accountId ? `${extras.accountId}:${key}` : key,
  },
  {
    provider: "lepton",
    label: "Lepton AI",
    tagline: "Snelle inference voor open modellen.",
    signupUrl: "https://www.lepton.ai/",
    hint: "API key",
  },
  {
    provider: "elevenlabs",
    label: "ElevenLabs (TTS)",
    tagline: "Voice synthesis voor de TalkModule.",
    signupUrl: "https://elevenlabs.io/",
    keyUrl: "https://elevenlabs.io/app/settings/api-keys",
    hint: "sk_…",
  },
];

// ─── Empty state ─────────────────────────────────────────────────────

function CloudProvidersEmptyState({
  onAddProvider,
}: {
  onAddProvider: () => void;
}) {
  return (
    <div
      style={{
        border: "1.5px dashed var(--app-border)",
        borderRadius: 14,
        padding: "48px 24px",
        textAlign: "center",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 14,
      }}
    >
      <div>
        <p
          style={{
            fontSize: 15,
            fontWeight: 700,
            margin: "0 0 6px",
            color: "var(--app-fg-2)",
          }}
        >
          Geen cloud providers ingesteld.
        </p>
        <p
          style={{
            fontSize: 13,
            color: "var(--app-fg-3)",
            margin: 0,
          }}
        >
          Start met het toevoegen van je eerste API key.
        </p>
      </div>
      <button
        type="button"
        onClick={onAddProvider}
        style={ctaStyle("primary")}
      >
        + Provider toevoegen
      </button>
    </div>
  );
}

// ─── Add flow ─────────────────────────────────────────────────────────

type AddFlowStep = "pick" | "input";

function CloudProvidersAddFlow({
  workspaceSlug,
  workspaceId,
  onComplete,
  onCancel,
}: {
  workspaceSlug: string;
  workspaceId: string;
  onComplete: () => void;
  onCancel: () => void;
}) {
  const [step, setStep] = useState<AddFlowStep>("pick");
  const [selected, setSelected] = useState<CloudProviderSpec | null>(null);
  const [keyValue, setKeyValue] = useState("");
  const [extraValues, setExtraValues] = useState<Record<string, string>>({});
  const [testState, setTestState] = useState<
    "idle" | "testing" | "valid" | "invalid"
  >("idle");
  const [testLatency, setTestLatency] = useState<number | null>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const canSave = keyValue.trim().length > 0 && testState === "valid";

  const handleTest = () => {
    if (!selected || !keyValue.trim()) return;
    setTestState("testing");
    setTestError(null);
    setTestLatency(null);

    startTransition(async () => {
      const extras =
        selected.extraFields?.reduce(
          (acc, f) => ({ ...acc, [f.name]: extraValues[f.name] ?? "" }),
          {},
        ) ?? {};
      const credential = selected.formatCredential
        ? selected.formatCredential(keyValue.trim(), extras)
        : keyValue.trim();

      const res = await testCloudProviderKey({
        provider: selected.provider,
        value: credential,
      });

      if (res.ok) {
        setTestState("valid");
        setTestLatency(res.data.latencyMs);
      } else {
        setTestState("invalid");
        setTestError(res.error ?? "Verbindingsfout.");
      }
    });
  };

  const handleSave = () => {
    if (!selected || !canSave) return;
    setSaveState("saving");
    setSaveError(null);

    startTransition(async () => {
      const extras =
        selected.extraFields?.reduce(
          (acc, f) => ({ ...acc, [f.name]: extraValues[f.name] ?? "" }),
          {},
        ) ?? {};
      const credential = selected.formatCredential
        ? selected.formatCredential(keyValue.trim(), extras)
        : keyValue.trim();

      const res = await saveCloudProviderKey({
        workspace_slug: workspaceSlug,
        workspace_id: workspaceId,
        provider: selected.provider,
        value: credential,
      });

      if (res.ok) {
        onComplete();
      } else {
        setSaveState("idle");
        setSaveError(res.error);
      }
    });
  };

  return (
    <div
      style={{
        border: "1.5px solid var(--app-border)",
        borderRadius: 14,
        padding: "18px 20px",
        background: "var(--app-card)",
      }}
    >
      {step === "pick" ? (
        <>
          <h3
            style={{
              fontFamily: "var(--hand)",
              fontSize: 20,
              fontWeight: 700,
              margin: "0 0 4px",
            }}
          >
            Provider kiezen
          </h3>
          <p
            style={{ fontSize: 12.5, color: "var(--app-fg-3)", margin: "0 0 16px" }}
          >
            Welke provider wil je toevoegen?
          </p>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
              gap: 10,
              marginBottom: 16,
            }}
          >
            {CLOUD_PROVIDERS.map((spec) => (
              <button
                key={spec.provider}
                type="button"
                onClick={() => {
                  setSelected(spec);
                  setStep("input");
                }}
                style={{
                  textAlign: "left",
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: "1.5px solid var(--app-border)",
                  background: "var(--app-card-2)",
                  cursor: "pointer",
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                }}
              >
                <span
                  style={{
                    fontWeight: 700,
                    fontSize: 13,
                    color: "var(--app-fg)",
                  }}
                >
                  {spec.label}
                </span>
                <span
                  style={{
                    fontSize: 11.5,
                    color: "var(--app-fg-3)",
                    lineHeight: 1.45,
                  }}
                >
                  {spec.tagline}
                </span>
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={onCancel}
            style={ctaStyle("ghost")}
          >
            Annuleer
          </button>
        </>
      ) : (
        selected && (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <button
                type="button"
                onClick={() => {
                  setStep("pick");
                  setSelected(null);
                  setKeyValue("");
                  setTestState("idle");
                }}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "var(--tt-green)",
                  fontSize: 12,
                  fontWeight: 700,
                  padding: 0,
                }}
              >
                ← Terug
              </button>
            </div>

            <h3
              style={{
                fontFamily: "var(--hand)",
                fontSize: 20,
                fontWeight: 700,
                margin: "0 0 4px",
              }}
            >
              {selected.label}
            </h3>
            <p
              style={{
                fontSize: 12.5,
                color: "var(--app-fg-3)",
                margin: "0 0 16px",
              }}
            >
              {selected.tagline}
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {/* Extra fields */}
              {selected.extraFields?.map((field) => (
                <div key={field.name}>
                  <label
                    style={{
                      display: "block",
                      fontSize: 11,
                      fontWeight: 600,
                      marginBottom: 4,
                      color: "var(--app-fg-2)",
                    }}
                  >
                    {field.label}
                    {field.hint && (
                      <span
                        style={{
                          fontWeight: 400,
                          color: "var(--app-fg-3)",
                          marginLeft: 4,
                        }}
                      >
                        — {field.hint}
                      </span>
                    )}
                  </label>
                  <input
                    type="text"
                    placeholder={field.placeholder}
                    value={extraValues[field.name] ?? ""}
                    onChange={(e) =>
                      setExtraValues((prev) => ({
                        ...prev,
                        [field.name]: e.target.value,
                      }))
                    }
                    style={{
                      width: "100%",
                      padding: "8px 10px",
                      borderRadius: 8,
                      border: "1.5px solid var(--app-border)",
                      background: "var(--app-card)",
                      color: "var(--app-fg)",
                      fontSize: 13,
                    }}
                  />
                </div>
              ))}

              {/* API Key input */}
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: 11,
                    fontWeight: 600,
                    marginBottom: 4,
                    color: "var(--app-fg-2)",
                  }}
                >
                  API key
                  {selected.hint && (
                    <span
                      style={{
                        fontWeight: 400,
                        color: "var(--app-fg-3)",
                        marginLeft: 4,
                      }}
                    >
                      — bijvoorbeeld {selected.hint}
                    </span>
                  )}
                </label>
                <input
                  type="password"
                  placeholder="Plak hier je API key…"
                  value={keyValue}
                  onChange={(e) => {
                    setKeyValue(e.target.value);
                    setTestState("idle");
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && canSave) handleSave();
                  }}
                  style={{
                    width: "100%",
                    padding: "8px 10px",
                    borderRadius: 8,
                    border: "1.5px solid var(--app-border)",
                    background: "var(--app-card)",
                    color: "var(--app-fg)",
                    fontSize: 13,
                    fontFamily: "var(--mono, ui-monospace, SFMono-Regular)",
                  }}
                />
              </div>

              {/* Test result banner */}
              {testState === "valid" && testLatency !== null && (
                <div
                  style={{
                    padding: "8px 12px",
                    borderRadius: 8,
                    background: "rgba(57,178,85,0.12)",
                    border: "1.5px solid rgba(57,178,85,0.45)",
                    color: "var(--tt-green)",
                    fontSize: 12.5,
                    fontWeight: 700,
                  }}
                >
                  Verbinding werkt. Reactie in {testLatency}ms.
                </div>
              )}
              {testState === "invalid" && testError && (
                <div
                  style={{
                    padding: "8px 12px",
                    borderRadius: 8,
                    background: "rgba(230,82,107,0.1)",
                    border: "1.5px solid rgba(230,82,107,0.4)",
                    color: "var(--rose)",
                    fontSize: 12.5,
                  }}
                >
                  Geen verbinding. {testError}
                </div>
              )}

              {/* Action buttons */}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={handleTest}
                  disabled={
                    testState === "testing" ||
                    !keyValue.trim() ||
                    (selected.extraFields?.some(
                      (f) => !extraValues[f.name]?.trim(),
                    ) ?? false)
                  }
                  style={ctaStyle("ghost")}
                >
                  {testState === "testing" ? "Even wachten…" : "Test"}
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={!canSave || saveState === "saving"}
                  style={ctaStyle("primary")}
                >
                  {saveState === "saving" ? "Opslaan…" : "Opslaan"}
                </button>
                {selected.keyUrl && (
                  <a
                    href={selected.keyUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ ...ctaStyle("ghost"), textDecoration: "none" }}
                  >
                    Key ophalen ↗
                  </a>
                )}
                {!selected.keyUrl && (
                  <a
                    href={selected.signupUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ ...ctaStyle("ghost"), textDecoration: "none" }}
                  >
                    Aanmelden ↗
                  </a>
                )}
              </div>

              {saveError && (
                <p
                  role="alert"
                  style={{
                    color: "var(--rose)",
                    fontSize: 12,
                    margin: 0,
                  }}
                >
                  {saveError}
                </p>
              )}
            </div>
          </>
        )
      )}
    </div>
  );
}

// ─── Configured providers list ───────────────────────────────────────

function ConfiguredProvidersList({
  configured,
  onAddProvider,
}: {
  configured: string[];
  onAddProvider: () => void;
}) {
  return (
    <div
      style={{
        border: "1.5px solid var(--app-border)",
        borderRadius: 14,
        padding: "16px 18px",
        background: "var(--app-card)",
        display: "flex",
        flexDirection: "column",
        gap: 14,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 10,
        }}
      >
        <div>
          <h2
            style={{
              fontFamily: "var(--hand)",
              fontSize: 22,
              fontWeight: 700,
              margin: 0,
            }}
          >
            Cloud providers
          </h2>
          <p
            style={{
              color: "var(--app-fg-3)",
              fontSize: 12.5,
              margin: "4px 0 0",
            }}
          >
            {configured.length === 1
              ? "1 provider ingesteld."
              : `${configured.length} providers ingesteld.`}
          </p>
        </div>
        <button
          type="button"
          onClick={onAddProvider}
          style={ctaStyle("primary")}
        >
          + Provider toevoegen
        </button>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
          gap: 12,
        }}
      >
        {configured.map((provider) => {
          const spec = CLOUD_PROVIDERS.find((p) => p.provider === provider);
          if (!spec) return null;
          return (
            <ConfiguredProviderCard
              key={provider}
              spec={spec}
            />
          );
        })}
      </div>

      {configured.length === 0 && (
        <p style={{ fontSize: 12.5, color: "var(--app-fg-3)", margin: 0 }}>
          Geen cloud providers ingesteld.{" "}
          <button
            type="button"
            onClick={onAddProvider}
            style={{
              background: "none",
              border: "none",
              color: "var(--tt-green)",
              fontWeight: 700,
              cursor: "pointer",
              fontSize: 12.5,
              padding: 0,
            }}
          >
            Voeg er één toe.
          </button>
        </p>
      )}
    </div>
  );
}

function ConfiguredProviderCard({
  spec,
}: {
  spec: CloudProviderSpec;
}) {
  const [deleteState, setDeleteState] = useState<"idle" | "confirm">("idle");

  return (
    <div
      style={{
        border: "1.5px solid var(--app-border)",
        borderRadius: 12,
        padding: "12px 14px",
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
          gap: 8,
        }}
      >
        <span style={{ fontWeight: 700, fontSize: 13.5 }}>{spec.label}</span>
        <span
          style={{
            fontSize: 9.5,
            fontWeight: 700,
            letterSpacing: "0.18em",
            textTransform: "uppercase" as const,
            color: "var(--tt-green)",
            border: "1.5px solid var(--tt-green)",
            padding: "2px 7px",
            borderRadius: 999,
            whiteSpace: "nowrap" as const,
          }}
        >
          actief
        </span>
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {deleteState === "idle" ? (
          <button
            type="button"
            onClick={() => setDeleteState("confirm")}
            style={ctaStyle("ghost")}
          >
            Verwijder
          </button>
        ) : (
          <>
            <span style={{ fontSize: 12, color: "var(--app-fg-3)", alignSelf: "center" }}>
              Verwijderen?
            </span>
            <button
              type="button"
              onClick={() => {
                // Delete logic would go here
                setDeleteState("idle");
              }}
              style={{
                ...ctaStyle("ghost"),
                color: "var(--rose)",
                borderColor: "var(--rose)",
              }}
            >
              Ja
            </button>
            <button
              type="button"
              onClick={() => setDeleteState("idle")}
              style={ctaStyle("ghost")}
            >
              Nee
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Self-hosted cards (unchanged) ──────────────────────────────────

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
            <code>
              http://{host}:{port ?? 11434}
            </code>
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

// ─── Generic chrome (unchanged) ───────────────────────────────────────

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
