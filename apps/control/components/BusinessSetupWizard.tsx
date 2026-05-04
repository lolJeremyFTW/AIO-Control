// Multi-step setup wizard for new businesses.
//
//   Step 1  Identity      name + appearance (variant + icon + logo)
//   Step 2  Intent        description + mission + first targets
//   Step 3  Topics        seed initial nav-nodes ("Content / Marketing /…")
//   Step 4  Main agent    name + provider + model + key source
//   Step 5  Telegram      pick existing target or skip
//   Step 6  Isolation     standalone vs inherits-from-workspace
//   Step 7  Confirm       summary + create
//
// All work happens in step 7 — earlier steps are local state. After
// create we router.refresh and route to the new business.

"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { createBusiness } from "../app/actions/businesses";
import { createAgent, type AgentInput } from "../app/actions/agents";
import { createNavNode } from "../app/actions/nav-nodes";
import { listWorkspaceTelegramTargets } from "../app/actions/telegram";
import { translate, type Locale } from "../lib/i18n/dict";
import { useLocale } from "../lib/i18n/client";
import { AppearancePicker, type AppearanceValue } from "./AppearancePicker";
import { TargetsEditor, type Target } from "./TargetsEditor";

type TelegramTargetOption = {
  id: string;
  name: string;
  chat_id?: string | null;
};

type Props = {
  workspaceSlug: string;
  workspaceId: string;
  /** Existing telegram targets the user can re-use for this new
   *  business (passed in from the WorkspaceShell — fetched server-
   *  side once per layout render). */
  telegramTargets?: TelegramTargetOption[];
  /** Workspace defaults so the main-agent step can pre-fill. */
  defaultProvider?: AgentInput["provider"];
  defaultModel?: string | null;
  /** Active UI locale — translates step labels + cta copy through the
   *  shared dict module. Defaults to "nl" so existing call-sites that
   *  haven't passed it yet keep their current text. */
  locale?: Locale;
  onClose: () => void;
};

// Step labels resolve through the i18n dict; see `wizard.step.*` keys.
// We carry the i18n key on the step entry so the strip can render the
// translated copy without hard-wiring NL.
const STEPS = [
  { id: 1, labelKey: "wizard.step.identity" },
  { id: 2, labelKey: "wizard.step.intent" },
  { id: 3, labelKey: "wizard.step.topics" },
  { id: 4, labelKey: "wizard.step.mainAgent" },
  { id: 5, labelKey: "wizard.step.telegram" },
  { id: 6, labelKey: "wizard.step.isolation" },
  { id: 7, labelKey: "wizard.step.confirm" },
] as const;

const TOTAL_STEPS = STEPS.length;

const TOPIC_PRESETS = [
  ["Content", "Marketing", "Sales", "Analytics"],
  ["Video", "Thumbnails", "Scripts", "Publishing"],
  ["Listings", "Customer service", "Fulfillment"],
  ["Agents", "Schedules", "Integrations"],
];

type Provider = AgentInput["provider"];
const PROVIDERS: { id: Provider; label: string; defaultModel?: string }[] = [
  { id: "claude", label: "Claude (API key)", defaultModel: "claude-sonnet-4-6" },
  { id: "claude_cli", label: "Claude CLI (subscription)", defaultModel: "sonnet" },
  { id: "openrouter", label: "OpenRouter", defaultModel: "openrouter/auto" },
  { id: "minimax", label: "MiniMax (Coder Plan)", defaultModel: "MiniMax-M2.7-Highspeed" },
  { id: "ollama", label: "Ollama (lokaal/VPS)", defaultModel: "llama3" },
  { id: "openclaw", label: "OpenClaw (CLI)" },
  { id: "hermes", label: "Hermes (CLI)" },
  { id: "codex", label: "Codex / OpenAI" },
];

