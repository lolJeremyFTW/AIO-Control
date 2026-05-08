// AI-powered flow builder. The user describes an automation in natural
// language; Claude or MiniMax generates a complete FlowPlan (agent + schedule
// + skills). The user can edit each card before creating everything in one shot.

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { createBusinessBlueprint, createFlow } from "../app/actions/flows";
import type {
  AgentPlan,
  BusinessBlueprintPlan,
  FlowPlan,
  SchedulePlan,
  SkillPlan,
} from "@aio/ai/flow-planner";
import type { BusinessRow } from "../lib/queries/businesses";

type Props = {
  workspaceSlug: string;
  workspaceId: string;
  businesses: BusinessRow[];
};

type BuilderMode = "automation" | "business";

type CreatedBlueprint = {
  business_id: string;
  business_slug: string;
  topic_ids: string[];
  agent_ids: string[];
  schedule_ids: string[];
  integration_ids: string[];
  skill_ids: string[];
  webhook_urls: Array<{ schedule_id: string; url: string }>;
};

const AGENT_KINDS = ["worker", "chat", "generator", "reviewer", "router"] as const;
const PROVIDERS = [
  { value: "claude", label: "Claude (Anthropic)" },
  { value: "minimax", label: "MiniMax" },
  { value: "openrouter", label: "OpenRouter" },
  { value: "ollama", label: "Ollama (lokaal)" },
] as const;
const SCHEDULE_KINDS = [
  { value: "cron", label: "Cron (tijdschema)" },
  { value: "webhook", label: "Webhook (extern event)" },
  { value: "manual", label: "Handmatig" },
] as const;

