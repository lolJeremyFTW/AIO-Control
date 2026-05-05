// AI-powered flow builder. The user describes an automation in natural
// language; Claude generates a complete FlowPlan (agent + schedule +
// skills). The user can edit each card before creating everything in one shot.

"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { createFlow } from "../app/actions/flows";
import type { FlowPlan, AgentPlan, SchedulePlan, SkillPlan } from "../app/api/flows/generate/route";
import type { BusinessRow } from "../lib/queries/businesses";

type Props = {
  workspaceSlug: string;
  workspaceId: string;
  businesses: BusinessRow[];
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

  const [description, setDescription] = useState("");
  const [businessId, setBusinessId] = useState<string | null>(businesses[0]?.id ?? null);
  const [generating, setGenerating] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<FlowPlan | null>(null);

  // Editable plan state — copied from generated plan and locally mutable
  const [agentDraft, setAgentDraft] = useState<AgentPlan | null>(null);
  const [schedDraft, setSchedDraft] = useState<SchedulePlan | null>(null);
  const [skillsDraft, setSkillsDraft] = useState<SkillPlan[]>([]);

  async function handleGenerate() {
    if (!description.trim()) return;
    setGenerating(true);
    setError(null);
    setPlan(null);
    try {
      const res = await fetch("/api/flows/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ description }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.error ?? "Genereren mislukt.");
        return;
      }
      const p: FlowPlan = json.plan;
      setPlan(p);
      setAgentDraft({ ...p.agent });
      setSchedDraft(p.schedule ? { ...p.schedule } : null);
      setSkillsDraft(p.skills.map((s) => ({ ...s })));
    } catch {
      setError("Netwerk fout bij genereren.");
    } finally {
      setGenerating(false);
    }
  }

  function handleCreate() {
    if (!agentDraft) return;
    setError(null);
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
        setError(result.error);
        return;
      }
      router.push(`/${workspaceSlug}/agents`);
      router.refresh();
    });
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
        <label
          style={{
            display: "block",
            fontWeight: 600,
            fontSize: 13,
            marginBottom: 8,
            color: "var(--app-fg)",
          }}
        >
          Beschrijf de automatisering
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Bijv. 'Maak een agent die elke dag om 9:00 het laatste nieuws over AI ophaalt en een samenvatting stuurt naar Telegram' …"
          rows={4}
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
          {businesses.length > 0 && (
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
                : "var(--brand)",
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
                AI genereert plan…
              </>
            ) : (
              <>
                <SparkIcon />
                Genereer plan
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
          {error}
        </div>
      )}

      {/* ── Step 2: Review + edit generated plan ──────────────────── */}
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
          >
            {skillsDraft.length === 0 ? (
              <p style={{ fontSize: 12.5, color: "var(--app-fg-3)", margin: 0 }}>
                Geen skills gegenereerd. AI bepaalde dat herbruikbare kennis
                hier niet nodig is.
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
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────

function PlanCard({
  title,
  icon,
  children,
  toggle,
  enabled,
  onToggle,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  toggle?: boolean;
  enabled?: boolean;
  onToggle?: (on: boolean) => void;
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