export function BusinessSetupWizard({
  workspaceSlug,
  workspaceId,
  telegramTargets = [],
  defaultProvider,
  defaultModel,
  locale: localeProp,
  onClose,
}: Props) {
  const cookieLocale = useLocale();
  const locale: Locale = localeProp ?? cookieLocale;
  const t = (key: string, vars?: Record<string, string | number>) =>
    translate(locale, key, vars);
  const ref = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  useEffect(() => {
    ref.current?.showModal();
  }, []);

  const [step, setStep] = useState(1);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Step 1: Identity ──
  const [name, setName] = useState("");
  const [appearance, setAppearance] = useState<AppearanceValue>({
    variant: "brand",
    icon: "",
    colorHex: null,
    logoUrl: null,
  });

  // ── Step 2: Intent ──
  const [description, setDescription] = useState("");
  const [mission, setMission] = useState("");
  const [targets, setTargets] = useState<Target[]>([]);

  // ── Step 3: Topics ──
  const [topicNames, setTopicNames] = useState<string[]>([]);
  const [topicInput, setTopicInput] = useState("");
  const addTopic = () => {
    const t = topicInput.trim();
    if (!t) return;
    if (!topicNames.includes(t)) setTopicNames([...topicNames, t]);
    setTopicInput("");
  };

  // ── Step 4: Main agent ──
  const [createMainAgent, setCreateMainAgent] = useState(true);
  const [agentName, setAgentName] = useState("");
  const [agentProvider, setAgentProvider] = useState<Provider>(
    defaultProvider ?? "claude",
  );
  const [agentModel, setAgentModel] = useState(defaultModel ?? "");
  const [agentKeySource, setAgentKeySource] = useState<
    "subscription" | "api_key" | "env"
  >("env");
  const providerSpec = PROVIDERS.find((p) => p.id === agentProvider)!;
  // When the user types a name in step 1, suggest "<Name> Main Agent"
  // as the default agent name on first visit to step 4.
  useEffect(() => {
    if (!agentName && name) setAgentName(`${name} Main Agent`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name]);

  // ── Step 5: Telegram ──
  // "skip" = no telegram target; "existing" = pick one of the
  // workspace's existing targets; "auto" = let the auto-create-topic
  // flow (already wired via createBusiness) handle it.
  // We lazy-load the workspace's targets when the wizard mounts so
  // the parent doesn't have to thread them through.
  const [tgTargets, setTgTargets] = useState<TelegramTargetOption[]>(
    telegramTargets,
  );
  useEffect(() => {
    if (telegramTargets.length > 0) return;
    let cancelled = false;
    void listWorkspaceTelegramTargets({ workspace_id: workspaceId }).then(
      (res) => {
        if (cancelled || !res.ok) return;
        setTgTargets(res.data);
        if (res.data.length > 0) {
          setTgChoice("existing");
          setTgExistingId(res.data[0]!.id);
        }
      },
    );
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);
  const [tgChoice, setTgChoice] = useState<"skip" | "existing" | "auto">(
    telegramTargets.length > 0 ? "existing" : "auto",
  );
  const [tgExistingId, setTgExistingId] = useState<string>(
    telegramTargets[0]?.id ?? "",
  );

  // ── Step 6: Isolation ──
  const [isolated, setIsolated] = useState(false);

  const canNext = (() => {
    if (step === 1) return name.trim().length > 0;
    if (step === 4 && createMainAgent) return agentName.trim().length > 0;
    return true;
  })();

  const submit = async () => {
    setError(null);
    setCreating(true);
    try {
      const res = await createBusiness({
        workspace_slug: workspaceSlug,
        workspace_id: workspaceId,
        name,
        variant: appearance.variant,
        icon: appearance.icon || undefined,
        color_hex: appearance.colorHex,
        logo_url: appearance.logoUrl,
        description: description || undefined,
        mission: mission || undefined,
        isolated,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      const newBizId = res.data.id;
      // Telegram topic create may have failed even though the business
      // itself was saved. Surface the reason in-place so the user knows
      // why no topic appeared (usually: bot lacks 'Manage Topics' rights).
      if (res.data.telegram_warning) {
        setError(`Telegram: ${res.data.telegram_warning}`);
      }

      // Topics — best-effort, sequentially.
      for (const t of topicNames) {
        await createNavNode({
          workspace_slug: workspaceSlug,
          workspace_id: workspaceId,
          business_id: newBizId,
          parent_id: null,
          name: t,
        });
      }

      // Targets aren't on createBusiness — push them via updateBusiness
      // immediately if any were entered.
      if (targets.length > 0) {
        const { updateBusiness } = await import(
          "../app/actions/businesses"
        );
        await updateBusiness({
          workspace_slug: workspaceSlug,
          id: newBizId,
          patch: { targets },
        });
      }

      // Main agent — only when the user kept it enabled.
      if (createMainAgent && agentName.trim()) {
        await createAgent({
          workspace_slug: workspaceSlug,
          workspace_id: workspaceId,
          business_id: newBizId,
          name: agentName.trim(),
          kind: "chat",
          provider: agentProvider,
          model: agentModel || providerSpec.defaultModel,
          key_source: agentKeySource,
        });
      }

      // Telegram — link the picked target to this business when the
      // user chose "existing". "auto" relies on the workspace's
      // auto_create_topics_for_businesses flag (set on the existing
      // workspace target, see migration 027). "skip" does nothing.
      if (tgChoice === "existing" && tgExistingId) {
        const { updateBusiness } = await import(
          "../app/actions/businesses"
        );
        await updateBusiness({
          workspace_slug: workspaceSlug,
          id: newBizId,
          patch: { telegram_target_id: tgExistingId },
        });
      }

      onClose();
      router.push(`/${workspaceSlug}/business/${newBizId}`);
    } finally {
      setCreating(false);
    }
  };

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      style={{
        background: "var(--app-card)",
        border: "1.5px solid var(--app-border)",
        borderRadius: 16,
        color: "var(--app-fg)",
        padding: 0,
        maxWidth: 640,
        width: "calc(100% - 32px)",
        boxShadow: "0 24px 60px -12px rgba(0,0,0,0.55)",
      }}
    >
      <div style={{ padding: "20px 24px 24px", maxHeight: "85vh", overflow: "auto" }}>
        {/* ── Stepper ─────────────────────────────────────── */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <h2
            style={{
              fontFamily: "var(--hand)",
              fontSize: 26,
              fontWeight: 700,
              margin: 0,
              letterSpacing: "-0.3px",
            }}
          >
            {t("wizard.business.title", {
              current: step,
              total: TOTAL_STEPS,
            })}
          </h2>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "5px 9px",
              border: "1.5px solid var(--app-border)",
              background: "transparent",
              color: "var(--app-fg-2)",
              borderRadius: 8,
              fontSize: 11,
              cursor: "pointer",
            }}
          >
            ✕
          </button>
        </div>
        <div style={{ display: "flex", gap: 6, marginBottom: 18 }}>
          {STEPS.map((s) => (
            <div
              key={s.id}
              style={{
                flex: 1,
                height: 4,
                background:
                  step >= s.id ? "var(--tt-green)" : "var(--app-border-2)",
                borderRadius: 2,
              }}
              title={t(s.labelKey)}
            />
          ))}
        </div>

        {/* ── Step 1 ──────────────────────────────────────── */}
        {step === 1 && (
          <>
            <p style={hint}>
              Geef je business een naam en uiterlijk. De kleur + icoon
              komen terug in de rail en in iedere notificatie.
            </p>
            <Field label="Naam">
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Faceless YouTube"
                style={inp}
                required
              />
            </Field>
            <AppearancePicker
              value={appearance}
              onChange={setAppearance}
              displayName={name || "B"}
              workspaceId={workspaceId}
            />
          </>
        )}

        {/* ── Step 2 ──────────────────────────────────────── */}
        {step === 2 && (
          <>
            <p style={hint}>
              Beschrijf het waarom + de regels. Agents lezen dit elke run
              zodat ze weten waar ze naartoe moeten werken.
            </p>
            <Field label="Beschrijving (wat is deze business?)">
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="Bijv. Faceless YouTube kanaal over NL tech. Doel: educatieve content + affiliate revenue."
                style={{ ...inp, resize: "vertical" }}
              />
            </Field>
            <Field label="Mission / agent rules of engagement">
              <textarea
                value={mission}
                onChange={(e) => setMission(e.target.value)}
                rows={4}
                placeholder={`Bijv.\n• Schrijf in NL u-vorm, geen jargon\n• Geen click-bait, focus op insights\n• Bij twijfel: HITL review`}
                style={{ ...inp, resize: "vertical" }}
              />
            </Field>
            <Field label="Eerste targets / KPIs (kunnen later worden aangepast)">
              <TargetsEditor value={targets} onChange={setTargets} />
            </Field>
          </>
        )}

        {/* ── Step 3 ──────────────────────────────────────── */}
        {step === 3 && (
          <>
            <p style={hint}>
              Zaai meteen wat <strong>topics</strong> in de rail (Content /
              Marketing / Sales / …). Je kunt later altijd subtopics binnen
              elk topic aanmaken via right-click of de + knop.
            </p>
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <input
                value={topicInput}
                onChange={(e) => setTopicInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addTopic();
                  }
                }}
                placeholder="Bijv. Content / Marketing / Sales"
                style={inp}
              />
              <button type="button" onClick={addTopic} style={btnSec}>
                + Toevoegen
              </button>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
              {topicNames.map((t) => (
                <span
                  key={t}
                  style={{
                    padding: "5px 10px",
                    borderRadius: 999,
                    fontSize: 12,
                    background: "var(--app-card-2)",
                    border: "1px solid var(--app-border)",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  {t}
                  <button
                    type="button"
                    onClick={() =>
                      setTopicNames(topicNames.filter((x) => x !== t))
                    }
                    style={{
                      border: "none",
                      background: "transparent",
                      color: "var(--rose)",
                      cursor: "pointer",
                      fontSize: 12,
                      padding: 0,
                    }}
                  >
                    ✕
                  </button>
                </span>
              ))}
            </div>
            <div style={{ fontSize: 11, color: "var(--app-fg-3)", marginBottom: 6 }}>
              Of pak een preset:
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {TOPIC_PRESETS.map((preset, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() =>
                    setTopicNames([
                      ...new Set([...topicNames, ...preset]),
                    ])
                  }
                  style={btnGhost}
                >
                  {preset.join(" · ")}
                </button>
              ))}
            </div>
          </>
        )}

        {/* ── Step 4 — Main agent ─────────────────────────── */}
        {step === 4 && (
          <>
            <p style={hint}>
              Iedere business begint met een <strong>main agent</strong> —
              de chat-agent waar je standaard mee praat. Je kunt later meer
              agents toevoegen op de business pagina.
            </p>
            <label
              style={{
                display: "flex",
                gap: 10,
                alignItems: "center",
                marginBottom: 14,
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              <input
                type="checkbox"
                checked={createMainAgent}
                onChange={(e) => setCreateMainAgent(e.target.checked)}
                style={{ accentColor: "var(--tt-green)" }}
              />
              Maak meteen een main agent aan
            </label>
            {createMainAgent && (
              <>
                <Field label="Agent naam">
                  <input
                    value={agentName}
                    onChange={(e) => setAgentName(e.target.value)}
                    placeholder={`${name || "Business"} Main Agent`}
                    style={inp}
                  />
                </Field>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 12,
                  }}
                >
                  <Field label="Provider">
                    <select
                      value={agentProvider}
                      onChange={(e) => {
                        const next = e.target.value as Provider;
                        setAgentProvider(next);
                        setAgentModel("");
                      }}
                      style={inp}
                    >
                      {PROVIDERS.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field
                    label={`Model${providerSpec.defaultModel ? ` (default: ${providerSpec.defaultModel})` : ""}`}
                  >
                    <input
                      value={agentModel}
                      onChange={(e) => setAgentModel(e.target.value)}
                      placeholder={providerSpec.defaultModel ?? "model id"}
                      style={inp}
                    />
                  </Field>
                </div>

                {(agentProvider === "claude" ||
                  agentProvider === "claude_cli") && (
                  <Field label="Credentials">
                    <select
                      value={agentKeySource}
                      onChange={(e) =>
                        setAgentKeySource(
                          e.target.value as
                            | "subscription"
                            | "api_key"
                            | "env",
                        )
                      }
                      style={inp}
                    >
                      <option value="subscription">
                        Claude Pro/Max/Team subscription (Routines)
                      </option>
                      <option value="api_key">
                        Anthropic API key (lokale cron)
                      </option>
                      <option value="env">
                        Env var fallback
                      </option>
                    </select>
                  </Field>
                )}
              </>
            )}
          </>
        )}

        {/* ── Step 5 — Telegram ───────────────────────────── */}
        {step === 5 && (
          <>
            <p style={hint}>
              Notificaties van runs / queue items kunnen naar Telegram. Je
              kunt een bestaand workspace-target hergebruiken, of de
              auto-create-topic flow gebruiken (vereist een workspace-bot
              met topics aan).
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {tgTargets.length > 0 && (
                <RadioCard
                  active={tgChoice === "existing"}
                  onClick={() => setTgChoice("existing")}
                  title="Hergebruik bestaand target"
                  desc="Pick een bestaande workspace-bot + chat. Gebruikt diezelfde plek voor notificaties."
                >
                  {tgChoice === "existing" && (
                    <select
                      value={tgExistingId}
                      onChange={(e) => setTgExistingId(e.target.value)}
                      style={{ ...inp, marginTop: 8 }}
                    >
                      {tgTargets.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                          {t.chat_id ? ` · chat ${t.chat_id}` : ""}
                        </option>
                      ))}
                    </select>
                  )}
                </RadioCard>
              )}
              <RadioCard
                active={tgChoice === "auto"}
                onClick={() => setTgChoice("auto")}
                title="Automatisch nieuw topic in workspace-bot"
                desc="Vereist dat je workspace-bot 'auto_create_topics_for_businesses' aan heeft. Bij create maakt 'ie een nieuw forum-topic met de business-naam."
              />
              <RadioCard
                active={tgChoice === "skip"}
                onClick={() => setTgChoice("skip")}
                title="Sla over"
                desc="Geen Telegram-notificaties voor deze business. Kan later in Settings worden toegevoegd."
              />
            </div>
          </>
        )}

        {/* ── Step 6 — Isolation ──────────────────────────── */}
        {step === 6 && (
          <>
            <p style={hint}>
              <strong>Isolatie</strong> bepaalt of deze business gebruikt
              wat in <em>Settings → API Keys / Telegram / Email</em> staat
              op workspace-niveau, of dat &apos;ie volledig op zichzelf
              draait.
            </p>
            <RadioCard
              active={!isolated}
              onClick={() => setIsolated(false)}
              title="Inherits — gebruik workspace defaults"
              desc="Default. Als deze business geen eigen API key / Telegram channel / SMTP creds heeft, valt 'ie terug op wat in Settings staat."
            />
            <div style={{ height: 8 }} />
            <RadioCard
              active={isolated}
              onClick={() => setIsolated(true)}
              title="Isolated — niets uit globals"
              desc="Deze business gebruikt UITSLUITEND eigen credentials. Geen workspace API keys, geen workspace Telegram bot, geen workspace SMTP. Veilig voor client-werk."
              danger
            />
          </>
        )}

        {/* ── Step 7 — Confirm ────────────────────────────── */}
        {step === 7 && (
          <>
            <p style={hint}>
              Klaar voor lancering. Check de samenvatting en klik
              <strong> Aanmaken</strong>.
            </p>
            <Summary label="Naam" value={name} />
            {description && (
              <Summary label="Beschrijving" value={description} multi />
            )}
            {mission && <Summary label="Mission" value={mission} multi />}
            {targets.length > 0 && (
              <Summary
                label="Targets"
                value={targets
                  .map((t) => `• ${t.name} → ${t.target}`)
                  .join("\n")}
                multi
              />
            )}
            {topicNames.length > 0 && (
              <Summary
                label={`Topics (${topicNames.length})`}
                value={topicNames.join(" · ")}
              />
            )}
            <Summary
              label="Main agent"
              value={
                createMainAgent
                  ? `${agentName} (${agentProvider}${agentModel ? ` · ${agentModel}` : ""})`
                  : "— sla over —"
              }
            />
            <Summary
              label="Telegram"
              value={
                tgChoice === "existing"
                  ? `Hergebruik: ${
                      tgTargets.find((t) => t.id === tgExistingId)?.name ??
                      "—"
                    }`
                  : tgChoice === "auto"
                    ? "Auto-create topic in workspace-bot"
                    : "Sla over"
              }
            />
            <Summary
              label="Isolatie"
              value={
                isolated
                  ? "Isolated — eigen credentials, geen fallback"
                  : "Inherits van workspace"
              }
            />
            {error && (
              <p
                role="alert"
                style={{
                  color: "var(--rose)",
                  background: "rgba(230,82,107,0.08)",
                  border: "1px solid rgba(230,82,107,0.4)",
                  borderRadius: 10,
                  padding: "8px 10px",
                  marginTop: 10,
                  fontSize: 12.5,
                }}
              >
                {error}
              </p>
            )}
          </>
        )}

        {/* ── Footer / nav ───────────────────────────────── */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginTop: 18,
            gap: 8,
          }}
        >
          <button
            type="button"
            onClick={() => setStep((s) => Math.max(1, s - 1))}
            disabled={step === 1 || creating}
            style={btnSec}
          >
            {t("wizard.cta.back")}
          </button>
          {step < TOTAL_STEPS ? (
            <button
              type="button"
              onClick={() => setStep((s) => Math.min(TOTAL_STEPS, s + 1))}
              disabled={!canNext}
              style={btnPrimary(false)}
            >
              {t("wizard.cta.next")}
            </button>
          ) : (
            <button
              type="button"
              onClick={submit}
              disabled={creating}
              style={btnPrimary(creating)}
            >
              {creating ? t("common.busy") : `✓ ${t("wizard.cta.create")}`}
            </button>
          )}
        </div>
      </div>
    </dialog>
  );
}