export function FlowBuilder({ workspaceSlug, workspaceId, businesses }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [mode, setMode] = useState<BuilderMode>("automation");
  const [description, setDescription] = useState("");
  const [businessId, setBusinessId] = useState<string | null>(businesses[0]?.id ?? null);
  const [generating, setGenerating] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<{ msg: string; needsApiKey?: boolean } | null>(null);
  const [createdWebhook, setCreatedWebhook] = useState<{
    scheduleId: string;
    url: string;
  } | null>(null);
  const [createdBlueprint, setCreatedBlueprint] = useState<CreatedBlueprint | null>(null);
  const [plan, setPlan] = useState<FlowPlan | null>(null);
  const [blueprintPlan, setBlueprintPlan] = useState<BusinessBlueprintPlan | null>(null);
  const [blueprintJsonDraft, setBlueprintJsonDraft] = useState("");

  // Editable plan state — copied from generated plan and locally mutable
  const [agentDraft, setAgentDraft] = useState<AgentPlan | null>(null);
  const [schedDraft, setSchedDraft] = useState<SchedulePlan | null>(null);
  const [skillsDraft, setSkillsDraft] = useState<SkillPlan[]>([]);
  const parsedBlueprintDraft = parseBlueprintDraft(blueprintJsonDraft);
  const blueprintDraft = parsedBlueprintDraft ?? blueprintPlan;
  const blueprintJsonInvalid = Boolean(blueprintJsonDraft.trim() && !parsedBlueprintDraft);

  function clearGenerated() {
    setCreatedWebhook(null);
    setCreatedBlueprint(null);
    setPlan(null);
    setAgentDraft(null);
    setSchedDraft(null);
    setSkillsDraft([]);
    setBlueprintPlan(null);
    setBlueprintJsonDraft("");
  }

  function switchMode(next: BuilderMode) {
    setMode(next);
    setError(null);
    clearGenerated();
  }

  function updateBlueprintDraft(
    mutator: (plan: BusinessBlueprintPlan) => BusinessBlueprintPlan,
  ) {
    const current = parseBlueprintDraft(blueprintJsonDraft) ?? blueprintPlan;
    if (!current) return;
    const next = mutator(current);
    setBlueprintPlan(next);
    setBlueprintJsonDraft(JSON.stringify(next, null, 2));
  }

  async function handleGenerate() {
    if (!description.trim()) return;
    setGenerating(true);
    setError(null);
    clearGenerated();
    try {
      const res = await fetch("/api/flows/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ description, workspace_id: workspaceId, mode }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError({ msg: json.error ?? "Genereren mislukt.", needsApiKey: !!json.needsApiKey });
        return;
      }
      if (mode === "business") {
        const p: BusinessBlueprintPlan = json.plan;
        setBlueprintPlan(p);
        setBlueprintJsonDraft(JSON.stringify(p, null, 2));
      } else {
        const p: FlowPlan = json.plan;
        setPlan(p);
        setAgentDraft({ ...p.agent });
        setSchedDraft(p.schedule ? { ...p.schedule } : null);
        setSkillsDraft(p.skills.map((s) => ({ ...s })));
      }
    } catch {
      setError({ msg: "Netwerk fout bij genereren." });
    } finally {
      setGenerating(false);
    }
  }

  function handleCreate() {
    if (!agentDraft) return;
    setError(null);
    setCreatedWebhook(null);
    setCreatedBlueprint(null);
    setCreating(true);
    startTransition(async () => {
      const result = await createFlow({
        workspace_slug: workspaceSlug,
        workspace_id: workspaceId,
        business_id: businessId,
        plan: {
          agent: agentDraft,
          schedule: schedDraft,
          skills: skillsDraft,
          explanation: plan?.explanation ?? "",
        },
      });
      setCreating(false);
      if (!result.ok) {
        setError({ msg: result.error });
        return;
      }
      if (
        result.data.schedule_kind === "webhook" &&
        result.data.schedule_id &&
        result.data.webhook_url
      ) {
        setCreatedWebhook({
          scheduleId: result.data.schedule_id,
          url: result.data.webhook_url,
        });
        setPlan(null);
        setAgentDraft(null);
        setSchedDraft(null);
        setSkillsDraft([]);
        router.refresh();
        return;
      }
      router.push(`/${workspaceSlug}/agents`);
      router.refresh();
    });
  }

  function handleCreateBlueprint() {
    const draft = parseBlueprintDraft(blueprintJsonDraft);
    if (!draft) {
      setError({ msg: "Blueprint JSON is ongeldig. Controleer de advanced editor." });
      return;
    }
    setError(null);
    setCreatedWebhook(null);
    setCreatedBlueprint(null);
    setCreating(true);
    startTransition(async () => {
      const result = await createBusinessBlueprint({
        workspace_slug: workspaceSlug,
        workspace_id: workspaceId,
        plan: draft,
      });
      setCreating(false);
      if (!result.ok) {
        setError({ msg: result.error });
        return;
      }
      setCreatedBlueprint(result.data);
      setBlueprintPlan(null);
      setBlueprintJsonDraft("");
      router.refresh();
    });
  }

  function addEmptySkill() {
    setSkillsDraft((s) => [
      ...s,
      { name: "", description: "", body: "" },
    ]);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* ── Step 1: Describe ──────────────────────────────────────── */}
      <section
        style={{
          background: "var(--app-surface-2)",
          borderRadius: 10,
          padding: "20px 22px",
          border: "1px solid var(--app-border-2)",
        }}
      >
        <div
          style={{
            display: "inline-flex",
            border: "1px solid var(--app-border)",
            borderRadius: 8,
            overflow: "hidden",
            marginBottom: 14,
            background: "var(--app-surface)",
          }}
        >
          <ModeButton
            active={mode === "automation"}
            onClick={() => switchMode("automation")}
          >
            Automatisering
          </ModeButton>
          <ModeButton
            active={mode === "business"}
            onClick={() => switchMode("business")}
          >
            Business blueprint
          </ModeButton>
        </div>
        <label
          style={{
            display: "block",
            fontWeight: 600,
            fontSize: 13,
            marginBottom: 8,
            color: "var(--app-fg)",
          }}
        >
          {mode === "business"
            ? "Beschrijf de business"
            : "Beschrijf de automatisering"}
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={
            mode === "business"
              ? "Bijv. 'Ik wil een lead-gen agency voor lokale installateurs: research, outreach, content, offertes, rapportage en follow-up volledig met agentteams en cron jobs.'"
              : "Bijv. 'Maak een agent die elke dag om 9:00 het laatste nieuws over AI ophaalt en een samenvatting stuurt naar Telegram' ..."
          }
          rows={mode === "business" ? 5 : 4}
          style={{
            width: "100%",
            resize: "vertical",
            padding: "10px 12px",
            borderRadius: 7,
            border: "1px solid var(--app-border)",
            background: "var(--app-surface)",
            color: "var(--app-fg)",
            fontSize: 13.5,
            fontFamily: "inherit",
            lineHeight: 1.55,
            boxSizing: "border-box",
          }}
          disabled={generating}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) handleGenerate();
          }}
        />

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginTop: 12,
            flexWrap: "wrap",
          }}
        >
          {mode === "automation" && businesses.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 12, color: "var(--app-fg-3)" }}>Business:</span>
              <select
                value={businessId ?? ""}
                onChange={(e) => setBusinessId(e.target.value || null)}
                style={{
                  padding: "6px 10px",
                  borderRadius: 6,
                  border: "1px solid var(--app-border)",
                  background: "var(--app-surface)",
                  color: "var(--app-fg)",
                  fontSize: 12.5,
                }}
              >
                <option value="">Workspace-global</option>
                {businesses.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <button
            onClick={handleGenerate}
            disabled={generating || !description.trim()}
            style={{
              marginLeft: "auto",
              padding: "8px 18px",
              borderRadius: 7,
              border: "none",
              background: generating || !description.trim()
                ? "var(--app-border)"
                : "var(--tt-green)",
              color: generating || !description.trim()
                ? "var(--app-fg-3)"
                : "#fff",
              fontWeight: 600,
              fontSize: 13,
              cursor: generating || !description.trim() ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              gap: 7,
            }}
          >
            {generating ? (
              <>
                <SpinnerIcon />
                {mode === "business" ? "AI ontwerpt blueprint..." : "AI genereert plan..."}
              </>
            ) : (
              <>
                <SparkIcon />
                {mode === "business" ? "Genereer blueprint" : "Genereer plan"}
              </>
            )}
          </button>
        </div>
      </section>

      {error && (
        <div
          style={{
            background: "var(--rose-bg, #fef2f2)",
            border: "1px solid var(--rose-border, #fecaca)",
            borderRadius: 8,
            padding: "10px 14px",
            fontSize: 13,
            color: "var(--rose-fg, #dc2626)",
          }}
        >
          {error.needsApiKey ? (
            <>
              Geen API key geconfigureerd.{" "}
              <Link
                href={`/${workspaceSlug}/settings/ai#api-keys`}
                style={{ color: "inherit", fontWeight: 600, textDecoration: "underline" }}
              >
                Voeg een Claude of MiniMax key toe via Settings → API Keys
              </Link>
              .
            </>
          ) : (
            error.msg
          )}
        </div>
      )}

      {createdWebhook && (
        <section
          style={{
            background: "rgba(57,178,85,0.08)",
            border: "1px solid var(--tt-green)",
            borderRadius: 8,
            padding: "14px 16px",
            display: "flex",
            flexDirection: "column",
            gap: 10,
            fontSize: 13,
            color: "var(--app-fg)",
          }}
        >
          <strong style={{ color: "var(--tt-green)" }}>
            Flow aangemaakt. Sla deze webhook URL nu op; hij wordt maar één keer getoond.
          </strong>
          <code
            style={{
              display: "block",
              padding: 10,
              background: "var(--app-surface)",
              border: "1px solid var(--app-border)",
              borderRadius: 7,
              wordBreak: "break-all",
              color: "var(--app-fg)",
            }}
          >
            {createdWebhook.url}
          </code>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Link
              href={`/${workspaceSlug}/agents`}
              style={{
                color: "var(--brand)",
                fontWeight: 700,
                textDecoration: "none",
              }}
            >
              Bekijk agent
            </Link>
            {businessId && (
              <Link
                href={`/${workspaceSlug}/business/${businessId}/schedules?schedule=${createdWebhook.scheduleId}`}
                style={{
                  color: "var(--app-fg-2)",
                  fontWeight: 600,
                  textDecoration: "none",
                }}
              >
                Bekijk schedule
              </Link>
            )}
          </div>
        </section>
      )}

      {/* ── Step 2: Review + edit generated plan ──────────────────── */}
      {createdBlueprint && (
        <section
          style={{
            background: "rgba(57,178,85,0.08)",
            border: "1px solid var(--tt-green)",
            borderRadius: 8,
            padding: "14px 16px",
            display: "flex",
            flexDirection: "column",
            gap: 10,
            fontSize: 13,
            color: "var(--app-fg)",
          }}
        >
          <strong style={{ color: "var(--tt-green)" }}>
            Business blueprint aangemaakt.
          </strong>
          <span style={{ color: "var(--app-fg-2)", lineHeight: 1.5 }}>
            {createdBlueprint.agent_ids.length} agents,{" "}
            {createdBlueprint.schedule_ids.length} schedules,{" "}
            {createdBlueprint.skill_ids.length} skills,{" "}
            {createdBlueprint.topic_ids.length} topics en{" "}
            {createdBlueprint.integration_ids.length} integrations staan klaar.
          </span>
          {createdBlueprint.webhook_urls.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <strong style={{ fontSize: 12 }}>
                Webhook URLs worden maar een keer getoond:
              </strong>
              {createdBlueprint.webhook_urls.map((hook) => (
                <code
                  key={hook.schedule_id}
                  style={{
                    display: "block",
                    padding: 10,
                    background: "var(--app-surface)",
                    border: "1px solid var(--app-border)",
                    borderRadius: 7,
                    wordBreak: "break-all",
                    color: "var(--app-fg)",
                  }}
                >
                  {hook.url}
                </code>
              ))}
            </div>
          )}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Link
              href={`/${workspaceSlug}/business/${createdBlueprint.business_slug || createdBlueprint.business_id}`}
              style={{
                color: "var(--brand)",
                fontWeight: 700,
                textDecoration: "none",
              }}
            >
              Open business
            </Link>
            <Link
              href={`/${workspaceSlug}/business/${createdBlueprint.business_slug || createdBlueprint.business_id}/agents`}
              style={{
                color: "var(--app-fg-2)",
                fontWeight: 600,
                textDecoration: "none",
              }}
            >
              Bekijk agents
            </Link>
          </div>
        </section>
      )}

      {agentDraft && (
        <>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              paddingBottom: 4,
              borderBottom: "1px solid var(--app-border-2)",
            }}
          >
            <CheckIcon />
            <span
              style={{
                fontFamily: "var(--hand)",
                fontSize: 18,
                fontWeight: 700,
                color: "var(--app-fg)",
              }}
            >
              Gegenereerd plan
            </span>
          </div>

          {plan?.explanation && (
            <p
              style={{
                fontSize: 13,
                color: "var(--app-fg-2)",
                lineHeight: 1.6,
                margin: 0,
                padding: "8px 14px",
                background: "var(--app-surface-2)",
                borderRadius: 7,
                borderLeft: "3px solid var(--brand)",
              }}
            >
              {plan.explanation}
            </p>
          )}

          {/* Agent card */}
          <PlanCard title="Agent" icon={<RobotIcon />}>
            <FormRow label="Naam">
              <input
                value={agentDraft.name}
                onChange={(e) =>
                  setAgentDraft((d) => d && { ...d, name: e.target.value })
                }
                style={inputStyle}
              />
            </FormRow>
            <FormRow label="Kind">
              <select
                value={agentDraft.kind}
                onChange={(e) =>
                  setAgentDraft(
                    (d) =>
                      d && {
                        ...d,
                        kind: e.target.value as AgentPlan["kind"],
                      },
                  )
                }
                style={selectStyle}
              >
                {AGENT_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
            </FormRow>
            <FormRow label="Provider">
              <select
                value={agentDraft.provider}
                onChange={(e) =>
                  setAgentDraft(
                    (d) =>
                      d && {
                        ...d,
                        provider: e.target.value as AgentPlan["provider"],
                      },
                  )
                }
                style={selectStyle}
              >
                {PROVIDERS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </FormRow>
            <FormRow label="Model">
              <input
                value={agentDraft.model}
                onChange={(e) =>
                  setAgentDraft((d) => d && { ...d, model: e.target.value })
                }
                style={inputStyle}
              />
            </FormRow>
            <FormRow label="System prompt" vertical>
              <textarea
                value={agentDraft.system_prompt}
                onChange={(e) =>
                  setAgentDraft(
                    (d) => d && { ...d, system_prompt: e.target.value },
                  )
                }
                rows={6}
                style={{ ...inputStyle, resize: "vertical", fontFamily: "monospace", fontSize: 12 }}
              />
            </FormRow>
          </PlanCard>

          {/* Schedule card */}
          <PlanCard
            title="Schedule"
            icon={<CalIcon />}
            toggle
            enabled={schedDraft !== null}
            onToggle={(on) => {
              if (on && plan?.schedule) setSchedDraft({ ...plan.schedule });
              else if (on) {
                setSchedDraft({
                  kind: "cron",
                  cron_expr: "0 9 * * *",
                  title: agentDraft.name,
                  description: "",
                  prompt: "Voer je taak uit.",
                });
              } else {
                setSchedDraft(null);
              }
            }}
          >
            {schedDraft && (
              <>
                <FormRow label="Type">
                  <select
                    value={schedDraft.kind}
                    onChange={(e) =>
                      setSchedDraft(
                        (d) =>
                          d && {
                            ...d,
                            kind: e.target.value as SchedulePlan["kind"],
                          },
                      )
                    }
                    style={selectStyle}
                  >
                    {SCHEDULE_KINDS.map((k) => (
                      <option key={k.value} value={k.value}>
                        {k.label}
                      </option>
                    ))}
                  </select>
                </FormRow>
                {schedDraft.kind === "cron" && (
                  <FormRow label="Cron expressie">
                    <input
                      value={schedDraft.cron_expr ?? ""}
                      onChange={(e) =>
                        setSchedDraft(
                          (d) => d && { ...d, cron_expr: e.target.value },
                        )
                      }
                      placeholder="0 9 * * *"
                      style={inputStyle}
                    />
                  </FormRow>
                )}
                <FormRow label="Titel">
                  <input
                    value={schedDraft.title}
                    onChange={(e) =>
                      setSchedDraft(
                        (d) => d && { ...d, title: e.target.value },
                      )
                    }
                    style={inputStyle}
                  />
                </FormRow>
                <FormRow label="Run prompt" vertical>
                  <textarea
                    value={schedDraft.prompt}
                    onChange={(e) =>
                      setSchedDraft(
                        (d) => d && { ...d, prompt: e.target.value },
                      )
                    }
                    rows={3}
                    style={{ ...inputStyle, resize: "vertical" }}
                    placeholder="Instructie die bij elke run meegegeven wordt…"
                  />
                </FormRow>
              </>
            )}
          </PlanCard>

          {/* Skills cards */}
          <PlanCard
            title={`Skills (${skillsDraft.length})`}
            icon={<BookIcon />}
            onAddSkill={addEmptySkill}
          >
            {skillsDraft.length === 0 ? (
              <p style={{ fontSize: 12.5, color: "var(--app-fg-3)", margin: 0 }}>
                Geen skills gegenereerd. AI bepaalde dat herbruikbare kennis
                hier niet nodig is.{" "}
                <button
                  onClick={addEmptySkill}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: "var(--brand)",
                    fontSize: 12.5,
                    padding: 0,
                    fontFamily: "inherit",
                    textDecoration: "underline",
                  }}
                >
                  Skill toevoegen
                </button>
              </p>
            ) : (
              skillsDraft.map((skill, i) => (
                <div
                  key={i}
                  style={{
                    padding: "14px 16px",
                    background: "var(--app-surface)",
                    borderRadius: 8,
                    border: "1px solid var(--app-border)",
                    display: "flex",
                    flexDirection: "column",
                    gap: 10,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                  >
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: "var(--app-fg-2)",
                      }}
                    >
                      Skill {i + 1}
                    </span>
                    <button
                      onClick={() =>
                        setSkillsDraft((s) => s.filter((_, j) => j !== i))
                      }
                      style={{
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        color: "var(--app-fg-3)",
                        fontSize: 12,
                        padding: "2px 6px",
                      }}
                    >
                      Verwijder
                    </button>
                  </div>
                  <FormRow label="Naam">
                    <input
                      value={skill.name}
                      onChange={(e) =>
                        setSkillsDraft((s) =>
                          s.map((sk, j) =>
                            j === i ? { ...sk, name: e.target.value } : sk,
                          ),
                        )
                      }
                      style={inputStyle}
                    />
                  </FormRow>
                  <FormRow label="Beschrijving">
                    <input
                      value={skill.description}
                      onChange={(e) =>
                        setSkillsDraft((s) =>
                          s.map((sk, j) =>
                            j === i
                              ? { ...sk, description: e.target.value }
                              : sk,
                          ),
                        )
                      }
                      style={inputStyle}
                      placeholder="Wanneer gebruik je deze skill (1 zin)…"
                    />
                  </FormRow>
                  <FormRow label="Body" vertical>
                    <textarea
                      value={skill.body}
                      onChange={(e) =>
                        setSkillsDraft((s) =>
                          s.map((sk, j) =>
                            j === i ? { ...sk, body: e.target.value } : sk,
                          ),
                        )
                      }
                      rows={5}
                      style={{
                        ...inputStyle,
                        resize: "vertical",
                        fontFamily: "monospace",
                        fontSize: 12,
                      }}
                    />
                  </FormRow>
                </div>
              ))
            )}
          </PlanCard>

          {/* Create button */}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
            <button
              onClick={() => {
                setPlan(null);
                setAgentDraft(null);
                setSchedDraft(null);
                setSkillsDraft([]);
              }}
              style={{
                padding: "9px 18px",
                borderRadius: 7,
                border: "1px solid var(--app-border)",
                background: "transparent",
                color: "var(--app-fg-2)",
                fontWeight: 500,
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              Annuleren
            </button>
            <button
              onClick={handleCreate}
              disabled={creating || !agentDraft?.name.trim()}
              style={{
                padding: "9px 22px",
                borderRadius: 7,
                border: "none",
                background:
                  creating || !agentDraft?.name.trim()
                    ? "var(--app-border)"
                    : "var(--brand)",
                color:
                  creating || !agentDraft?.name.trim()
                    ? "var(--app-fg-3)"
                    : "#fff",
                fontWeight: 700,
                fontSize: 13,
                cursor:
                  creating || !agentDraft?.name.trim()
                    ? "not-allowed"
                    : "pointer",
                display: "flex",
                alignItems: "center",
                gap: 7,
              }}
            >
              {creating ? (
                <>
                  <SpinnerIcon />
                  Aanmaken…
                </>
              ) : (
                <>
                  <CheckIcon />
                  Alles aanmaken
                </>
              )}
            </button>
          </div>
        </>
      )}

      {blueprintDraft && (
        <>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              paddingBottom: 4,
              borderBottom: "1px solid var(--app-border-2)",
            }}
          >
            <CheckIcon />
            <span
              style={{
                fontFamily: "var(--hand)",
                fontSize: 18,
                fontWeight: 700,
                color: "var(--app-fg)",
              }}
            >
              Business blueprint
            </span>
          </div>

          {blueprintDraft.explanation && (
            <p
              style={{
                fontSize: 13,
                color: "var(--app-fg-2)",
                lineHeight: 1.6,
                margin: 0,
                padding: "8px 14px",
                background: "var(--app-surface-2)",
                borderRadius: 7,
                borderLeft: "3px solid var(--brand)",
              }}
            >
              {blueprintDraft.explanation}
            </p>
          )}

          <PlanCard title="Business" icon={<BriefcaseIcon />}>
            <FormRow label="Naam">
              <input
                value={blueprintDraft.business.name}
                onChange={(e) =>
                  updateBlueprintDraft((draft) => ({
                    ...draft,
                    business: { ...draft.business, name: e.target.value },
                  }))
                }
                style={inputStyle}
              />
            </FormRow>
            <FormRow label="Subtitel">
              <input
                value={blueprintDraft.business.sub}
                onChange={(e) =>
                  updateBlueprintDraft((draft) => ({
                    ...draft,
                    business: { ...draft.business, sub: e.target.value },
                  }))
                }
                style={inputStyle}
              />
            </FormRow>
            <FormRow label="Missie" vertical>
              <textarea
                value={blueprintDraft.business.mission}
                onChange={(e) =>
                  updateBlueprintDraft((draft) => ({
                    ...draft,
                    business: { ...draft.business, mission: e.target.value },
                  }))
                }
                rows={3}
                style={{ ...inputStyle, resize: "vertical" }}
              />
            </FormRow>
          </PlanCard>

          <PlanCard
            title={`Agent team (${blueprintDraft.agents.length})`}
            icon={<RobotIcon />}
          >
            <div style={{ display: "grid", gap: 10 }}>
              {blueprintDraft.agents.map((agent) => (
                <SummaryItem key={agent.key}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                    <strong style={{ color: "var(--app-fg)", fontSize: 13 }}>
                      {agent.name}
                    </strong>
                    <span style={{ color: "var(--app-fg-3)", fontSize: 12 }}>
                      {agent.role} / {agent.kind}
                    </span>
                  </div>
                  <p style={summaryTextStyle}>{agent.description}</p>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <Tag>{agent.provider}</Tag>
                    {agent.topic_key && <Tag>topic: {agent.topic_key}</Tag>}
                    {(agent.mcp_servers ?? []).map((server) => (
                      <Tag key={server}>{server}</Tag>
                    ))}
                    {(agent.skill_keys ?? []).map((skill) => (
                      <Tag key={skill}>skill: {skill}</Tag>
                    ))}
                  </div>
                </SummaryItem>
              ))}
            </div>
          </PlanCard>

          <PlanCard
            title={`Topics (${blueprintDraft.topics.length})`}
            icon={<NetworkIcon />}
          >
            <CompactList
              items={blueprintDraft.topics.map((topic) => ({
                title: topic.name,
                meta: topic.parent_key ? `onder ${topic.parent_key}` : "root",
                body: topic.description,
              }))}
              empty="Geen topics in deze blueprint."
            />
          </PlanCard>

          <PlanCard
            title={`Schedules (${blueprintDraft.schedules.length})`}
            icon={<CalIcon />}
          >
            <CompactList
              items={blueprintDraft.schedules.map((schedule) => ({
                title: schedule.title,
                meta:
                  schedule.kind === "cron"
                    ? `${schedule.agent_key} / ${schedule.cron_expr ?? "0 9 * * *"}`
                    : `${schedule.agent_key} / ${schedule.kind}`,
                body: schedule.description,
              }))}
              empty="Geen schedules in deze blueprint."
            />
          </PlanCard>

          <PlanCard
            title={`Skills (${blueprintDraft.skills.length})`}
            icon={<BookIcon />}
          >
            <CompactList
              items={blueprintDraft.skills.map((skill) => ({
                title: skill.name,
                meta: skill.key,
                body: skill.description,
              }))}
              empty="Geen skills in deze blueprint."
            />
          </PlanCard>

          <PlanCard
            title={`Integrations (${blueprintDraft.integrations.length})`}
            icon={<PlugIcon />}
          >
            <CompactList
              items={blueprintDraft.integrations.map((integration) => ({
                title: integration.name,
                meta: integration.provider,
                body: integration.setup_notes || integration.reason,
              }))}
              empty="Geen integrations in deze blueprint."
            />
          </PlanCard>

          <PlanCard
            title={`Research (${blueprintDraft.research_plan?.depth ?? "standard"})`}
            icon={<SparkIcon />}
          >
            <CompactList
              items={(blueprintDraft.research_plan?.questions ?? []).map((question) => ({
                title: question,
                meta: "vraag",
                body: blueprintDraft.research_plan?.sources_to_check.join(", ") ?? "",
              }))}
              empty="Geen researchvragen in deze blueprint."
            />
          </PlanCard>

          <PlanCard title="Advanced JSON" icon={<BookIcon />}>
            {blueprintJsonInvalid && (
              <p
                style={{
                  margin: 0,
                  color: "var(--rose-fg, #dc2626)",
                  fontSize: 12.5,
                }}
              >
                JSON is ongeldig; creation gebruikt pas weer deze editor zodra
                de syntax klopt.
              </p>
            )}
            <textarea
              value={blueprintJsonDraft}
              onChange={(e) => setBlueprintJsonDraft(e.target.value)}
              rows={14}
              style={{
                ...inputStyle,
                resize: "vertical",
                fontFamily: "monospace",
                fontSize: 12,
                lineHeight: 1.5,
              }}
            />
          </PlanCard>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
            <button
              onClick={clearGenerated}
              style={{
                padding: "9px 18px",
                borderRadius: 7,
                border: "1px solid var(--app-border)",
                background: "transparent",
                color: "var(--app-fg-2)",
                fontWeight: 500,
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              Annuleren
            </button>
            <button
              onClick={handleCreateBlueprint}
              disabled={creating || blueprintJsonInvalid || !blueprintDraft.business.name.trim()}
              style={{
                padding: "9px 22px",
                borderRadius: 7,
                border: "none",
                background:
                  creating || blueprintJsonInvalid || !blueprintDraft.business.name.trim()
                    ? "var(--app-border)"
                    : "var(--brand)",
                color:
                  creating || blueprintJsonInvalid || !blueprintDraft.business.name.trim()
                    ? "var(--app-fg-3)"
                    : "#fff",
                fontWeight: 700,
                fontSize: 13,
                cursor:
                  creating || blueprintJsonInvalid || !blueprintDraft.business.name.trim()
                    ? "not-allowed"
                    : "pointer",
                display: "flex",
                alignItems: "center",
                gap: 7,
              }}
            >
              {creating ? (
                <>
                  <SpinnerIcon />
                  Opzetten...
                </>
              ) : (
                <>
                  <CheckIcon />
                  Business opzetten
                </>
              )}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────

function parseBlueprintDraft(input: string): BusinessBlueprintPlan | null {
  if (!input.trim()) return null;
  try {
    return JSON.parse(input) as BusinessBlueprintPlan;
  } catch {
    return null;
  }
}

function ModeButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "7px 12px",
        border: "none",
        borderRight: "1px solid var(--app-border)",
        background: active ? "var(--tt-green)" : "transparent",
        color: active ? "#fff" : "var(--app-fg-2)",
        fontSize: 12.5,
        fontWeight: 700,
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

function SummaryItem({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        padding: "12px 14px",
        background: "var(--app-surface)",
        borderRadius: 8,
        border: "1px solid var(--app-border)",
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      {children}
    </div>
  );
}

function CompactList({
  items,
  empty,
}: {
  items: Array<{ title: string; meta: string; body: string }>;
  empty: string;
}) {
  if (items.length === 0) {
    return <p style={{ ...summaryTextStyle, margin: 0 }}>{empty}</p>;
  }
  return (
    <div style={{ display: "grid", gap: 8 }}>
      {items.map((item, index) => (
        <SummaryItem key={`${item.title}-${index}`}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
            <strong style={{ color: "var(--app-fg)", fontSize: 13 }}>
              {item.title}
            </strong>
            <span style={{ color: "var(--app-fg-3)", fontSize: 12 }}>
              {item.meta}
            </span>
          </div>
          {item.body && <p style={summaryTextStyle}>{item.body}</p>}
        </SummaryItem>
      ))}
    </div>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        display: "inline-flex",
        padding: "2px 7px",
        borderRadius: 999,
        border: "1px solid var(--app-border)",
        background: "var(--app-surface-2)",
        color: "var(--app-fg-3)",
        fontSize: 11,
        fontWeight: 600,
      }}
    >
      {children}
    </span>
  );
}

