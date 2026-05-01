// Schedule list + create form for a single business. Phase 5.5 ships
// webhook + manual schedules end-to-end. Cron is gated on having an
// Anthropic API key configured (which the user opts into separately) so
// the form shows a hint instead of a broken submit when it's missing.

"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import type { AgentRow } from "../lib/queries/agents";
import type { ScheduleRow } from "../lib/queries/schedules";
import {
  createCronSchedule,
  createWebhookSchedule,
  deleteSchedule,
  rotateWebhookSecret,
  runAgentNow,
} from "../app/actions/schedules";

type Props = {
  workspaceSlug: string;
  workspaceId: string;
  businessId: string;
  agents: AgentRow[];
  schedules: ScheduleRow[];
  triggerOrigin: string; // e.g. https://tromptech.life — used to render webhook URLs
};

export function SchedulesPanel({
  workspaceSlug,
  workspaceId,
  businessId,
  agents,
  schedules,
  triggerOrigin,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [agentId, setAgentId] = useState<string>(agents[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [revealedSecret, setRevealedSecret] = useState<{
    scheduleId: string;
    url: string;
  } | null>(null);
  const [cronOpen, setCronOpen] = useState(false);
  const [cronExpr, setCronExpr] = useState("0 9 * * *");
  const [cronPrompt, setCronPrompt] = useState("");

  const createWebhook = () => {
    if (!agentId) return setError("Kies eerst een agent.");
    setError(null);
    startTransition(async () => {
      const res = await createWebhookSchedule({
        workspace_slug: workspaceSlug,
        workspace_id: workspaceId,
        agent_id: agentId,
        business_id: businessId,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setRevealedSecret({
        scheduleId: res.data.id,
        url: `${triggerOrigin}/api/triggers/${res.data.secret}`,
      });
      router.refresh();
    });
  };

  const triggerNow = (agent_id: string) => {
    startTransition(async () => {
      const res = await runAgentNow({
        workspace_slug: workspaceSlug,
        workspace_id: workspaceId,
        agent_id,
        business_id: businessId,
      });
      if (!res.ok) setError(res.error);
      router.refresh();
    });
  };

  const rotate = (id: string) => {
    startTransition(async () => {
      const res = await rotateWebhookSecret({
        workspace_slug: workspaceSlug,
        schedule_id: id,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setRevealedSecret({
        scheduleId: id,
        url: `${triggerOrigin}/api/triggers/${res.data.secret}`,
      });
      router.refresh();
    });
  };

  const createCron = () => {
    if (!agentId) return setError("Kies eerst een agent.");
    if (!cronExpr.trim()) return setError("Vul een cron-expressie in.");
    if (!cronPrompt.trim()) return setError("Vul een prompt in.");
    setError(null);
    startTransition(async () => {
      const callback = `${triggerOrigin}/api/runs/CRON_RUN_ID/result`;
      const res = await createCronSchedule({
        workspace_slug: workspaceSlug,
        workspace_id: workspaceId,
        agent_id: agentId,
        business_id: businessId,
        cron_expr: cronExpr,
        prompt: cronPrompt,
        callback_url: callback,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setCronOpen(false);
      setCronPrompt("");
      router.refresh();
    });
  };

  const remove = (id: string) => {
    startTransition(async () => {
      const res = await deleteSchedule({
        workspace_slug: workspaceSlug,
        schedule_id: id,
      });
      if (!res.ok) setError(res.error);
      router.refresh();
    });
  };

  if (agents.length === 0) {
    return (
      <div className="empty-state">
        <h2>Eerst een agent aanmaken</h2>
        <p>
          Schedules vuren een agent af. Maak eerst minstens één agent in
          deze business aan.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      <section
        style={{
          border: "1.5px solid var(--app-border)",
          borderRadius: 14,
          padding: 16,
          background: "var(--app-card)",
        }}
      >
        <h2
          style={{
            fontFamily: "var(--hand)",
            fontSize: 22,
            fontWeight: 700,
            margin: "0 0 12px",
          }}
        >
          Nieuwe schedule
        </h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr auto",
            gap: 12,
            alignItems: "end",
          }}
        >
          <label style={{ fontSize: 12, fontWeight: 600 }}>
            <span style={{ display: "block", marginBottom: 4 }}>Agent</span>
            <select
              value={agentId}
              onChange={(e) => setAgentId(e.target.value)}
              style={inputStyle}
            >
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} · {a.provider}
                </option>
              ))}
            </select>
          </label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              disabled={pending}
              onClick={() => triggerNow(agentId)}
              style={btnSecondary(pending)}
            >
              ▶ Run now
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={createWebhook}
              style={btnPrimary(pending)}
            >
              + Webhook URL
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => setCronOpen((v) => !v)}
              style={btnSecondary(pending)}
            >
              + Cron
            </button>
          </div>
        </div>

        {cronOpen && (
          <div
            style={{
              marginTop: 14,
              padding: 12,
              background: "var(--app-card-2)",
              borderRadius: 10,
              border: "1.5px dashed var(--app-border)",
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            <label style={{ fontSize: 12, fontWeight: 600 }}>
              <span style={{ display: "block", marginBottom: 4 }}>
                Cron-expressie ({CRON_EXAMPLES.join(" / ")})
              </span>
              <input
                value={cronExpr}
                onChange={(e) => setCronExpr(e.target.value)}
                style={inputStyle}
                placeholder="0 9 * * *"
              />
            </label>
            <label style={{ fontSize: 12, fontWeight: 600 }}>
              <span style={{ display: "block", marginBottom: 4 }}>
                Prompt — wat moet de agent doen?
              </span>
              <textarea
                value={cronPrompt}
                onChange={(e) => setCronPrompt(e.target.value)}
                rows={3}
                style={{ ...inputStyle, resize: "vertical", minHeight: 70 }}
                placeholder="Genereer een script voor vandaag's video over …"
              />
            </label>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button type="button" onClick={() => setCronOpen(false)} style={btnSecondary(pending)}>
                Annuleer
              </button>
              <button type="button" disabled={pending} onClick={createCron} style={btnPrimary(pending)}>
                Aanmaken
              </button>
            </div>
            <p style={{ fontSize: 11, color: "var(--app-fg-3)", margin: 0 }}>
              Cron schedules vereisen een geconfigureerde ANTHROPIC_API_KEY
              op de server (Claude Routines). Zonder key faalt de aanmaak
              direct met een duidelijke error.
            </p>
          </div>
        )}
        <p
          style={{
            color: "var(--app-fg-3)",
            fontSize: 11.5,
            marginTop: 10,
          }}
        >
          Webhook = externe trigger via een geheime URL. Run now =
          queue een handmatige run die de dispatcher meteen oppakt.
          Cron = Claude Routines met cron-expressie (vereist Anthropic key).
        </p>
        {error && (
          <p role="alert" style={errStyle}>
            {error}
          </p>
        )}
        {revealedSecret && (
          <div
            style={{
              marginTop: 14,
              padding: 12,
              background: "rgba(57,178,85,0.08)",
              border: "1.5px solid var(--tt-green)",
              borderRadius: 10,
              fontSize: 12,
            }}
          >
            <strong style={{ color: "var(--tt-green)" }}>
              Sla deze URL nu op — wordt niet opnieuw getoond.
            </strong>
            <code
              style={{
                display: "block",
                marginTop: 6,
                padding: 8,
                background: "var(--app-card-2)",
                borderRadius: 6,
                wordBreak: "break-all",
                fontSize: 11,
              }}
            >
              {revealedSecret.url}
            </code>
          </div>
        )}
      </section>

      <section>
        <h2
          style={{
            fontFamily: "var(--hand)",
            fontSize: 22,
            fontWeight: 700,
            margin: "0 0 10px",
          }}
        >
          Bestaande schedules
        </h2>
        {schedules.length === 0 ? (
          <p
            style={{
              color: "var(--app-fg-3)",
              fontSize: 13,
              padding: "16px",
              border: "1.5px dashed var(--app-border)",
              borderRadius: 12,
            }}
          >
            Nog geen schedules — maak er hierboven één aan.
          </p>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
              gap: 12,
            }}
          >
            {schedules.map((s) => {
              const agent = agents.find((a) => a.id === s.agent_id);
              return (
                <div
                  key={s.id}
                  style={{
                    border: "1.5px solid var(--app-border)",
                    borderRadius: 14,
                    padding: 14,
                    background: "var(--app-card)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 8,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        letterSpacing: "0.16em",
                        textTransform: "uppercase",
                        color:
                          s.kind === "webhook"
                            ? "var(--tt-green)"
                            : s.kind === "cron"
                              ? "var(--amber)"
                              : "var(--app-fg-3)",
                      }}
                    >
                      {s.kind}
                    </span>
                    {s.last_fired_at && (
                      <span
                        style={{ fontSize: 11, color: "var(--app-fg-3)" }}
                      >
                        laatst {new Date(s.last_fired_at).toLocaleString("nl-NL")}
                      </span>
                    )}
                  </div>
                  <div
                    style={{
                      fontWeight: 700,
                      fontSize: 14,
                      marginTop: 4,
                      color: "var(--app-fg)",
                    }}
                  >
                    {agent?.name ?? "Onbekende agent"}
                  </div>
                  {s.cron_expr && (
                    <code
                      style={{
                        display: "block",
                        marginTop: 6,
                        fontSize: 11,
                        color: "var(--app-fg-2)",
                      }}
                    >
                      {s.cron_expr}
                    </code>
                  )}
                  <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
                    {s.kind === "webhook" && (
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => rotate(s.id)}
                        style={btnSecondary(pending)}
                      >
                        Roteer secret
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => remove(s.id)}
                      style={{ ...btnSecondary(pending), borderColor: "var(--rose)", color: "var(--rose)" }}
                    >
                      Verwijderen
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

const CRON_EXAMPLES = ["0 9 * * *", "*/30 * * * *", "0 9 * * MON"];

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "var(--app-card-2)",
  border: "1.5px solid var(--app-border)",
  color: "var(--app-fg)",
  padding: "9px 11px",
  borderRadius: 9,
  fontFamily: "var(--type)",
  fontSize: 13.5,
};

const btnPrimary = (pending: boolean): React.CSSProperties => ({
  padding: "8px 14px",
  border: "1.5px solid var(--tt-green)",
  background: "var(--tt-green)",
  color: "#fff",
  borderRadius: 10,
  fontWeight: 700,
  fontSize: 12.5,
  cursor: pending ? "wait" : "pointer",
  opacity: pending ? 0.8 : 1,
});

const btnSecondary = (pending: boolean): React.CSSProperties => ({
  padding: "8px 14px",
  border: "1.5px solid var(--app-border)",
  background: "var(--app-card-2)",
  color: "var(--app-fg)",
  borderRadius: 10,
  fontWeight: 700,
  fontSize: 12,
  cursor: pending ? "wait" : "pointer",
  opacity: pending ? 0.7 : 1,
});

const errStyle: React.CSSProperties = {
  color: "var(--rose)",
  background: "rgba(230,82,107,0.08)",
  border: "1px solid rgba(230,82,107,0.4)",
  borderRadius: 10,
  padding: "8px 10px",
  marginTop: 12,
  fontSize: 12.5,
};