const inp: React.CSSProperties = {
  width: "100%",
  background: "var(--app-card-2)",
  border: "1.5px solid var(--app-border)",
  color: "var(--app-fg)",
  padding: "9px 11px",
  borderRadius: 9,
  fontFamily: "var(--type)",
  fontSize: 13.5,
};
const hint: React.CSSProperties = {
  color: "var(--app-fg-3)",
  fontSize: 12.5,
  margin: "0 0 14px",
  lineHeight: 1.5,
};
const btnSec: React.CSSProperties = {
  padding: "9px 14px",
  border: "1.5px solid var(--app-border)",
  background: "var(--app-card-2)",
  color: "var(--app-fg)",
  borderRadius: 10,
  fontWeight: 700,
  fontSize: 12.5,
  cursor: "pointer",
};
const btnGhost: React.CSSProperties = {
  padding: "7px 10px",
  border: "1px dashed var(--app-border)",
  background: "transparent",
  color: "var(--app-fg-2)",
  borderRadius: 8,
  fontSize: 11.5,
  cursor: "pointer",
  textAlign: "left",
};
const btnPrimary = (pending: boolean): React.CSSProperties => ({
  padding: "9px 16px",
  border: "1.5px solid var(--tt-green)",
  background: "var(--tt-green)",
  color: "#fff",
  borderRadius: 10,
  fontWeight: 700,
  fontSize: 12.5,
  cursor: pending ? "wait" : "pointer",
  opacity: pending ? 0.8 : 1,
});

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label
      style={{
        display: "block",
        marginBottom: 12,
        fontSize: 12,
        fontWeight: 600,
        color: "var(--app-fg-2)",
      }}
    >
      <span style={{ display: "block", marginBottom: 4 }}>{label}</span>
      {children}
    </label>
  );
}