function PlanCard({
  title,
  icon,
  children,
  toggle,
  enabled,
  onToggle,
  onAddSkill,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  toggle?: boolean;
  enabled?: boolean;
  onToggle?: (on: boolean) => void;
  onAddSkill?: () => void;
}) {
  return (
    <section
      style={{
        background: "var(--app-surface-2)",
        borderRadius: 10,
        border: "1px solid var(--app-border-2)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "12px 18px",
          borderBottom: enabled !== false ? "1px solid var(--app-border-2)" : "none",
          background: "var(--app-surface-3, var(--app-surface-2))",
        }}
      >
        <span style={{ color: "var(--app-fg-3)", display: "flex" }}>{icon}</span>
        <span style={{ fontWeight: 700, fontSize: 13.5, color: "var(--app-fg)" }}>
          {title}
        </span>
        {toggle && (
          <label
            style={{
              marginLeft: "auto",
              display: "flex",
              alignItems: "center",
              gap: 6,
              cursor: "pointer",
              fontSize: 12,
              color: "var(--app-fg-3)",
            }}
          >
            <input
              type="checkbox"
              checked={enabled ?? false}
              onChange={(e) => onToggle?.(e.target.checked)}
            />
            {enabled ? "Ingeschakeld" : "Uitgeschakeld"}
          </label>
        )}
        {onAddSkill && (
          <button
            onClick={onAddSkill}
            style={{
              marginLeft: "auto",
              background: "none",
              border: "1px solid var(--app-border)",
              borderRadius: 5,
              cursor: "pointer",
              color: "var(--app-fg-2)",
              fontSize: 11.5,
              padding: "3px 10px",
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            <PlusIcon />
            Skill toevoegen
          </button>
        )}
      </div>
      {(enabled === undefined || enabled) && (
        <div
          style={{
            padding: "16px 18px",
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          {children}
        </div>
      )}
    </section>
  );
}

function FormRow({
  label,
  children,
  vertical,
}: {
  label: string;
  children: React.ReactNode;
  vertical?: boolean;
}) {
  return (
    <div
      style={{
        display: vertical ? "flex" : "grid",
        gridTemplateColumns: vertical ? undefined : "140px 1fr",
        flexDirection: vertical ? "column" : undefined,
        gap: vertical ? 6 : 0,
        alignItems: vertical ? "stretch" : "center",
      }}
    >
      <span
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: "var(--app-fg-3)",
          paddingRight: vertical ? 0 : 12,
        }}
      >
        {label}
      </span>
      {children}
    </div>
  );
}

const summaryTextStyle: React.CSSProperties = {
  color: "var(--app-fg-3)",
  fontSize: 12.5,
  lineHeight: 1.5,
  margin: 0,
};

const inputStyle: React.CSSProperties = {
  padding: "7px 10px",
  borderRadius: 6,
  border: "1px solid var(--app-border)",
  background: "var(--app-surface)",
  color: "var(--app-fg)",
  fontSize: 13,
  fontFamily: "inherit",
  width: "100%",
  boxSizing: "border-box",
};

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  cursor: "pointer",
};

// ── Icons ─────────────────────────────────────────────────────────────

function SparkIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l1.5 5.5L19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5L12 3z" />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      style={{ animation: "spin 0.8s linear infinite" }}
    >
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <circle cx="12" cy="12" r="10" opacity="0.25" />
      <path d="M12 2a10 10 0 0 1 10 10" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function RobotIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="7" width="16" height="13" rx="2" />
      <line x1="12" y1="2" x2="12" y2="7" />
      <circle cx="9" cy="13" r="1.2" />
      <circle cx="15" cy="13" r="1.2" />
      <line x1="9" y1="17" x2="15" y2="17" />
    </svg>
  );
}

function CalIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

function BookIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  );
}

function BriefcaseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="7" width="20" height="14" rx="2" />
      <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
      <path d="M2 12h20" />
    </svg>
  );
}

function NetworkIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="8.5" y="14" width="7" height="7" rx="1.5" />
      <path d="M10 6.5h4" />
      <path d="M6.5 10v2a2 2 0 0 0 2 2h3.5" />
      <path d="M17.5 10v2a2 2 0 0 1-2 2H12" />
    </svg>
  );
}

function PlugIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22v-5" />
      <path d="M9 8V2" />
      <path d="M15 8V2" />
      <path d="M6 8h12v4a6 6 0 0 1-12 0V8z" />
    </svg>
  );
}