function RadioCard({
  active,
  onClick,
  title,
  desc,
  danger,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  desc: string;
  danger?: boolean;
  children?: React.ReactNode;
}) {
  const accent = danger ? "var(--rose)" : "var(--tt-green)";
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "block",
        width: "100%",
        textAlign: "left",
        padding: 14,
        border: `1.5px solid ${active ? accent : "var(--app-border)"}`,
        borderRadius: 10,
        background: active
          ? danger
            ? "rgba(230,82,107,0.06)"
            : "rgba(57,178,85,0.06)"
          : "transparent",
        color: "var(--app-fg)",
        cursor: "pointer",
        fontFamily: "var(--type)",
      }}
    >
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
        <span
          aria-hidden
          style={{
            width: 16,
            height: 16,
            marginTop: 2,
            borderRadius: "50%",
            border: `2px solid ${active ? accent : "var(--app-border)"}`,
            background: active ? accent : "transparent",
            flexShrink: 0,
          }}
        />
        <span>
          <span
            style={{
              fontWeight: 700,
              fontSize: 13,
              color: danger && active ? accent : "var(--app-fg)",
            }}
          >
            {title}
          </span>
          <span
            style={{
              display: "block",
              fontSize: 11.5,
              color: "var(--app-fg-3)",
              marginTop: 2,
              lineHeight: 1.45,
            }}
          >
            {desc}
          </span>
        </span>
      </div>
      {children}
    </button>
  );
}

function Summary({
  label,
  value,
  multi,
}: {
  label: string;
  value: string;
  multi?: boolean;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "120px 1fr",
        gap: 12,
        padding: "8px 0",
        borderTop: "1px solid var(--app-border-2)",
        fontSize: 13,
      }}
    >
      <div style={{ fontWeight: 700, color: "var(--app-fg-2)" }}>{label}</div>
      <div
        style={{
          color: "var(--app-fg)",
          whiteSpace: multi ? "pre-wrap" : "normal",
        }}
      >
        {value}
      </div>
    </div>
  );
}
