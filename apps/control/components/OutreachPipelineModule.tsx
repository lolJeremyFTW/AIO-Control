"use client";

import { useEffect, useMemo, useState, useTransition } from "react";

import {
  generateOutreachPipelineBlueprint,
  generateOutreachPipelineStep,
  runOutreachPipelineNow,
  updateOutreachPipelineConfig,
} from "../app/actions/outreach-pipeline";
import { OUTREACH_PIPELINE_STAGES } from "../lib/outreach/pipeline-stages";
import { getSupabaseBrowserClient } from "../lib/supabase/client";

type PipelineStep = {
  id: string;
  label: string;
  agent: string;
  task: string;
  handoff: string;
  provider: string;
  model: string;
  agent_id: string | null;
  context_policy: "handoff_only" | "none";
  needs: string;
  qa_rule: string;
  positive_prompt: string;
  negative_prompt: string;
};

type PipelineBlueprint = {
  pipeline_id: string;
  pipeline_name: string;
  orchestrator_agent_id: string | null;
  learning_enabled: boolean;
  correction_rules: string[];
  steps: PipelineStep[];
};

type PipelineSet = {
  active_pipeline_id: string;
  pipelines: PipelineBlueprint[];
};

type Config = {
  id: string;
  enabled: boolean;
  interval_seconds: number;
  batch_size: number;
  last_started_at: string | null;
  last_finished_at: string | null;
  last_error: string | null;
  total_cycles: number;
  total_outreached_count: number;
  total_duplicate_skipped: number;
  pipeline_steps?: unknown;
  pipeline_blueprint?: unknown;
};

type RunRow = {
  id: string;
  status: string;
  claimed_count: number;
  outreached_count: number;
  duplicate_skipped_count: number;
  error_count: number;
  started_at: string;
  ended_at: string | null;
};

type EventRow = {
  id: number;
  run_id: string | null;
  stage: string;
  agent_name: string;
  event_type: "ping" | "done" | "skip" | "error" | "metric" | "qa";
  message: string | null;
  delta_outreached: number;
  created_at: string;
};

type Stats = {
  total: number;
  eligible: number;
  moduleOutreached: number;
  sent: number;
  pendingWhatsapp: number;
  failedQa24h: number;
};

type AgentOption = {
  id: string;
  name: string;
  provider: string;
  model: string | null;
  kind: string;
};

type Props = {
  workspaceSlug: string;
  businessSlug: string;
  workspaceId: string;
  businessId: string;
  navNodeId?: string | null;
  scopeName: string;
  scopeKind: "business" | "topic";
  config: Config | null;
  /** Outreach-lead metrics. Only pass on the outreach-specific pipeline page;
   *  generic pipeline pages leave this off so the metrics row is hidden. */
  stats?: Stats;
  recentRuns: RunRow[];
  recentEvents: EventRow[];
  agents: AgentOption[];
};

const PROVIDERS = [
  "openai_codex",
  "openclaw",
  "hermes",
  "claude",
  "claude_cli",
  "openrouter",
  "ollama",
  "minimax",
  "codex",
] as const;

export function OutreachPipelineModule({
  workspaceSlug,
  businessSlug,
  workspaceId,
  businessId,
  navNodeId = null,
  scopeName,
  scopeKind,
  config: initialConfig,
  stats,
  recentRuns,
  recentEvents,
  agents,
}: Props) {
  const [config, setConfig] = useState<Config | null>(initialConfig);
  const [events, setEvents] = useState<EventRow[]>(recentEvents);
  const [runs] = useState<RunRow[]>(recentRuns);
  const [intervalSeconds, setIntervalSeconds] = useState(
    initialConfig?.interval_seconds ?? 10,
  );
  const [batchSize, setBatchSize] = useState(initialConfig?.batch_size ?? 3);
  const initialPipelineSet = useMemo(
    () => normalizeBlueprintSet(initialConfig, agents),
    [initialConfig, agents],
  );
  const [pipelines, setPipelines] = useState<PipelineBlueprint[]>(
    initialPipelineSet.pipelines,
  );
  const [activePipelineId, setActivePipelineId] = useState(
    initialPipelineSet.active_pipeline_id,
  );
  const [blueprint, setBlueprint] = useState<PipelineBlueprint>(
    initialPipelineSet.pipelines.find(
      (pipeline) => pipeline.pipeline_id === initialPipelineSet.active_pipeline_id,
    ) ?? firstPipeline(initialPipelineSet),
  );
  const [outreached, setOutreached] = useState(stats?.moduleOutreached ?? 0);
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aiPrompt, setAiPrompt] = useState("");
  const [stepAiPrompts, setStepAiPrompts] = useState<Record<string, string>>({});
  const [generatingStepKey, setGeneratingStepKey] = useState<string | null>(null);
  const [collapsedStepIds, setCollapsedStepIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setConfig(initialConfig);
    setIntervalSeconds(initialConfig?.interval_seconds ?? 10);
    setBatchSize(initialConfig?.batch_size ?? 3);
    const next = normalizeBlueprintSet(initialConfig, agents);
    setPipelines(next.pipelines);
    setActivePipelineId(next.active_pipeline_id);
    setBlueprint(
      next.pipelines.find((pipeline) => pipeline.pipeline_id === next.active_pipeline_id) ??
        firstPipeline(next),
    );
  }, [initialConfig, agents]);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    const channel = supabase
      .channel(`outreach-pipeline-${businessId}-${navNodeId ?? "business"}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "aio_control",
          table: "outreach_pipeline_events",
          filter: `business_id=eq.${businessId}`,
        },
        (payload: { new: EventRow }) => {
          const event = payload.new;
          setEvents((prev) => [event, ...prev].slice(0, 80));
          if (event.delta_outreached > 0) {
            setOutreached((value) => value + event.delta_outreached);
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "aio_control",
          table: "outreach_pipeline_configs",
          filter: `business_id=eq.${businessId}`,
        },
        (payload: { new: Config }) => {
          setConfig(payload.new);
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [businessId, navNodeId]);

  const latestByStage = useMemo(() => {
    const map = new Map<string, EventRow>();
    for (const event of events) {
      if (!map.has(event.stage)) map.set(event.stage, event);
    }
    return map;
  }, [events]);

  const orchestrator = agents.find((agent) => agent.id === blueprint.orchestrator_agent_id);
  const running = config?.enabled ?? false;
  const lastRun = runs[0] ?? null;
  const visiblePipelines = syncActivePipeline(pipelines, activePipelineId, blueprint);
  const hasActivePipeline = visiblePipelines.some(
    (pipeline) => pipeline.pipeline_id === activePipelineId,
  );

  const save = (patch?: { enabled?: boolean }) => {
    setError(null);
    setInfo(null);
    startTransition(async () => {
      const res = await updateOutreachPipelineConfig({
        workspace_slug: workspaceSlug,
        business_slug: businessSlug,
        workspace_id: workspaceId,
        business_id: businessId,
        nav_node_id: navNodeId,
        enabled: patch?.enabled ?? config?.enabled ?? false,
        interval_seconds: intervalSeconds,
        batch_size: batchSize,
        pipeline_blueprint: serializePipelineSet(
          activePipelineId,
          pipelines,
          blueprint,
        ),
        pipeline_steps: hasActivePipeline ? blueprint.steps : [],
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setInfo("Pipeline opgeslagen.");
    });
  };

  const runNow = () => {
    setError(null);
    setInfo(null);
    startTransition(async () => {
      const res = await runOutreachPipelineNow({
        workspace_slug: workspaceSlug,
        business_slug: businessSlug,
        workspace_id: workspaceId,
        business_id: businessId,
        nav_node_id: navNodeId,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setInfo(
        `Cycle klaar: ${res.data.outreached} klaargezet in local outbox, ${res.data.duplicates} duplicate skips, ${res.data.errors} errors.`,
      );
    });
  };

  const updateStep = (index: number, patch: Partial<PipelineStep>) => {
    setBlueprint((current) => ({
      ...current,
      steps: current.steps.map((step, i) =>
        i === index ? { ...step, ...patch } : step,
      ),
    }));
  };

  const updateBlueprint = (patch: Partial<PipelineBlueprint>) => {
    setBlueprint((current) => ({ ...current, ...patch }));
  };

  const switchPipeline = (pipelineId: string) => {
    const saved = syncActivePipeline(pipelines, activePipelineId, blueprint);
    const next = saved.find((pipeline) => pipeline.pipeline_id === pipelineId);
    if (!next) return;
    setPipelines(saved);
    setActivePipelineId(pipelineId);
    setBlueprint(next);
  };

  const createPipeline = () => {
    const saved = syncActivePipeline(pipelines, activePipelineId, blueprint);
    const next = makeEmptyBlueprint(
      agents,
      `Pipeline ${saved.length + 1}`,
      `pipeline_${Date.now().toString(36)}`,
    );
    setPipelines([...saved, next]);
    setActivePipelineId(next.pipeline_id);
    setBlueprint(next);
    setInfo("Nieuwe pipeline aangemaakt. Stel hem in en klik Opslaan.");
  };

  const deletePipeline = () => {
    deletePipelineById(activePipelineId);
  };

  const deletePipelineById = (pipelineId: string) => {
    const saved = syncActivePipeline(pipelines, activePipelineId, blueprint);
    const remaining = saved.filter(
      (pipeline) => pipeline.pipeline_id !== pipelineId,
    );
    const nextActive =
      pipelineId === activePipelineId
        ? remaining[0]
        : saved.find((pipeline) => pipeline.pipeline_id === activePipelineId) ??
          remaining[0];
    const nextActiveId = nextActive?.pipeline_id ?? "";
    const nextBlueprint = nextActive ?? makeBlankBlueprint();

    setPipelines(remaining);
    setActivePipelineId(nextActiveId);
    setBlueprint(nextBlueprint);
    setError(null);
    setInfo(null);

    startTransition(async () => {
      const res = await updateOutreachPipelineConfig({
        workspace_slug: workspaceSlug,
        business_slug: businessSlug,
        workspace_id: workspaceId,
        business_id: businessId,
        nav_node_id: navNodeId,
        enabled: config?.enabled ?? false,
        interval_seconds: intervalSeconds,
        batch_size: batchSize,
        pipeline_blueprint: serializePipelineSet(
          nextActiveId,
          remaining,
          nextBlueprint,
        ),
        pipeline_steps: nextActive ? nextBlueprint.steps : [],
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setInfo("Pipeline verwijderd.");
    });
  };

  const generatePipelineWithAi = () => {
    const description = aiPrompt.trim();
    if (!description) {
      setError("Beschrijf eerst kort welke pipeline je wilt laten maken.");
      return;
    }
    setError(null);
    setInfo(null);
    startTransition(async () => {
      const res = await generateOutreachPipelineBlueprint({
        workspace_id: workspaceId,
        business_id: businessId,
        nav_node_id: navNodeId,
        scope_name: scopeName,
        description,
        agents,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      const next = normalizeBlueprint(res.data, agents, pipelines.length);
      const saved = syncActivePipeline(pipelines, activePipelineId, blueprint);
      const replaced = hasActivePipeline
        ? saved.map((pipeline) =>
            pipeline.pipeline_id === activePipelineId ? next : pipeline,
          )
        : [...saved, next];
      setPipelines(replaced);
      setActivePipelineId(next.pipeline_id);
      setBlueprint(next);
      setCollapsedStepIds(new Set());
      setInfo("AI pipeline aangemaakt. Controleer hem en klik Opslaan.");
    });
  };

  const generateStepWithAi = (index: number, stepKey: string) => {
    const step = blueprint.steps[index];
    if (!step) return;
    setError(null);
    setInfo(null);
    setGeneratingStepKey(stepKey);
    startTransition(async () => {
      const res = await generateOutreachPipelineStep({
        workspace_id: workspaceId,
        business_id: businessId,
        nav_node_id: navNodeId,
        scope_name: scopeName,
        pipeline_name: blueprint.pipeline_name,
        step_index: index + 1,
        request: stepAiPrompts[stepKey] ?? "",
        current_step: step,
        previous_steps: blueprint.steps.slice(0, index),
        next_steps: blueprint.steps.slice(index + 1),
        agents,
      });
      setGeneratingStepKey(null);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      const { explanation: _explanation, ...nextStep } = res.data;
      updateStep(index, {
        ...nextStep,
        id: nextStep.id || step.id,
      });
      setInfo(
        _explanation
          ? `Stap ${index + 1} door AI uitgewerkt: ${_explanation}`
          : `Stap ${index + 1} door AI uitgewerkt. Controleer hem en klik Opslaan.`,
      );
    });
  };

  const addStep = () => {
    setBlueprint((current) => ({
      ...current,
      steps: [
        ...current.steps,
        {
          id: `custom_${current.steps.length + 1}`,
          label: "Nieuwe stap",
          agent: "Subagent",
          task: "Voer een kleine, afgebakende taak uit.",
          handoff: "Geef alleen resultaat, bronnen en onzekerheden terug.",
          provider: "openai_codex",
          model: "",
          agent_id: null,
          context_policy: "handoff_only",
          needs: "Alleen de instructie van de orchestrator.",
          qa_rule: "Orchestrator controleert bruikbaarheid en risico.",
          positive_prompt: "Doe precies wat de orchestrator vraagt en lever compact bewijs.",
          negative_prompt: "Geen aannames, geen brede context ophalen, geen externe actie uitvoeren.",
        },
      ],
    }));
  };

  const removeStep = (index: number) => {
    setBlueprint((current) => ({
      ...current,
      steps: current.steps.filter((_, i) => i !== index),
    }));
  };

  const duplicateStep = (index: number) => {
    setBlueprint((current) => {
      const source = current.steps[index];
      if (!source) return current;
      const copy: PipelineStep = {
        ...source,
        id: `${source.id}_copy_${Date.now().toString(36)}`,
        label: `${source.label} kopie`,
      };
      const steps = [...current.steps];
      steps.splice(index + 1, 0, copy);
      return { ...current, steps };
    });
  };

  const toggleStepCollapsed = (stepKey: string) => {
    setCollapsedStepIds((current) => {
      const next = new Set(current);
      if (next.has(stepKey)) next.delete(stepKey);
      else next.add(stepKey);
      return next;
    });
  };

  const moveStep = (index: number, direction: -1 | 1) => {
    setBlueprint((current) => {
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= current.steps.length) return current;
      const steps = [...current.steps];
      const [item] = steps.splice(index, 1);
      if (!item) return current;
      steps.splice(nextIndex, 0, item);
      return { ...current, steps };
    });
  };

  const updateRule = (index: number, value: string) => {
    setBlueprint((current) => ({
      ...current,
      correction_rules: current.correction_rules.map((rule, i) =>
        i === index ? value : rule,
      ),
    }));
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <style>{`
        @keyframes pipelinePulse {
          0% { box-shadow: 0 0 0 0 rgba(57,178,85,.34); }
          70% { box-shadow: 0 0 0 9px rgba(57,178,85,0); }
          100% { box-shadow: 0 0 0 0 rgba(57,178,85,0); }
        }
        @keyframes pipelineFlow {
          from { stroke-dashoffset: 42; }
          to { stroke-dashoffset: 0; }
        }
      `}</style>

      <section style={panelStyle}>
        <div style={topRowStyle}>
          <div>
            <h2 style={titleStyle}>Pipelines - {scopeName}</h2>
            <p style={subStyle}>
              {scopeKind === "topic" ? "Topic" : "Business"} pipeline met main
              agent als orchestrator en QA. Subagents krijgen alleen de
              minimale handoff-context die ze nodig hebben.
            </p>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={createPipeline}
              style={primaryButtonStyle(false)}
            >
              + Nieuwe pipeline
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => save({ enabled: !running })}
              style={running ? dangerButtonStyle(pending) : primaryButtonStyle(pending)}
            >
              {running ? "Pauzeer loop" : "Start loop"}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={runNow}
              style={secondaryButtonStyle(pending)}
            >
              Run fast cycle
            </button>
          </div>
        </div>

        {stats && (
          <div style={metricsGridStyle}>
            <Metric label="Local outbox" value={outreached} accent="#39b255" />
            <Metric label="Eligible now" value={stats.eligible} />
            <Metric label="Alle leads" value={stats.total} />
            <Metric label="Sent" value={stats.sent} />
            <Metric label="WA klaar" value={stats.pendingWhatsapp} />
            <Metric label="QA errors 24h" value={stats.failedQa24h} accent="#c44d4d" />
          </div>
        )}

        <div style={pipelineSwitcherStyle}>
          <span style={pipelineSwitcherLabelStyle}>
            Pipelines op deze pagina
          </span>
          {visiblePipelines.length === 0 && (
            <span style={emptyChipStyle}>Nog geen pipeline op deze pagina</span>
          )}
          {visiblePipelines.map((pipeline) => {
            const active = pipeline.pipeline_id === activePipelineId;
            return (
              <span
                key={pipeline.pipeline_id}
                style={active ? activePipelineChipStyle : pipelineChipStyle}
              >
                <button
                  type="button"
                  onClick={() => switchPipeline(pipeline.pipeline_id)}
                  style={pipelineChipNameStyle}
                >
                  {pipeline.pipeline_name}
                </button>
                <button
                  type="button"
                  title="Pipeline verwijderen"
                  onClick={() => deletePipelineById(pipeline.pipeline_id)}
                  style={pipelineChipDeleteStyle}
                >
                  x
                </button>
              </span>
            );
          })}
        </div>

        <div style={aiBuilderStyle}>
          <Field label="AI pipeline aanmaken">
            <textarea
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              placeholder="Bijv. maak een sales pipeline met research, lead kwalificatie, contactformulier draft, QA en follow-up check."
              style={textareaStyle}
            />
          </Field>
          <button
            type="button"
            disabled={pending}
            onClick={generatePipelineWithAi}
            style={primaryButtonStyle(pending)}
          >
            AI maakt stappen
          </button>
        </div>

        {!hasActivePipeline ? (
          <div style={emptyStateStyle}>
            <strong>Lege pipeline pagina</strong>
            <span>
              Maak handmatig een pipeline of laat AI een voorstel bouwen. Er worden
              geen standaard stappen meer teruggezet nadat je alles verwijdert.
            </span>
          </div>
        ) : (
        <div style={settingsGridStyle}>
          <Field label="Pipeline naam">
            <input
              value={blueprint.pipeline_name}
              onChange={(e) => updateBlueprint({ pipeline_name: e.target.value })}
              style={inputStyle}
            />
          </Field>
          <Field
            label="Cycle interval (seconden)"
            help="Hoe lang deze pipeline wacht voordat hij opnieuw mag starten. De scanner kijkt regelmatig; dit getal voorkomt dat dezelfde pipeline continu blijft lopen."
          >
            <input
              type="number"
              min={5}
              max={3600}
              value={intervalSeconds}
              onChange={(e) => setIntervalSeconds(Number(e.target.value))}
              style={inputStyle}
            />
          </Field>
          <Field label="Batch size">
            <input
              type="number"
              min={1}
              max={25}
              value={batchSize}
              onChange={(e) => setBatchSize(Number(e.target.value))}
              style={inputStyle}
            />
          </Field>
          <Field label="Orchestrator / QA agent">
            <select
              value={blueprint.orchestrator_agent_id ?? ""}
              onChange={(e) =>
                updateBlueprint({ orchestrator_agent_id: e.target.value || null })
              }
              style={inputStyle}
            >
              <option value="">Kies main agent</option>
              {agents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name} - {agent.provider}
                </option>
              ))}
            </select>
          </Field>
          <div style={{ display: "flex", alignItems: "end", gap: 10 }}>
            <button
              type="button"
              disabled={pending}
              onClick={() => save()}
              style={secondaryButtonStyle(pending)}
            >
              Opslaan
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={deletePipeline}
              style={dangerButtonStyle(pending)}
            >
              Verwijder
            </button>
            <span style={subStyle}>
              Status:{" "}
              <strong style={{ color: running ? "#2f9347" : "var(--app-fg-3)" }}>
                {running ? "running" : "paused"}
              </strong>
              {config?.last_finished_at
                ? ` · laatste cycle ${timeAgo(config.last_finished_at)}`
                : ""}
            </span>
          </div>
        </div>
        )}

        {info && <p style={infoStyle}>{info}</p>}
        {error && <p style={errorStyle}>{error}</p>}
        {config?.last_error && !error && (
          <p style={errorStyle}>Laatste error: {config.last_error}</p>
        )}
      </section>

      {hasActivePipeline && (
      <section style={panelStyle}>
        <div style={topRowStyle}>
          <div>
            <h2 style={titleStyle}>{blueprint.pipeline_name}</h2>
            <p style={subStyle}>
              Orchestrator geeft per node exact mee wat nodig is. Subagents
              starten context-arm; QA en correcties landen terug bij de main agent.
            </p>
          </div>
          {lastRun && (
            <span style={pillStyle}>
              Laatste run: {lastRun.status} · {lastRun.outreached_count} prepared
            </span>
          )}
        </div>

        <PipelineGraphCanvas
          blueprint={blueprint}
          orchestratorName={orchestrator?.name ?? "Main agent"}
          latestByStage={latestByStage}
          running={running}
        />
      </section>
      )}

      {hasActivePipeline && (
      <section style={panelStyle}>
        <div style={topRowStyle}>
          <div>
            <h2 style={titleStyle}>Subagent stappen</h2>
            <p style={subStyle}>
              Elke stap mag een eigen provider/model hebben. Context blijft
              beperkt tot de handoff van de orchestrator. Gebruik per stap
              <strong>AI verbeter stap</strong> om alleen die ene subagent te
              onderbouwen.
            </p>
          </div>
          <button type="button" onClick={addStep} style={secondaryButtonStyle(false)}>
            + Stap
          </button>
        </div>

        <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
          {blueprint.steps.length === 0 && (
            <div style={emptyStateStyle}>
              <strong>Nog geen stappen</strong>
              <span>Voeg zelf stappen toe of laat AI de volledige pipeline invullen.</span>
            </div>
          )}
          {blueprint.steps.map((step, index) => {
            const stepKey = `${step.id}-${index}`;
            const collapsed = collapsedStepIds.has(stepKey);
            return (
            <div key={stepKey} style={stepEditorStyle}>
              <div style={stepEditorHeaderStyle}>
                <span style={stepNumberBadgeStyle}>{String(index + 1).padStart(2, "0")}</span>
                <input
                  value={step.label}
                  onChange={(e) => updateStep(index, { label: e.target.value })}
                  style={{ ...inputStyle, fontWeight: 800 }}
                />
                <div style={stepMoveGroupStyle}>
                  <button
                    type="button"
                    title="Stap omhoog"
                    disabled={index === 0}
                    onClick={() => moveStep(index, -1)}
                    style={iconButtonStyle(index === 0)}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    title="Stap omlaag"
                    disabled={index === blueprint.steps.length - 1}
                    onClick={() => moveStep(index, 1)}
                    style={iconButtonStyle(index === blueprint.steps.length - 1)}
                  >
                    ↓
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => duplicateStep(index)}
                  style={secondaryButtonStyle(false)}
                >
                  Dupliceer
                </button>
                <button
                  type="button"
                  onClick={() => toggleStepCollapsed(stepKey)}
                  style={secondaryButtonStyle(false)}
                >
                  {collapsed ? "Open" : "Klap in"}
                </button>
                <button
                  type="button"
                  onClick={() => generateStepWithAi(index, stepKey)}
                  disabled={pending || generatingStepKey === stepKey}
                  style={secondaryButtonStyle(pending || generatingStepKey === stepKey)}
                >
                  {generatingStepKey === stepKey ? "AI denkt..." : "AI verbeter stap"}
                </button>
                <button
                  type="button"
                  onClick={() => removeStep(index)}
                  style={dangerButtonStyle(false)}
                >
                  Verwijder
                </button>
              </div>
              {!collapsed && (
              <>
              <div style={{ marginTop: 10 }}>
                <Field
                  label="AI wens voor deze stap"
                  help="Optioneel. Beschrijf wat je wilt aanscherpen; leeg laten gebruikt de huidige velden als input."
                >
                  <textarea
                    value={stepAiPrompts[stepKey] ?? ""}
                    onChange={(e) =>
                      setStepAiPrompts((current) => ({
                        ...current,
                        [stepKey]: e.target.value,
                      }))
                    }
                    placeholder="Bijv. maak deze scrape-stap productieproof: dedupe, Google Places velden, Supabase schema, rate limits en QA."
                    style={{ ...textareaStyle, minHeight: 58 }}
                  />
                </Field>
              </div>
              <div style={stepFormGridStyle}>
                <Field label="Subagent naam">
                  <input
                    value={step.agent}
                    onChange={(e) => updateStep(index, { agent: e.target.value })}
                    style={inputStyle}
                  />
                </Field>
                <Field label="Bestaande agent">
                  <select
                    value={step.agent_id ?? ""}
                    onChange={(e) => {
                      const selected = agents.find((a) => a.id === e.target.value);
                      updateStep(index, {
                        agent_id: e.target.value || null,
                        provider: selected?.provider ?? step.provider,
                        model: selected?.model ?? step.model,
                        agent: selected?.name ?? step.agent,
                      });
                    }}
                    style={inputStyle}
                  >
                    <option value="">Ad-hoc subagent</option>
                    {agents.map((agent) => (
                      <option key={agent.id} value={agent.id}>
                        {agent.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Provider">
                  <select
                    value={step.provider}
                    onChange={(e) => updateStep(index, { provider: e.target.value })}
                    style={inputStyle}
                  >
                    {PROVIDERS.map((provider) => (
                      <option key={provider} value={provider}>
                        {provider}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Model">
                  <input
                    value={step.model}
                    placeholder="Default model"
                    onChange={(e) => updateStep(index, { model: e.target.value })}
                    style={inputStyle}
                  />
                </Field>
              </div>
              <div style={wideStepGridStyle}>
                <Field label="Wat de orchestrator doorgeeft">
                  <textarea
                    value={step.needs}
                    onChange={(e) => updateStep(index, { needs: e.target.value })}
                    style={textareaStyle}
                  />
                </Field>
                <Field label="Taak van deze subagent">
                  <textarea
                    value={step.task}
                    onChange={(e) => updateStep(index, { task: e.target.value })}
                    style={textareaStyle}
                  />
                </Field>
                <Field label="Output / handoff terug">
                  <textarea
                    value={step.handoff}
                    onChange={(e) => updateStep(index, { handoff: e.target.value })}
                    style={textareaStyle}
                  />
                </Field>
                <Field label="QA regel door orchestrator">
                  <textarea
                    value={step.qa_rule}
                    onChange={(e) => updateStep(index, { qa_rule: e.target.value })}
                    style={textareaStyle}
                  />
                </Field>
                <Field label="Positive prompt">
                  <textarea
                    value={step.positive_prompt}
                    onChange={(e) =>
                      updateStep(index, { positive_prompt: e.target.value })
                    }
                    style={textareaStyle}
                  />
                </Field>
                <Field label="Negative prompt">
                  <textarea
                    value={step.negative_prompt}
                    onChange={(e) =>
                      updateStep(index, { negative_prompt: e.target.value })
                    }
                    style={textareaStyle}
                  />
                </Field>
              </div>
              <label style={checkStyle}>
                <input
                  type="checkbox"
                  checked={step.context_policy === "handoff_only"}
                  onChange={(e) =>
                    updateStep(index, {
                      context_policy: e.target.checked ? "handoff_only" : "none",
                    })
                  }
                />
                Geen brede context; alleen orchestrator-handoff naar deze subagent.
              </label>
              </>
              )}
            </div>
            );
          })}
        </div>
      </section>
      )}

      {hasActivePipeline && (
      <section style={panelStyle}>
        <div style={topRowStyle}>
          <div>
            <h2 style={titleStyle}>Self-learning correcties</h2>
            <p style={subStyle}>
              De orchestrator gebruikt deze regels bij QA en mag nieuwe
              correcties toevoegen wanneer runs falen of handmatig worden aangepast.
            </p>
          </div>
          <label style={checkStyle}>
            <input
              type="checkbox"
              checked={blueprint.learning_enabled}
              onChange={(e) =>
                setBlueprint((current) => ({
                  ...current,
                  learning_enabled: e.target.checked,
                }))
              }
            />
            Self-learning actief
          </label>
        </div>
        <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
          {blueprint.correction_rules.map((rule, index) => (
            <div key={index} style={{ display: "flex", gap: 8 }}>
              <input
                value={rule}
                onChange={(e) => updateRule(index, e.target.value)}
                style={inputStyle}
              />
              <button
                type="button"
                onClick={() =>
                  setBlueprint((current) => ({
                    ...current,
                    correction_rules: current.correction_rules.filter((_, i) => i !== index),
                  }))
                }
                style={dangerButtonStyle(false)}
              >
                x
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() =>
              setBlueprint((current) => ({
                ...current,
                correction_rules: [
                  ...current.correction_rules,
                  "Als QA faalt: sla oorzaak op als regel en laat de relevante subagent opnieuw proberen.",
                ],
              }))
            }
            style={secondaryButtonStyle(false)}
          >
            + Correctieregel
          </button>
        </div>
      </section>
      )}

      <section style={panelStyle}>
        <h2 style={titleStyle}>Live event stream</h2>
        {events.length === 0 ? (
          <p style={{ ...subStyle, marginTop: 8 }}>
            Nog geen pipeline events. Start de loop of run een fast cycle.
          </p>
        ) : (
          <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
            {events.slice(0, 18).map((event) => (
              <div key={event.id} style={eventRowStyle(event.event_type)}>
                <span style={eventDotStyle(event.event_type)} />
                <strong style={{ minWidth: 132, fontSize: 12 }}>
                  {event.agent_name}
                </strong>
                <span style={{ flex: 1, color: "var(--app-fg-2)", fontSize: 12 }}>
                  {event.message ?? event.event_type}
                </span>
                {event.delta_outreached > 0 && (
                  <span style={deltaStyle}>+{event.delta_outreached}</span>
                )}
                <span style={{ color: "var(--app-fg-3)", fontSize: 11 }}>
                  {timeAgo(event.created_at)}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function PipelineGraph({
  blueprint,
  orchestratorName,
  latestByStage,
  running,
}: {
  blueprint: PipelineBlueprint;
  orchestratorName: string;
  latestByStage: Map<string, EventRow>;
  running: boolean;
}) {
  return (
    <div style={graphWrapStyle}>
      <div style={orchestratorStyle}>
        <span style={nodeStatusStyle("qa")}>ORCHESTRATOR + QA</span>
        <strong>{orchestratorName}</strong>
        <span style={graphSubStyle}>verdeelt taken · checkt output · leert regels</span>
      </div>
      <svg
        aria-hidden
        viewBox="0 0 1000 90"
        preserveAspectRatio="none"
        style={{ width: "100%", height: 70, display: "block" }}
      >
        <path
          d="M 500 0 C 500 42, 120 36, 80 82 M 500 0 C 500 42, 880 36, 920 82 M 500 0 L 500 82"
          fill="none"
          stroke="var(--app-border)"
          strokeWidth="3"
          strokeDasharray={running ? "10 8" : "0"}
          style={{ animation: running ? "pipelineFlow 1.3s linear infinite" : "none" }}
        />
      </svg>
      <div style={graphNodesStyle}>
        {blueprint.steps.map((step, index) => {
          const event = latestByStage.get(step.id);
          const fallbackEvent = latestByStage.get(
            OUTREACH_PIPELINE_STAGES[index]?.key ?? "",
          );
          const latest = event ?? fallbackEvent;
          const status = latest?.event_type ?? "skip";
          const active =
            latest &&
            Date.now() - new Date(latest.created_at).getTime() < 9000 &&
            latest.event_type !== "skip";
          return (
            <div key={`${step.id}-${index}`} style={agentNodeStyle(status, !!active)}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <span style={nodeIndexStyle}>{String(index + 1).padStart(2, "0")}</span>
                <span style={nodeStatusStyle(status)}>{status}</span>
              </div>
              <strong style={{ fontSize: 13 }}>{step.agent}</strong>
              <span style={{ color: "var(--app-fg-3)", fontSize: 11.5 }}>
                {step.provider}{step.model ? ` · ${step.model}` : ""}
              </span>
              <span style={{ color: "var(--app-fg-2)", fontSize: 11, lineHeight: 1.35 }}>
                {step.needs}
              </span>
              <span style={handoffStyle}>handoff: {step.handoff}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PipelineGraphCanvas({
  blueprint,
  orchestratorName,
  latestByStage,
  running,
}: {
  blueprint: PipelineBlueprint;
  orchestratorName: string;
  latestByStage: Map<string, EventRow>;
  running: boolean;
}) {
  return (
    <div style={graphWrapStyle}>
      <div style={graphCanvasStyle}>
        <div style={orchestratorStyle}>
          <div style={graphNodeHeaderStyle}>
            <span style={nodeStatusStyle("qa")}>ORCHESTRATOR + QA</span>
            <span style={graphSubStyle}>
              {blueprint.learning_enabled ? "learning on" : "learning off"}
            </span>
          </div>
          <strong style={{ fontSize: 15 }}>{orchestratorName}</strong>
          <span style={graphSubStyle}>
            splitst context, geeft handoffs, valideert output en schrijft correctieregels
          </span>
        </div>

        <div aria-hidden style={orchestratorBusStyle}>
          <span style={busLineStyle(running)} />
          <span style={busLabelStyle}>isolated handoffs</span>
        </div>

        <div style={graphNodesStyle}>
          {blueprint.steps.map((step, index) => {
            const event = latestByStage.get(step.id);
            const fallbackEvent = latestByStage.get(
              OUTREACH_PIPELINE_STAGES[index]?.key ?? "",
            );
            const latest = event ?? fallbackEvent;
            const status = latest?.event_type ?? "skip";
            const active =
              latest &&
              Date.now() - new Date(latest.created_at).getTime() < 9000 &&
              latest.event_type !== "skip";
            return (
              <div key={`${step.id}-${index}`} style={graphStageWrapStyle}>
                {index > 0 && <span aria-hidden style={stageArrowStyle}>--&gt;</span>}
                <div style={agentNodeStyle(status, !!active)}>
                  <div style={graphNodeHeaderStyle}>
                    <span style={nodeIndexStyle}>{String(index + 1).padStart(2, "0")}</span>
                    <span style={nodeStatusStyle(status)}>{status}</span>
                  </div>
                  <strong style={{ fontSize: 13 }}>{step.label}</strong>
                  <span style={{ color: "var(--app-fg)", fontSize: 12, fontWeight: 800 }}>
                    {step.agent}
                  </span>
                  <div style={providerRailStyle}>
                    <span>{step.provider}</span>
                    <span>{step.model || "default model"}</span>
                  </div>
                  <div style={miniBlockStyle}>
                    <span style={miniBlockLabelStyle}>needs</span>
                    <span>{truncate(step.needs, 96)}</span>
                  </div>
                  <div style={promptBadgesStyle}>
                    <span style={step.positive_prompt ? positiveBadgeStyle : mutedBadgeStyle}>
                      + prompt
                    </span>
                    <span style={step.negative_prompt ? negativeBadgeStyle : mutedBadgeStyle}>
                      - prompt
                    </span>
                    <span style={qaBadgeStyle}>QA</span>
                  </div>
                  <div style={handoffStyle}>
                    <span style={miniBlockLabelStyle}>handoff</span>
                    <span>{truncate(step.handoff, 110)}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div style={feedbackRowStyle}>
          <div style={feedbackCardStyle}>
            <strong>QA feedback loop</strong>
            <span>
              Orchestrator ontvangt alle outputs terug, toetst tegen de QA-regels
              en laat alleen de gefaalde stap opnieuw lopen.
            </span>
          </div>
          <div style={feedbackCardStyle}>
            <strong>Self-learning rules</strong>
            <span>
              {blueprint.correction_rules.length} actieve regel
              {blueprint.correction_rules.length === 1 ? "" : "s"} voor correcties,
              retries en guardrails.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: string;
}) {
  return (
    <div style={metricStyle}>
      <span style={metricLabelStyle}>{label}</span>
      <strong style={{ fontSize: 24, color: accent ?? "var(--app-fg)" }}>
        {value}
      </strong>
    </div>
  );
}

function Field({
  label,
  help,
  children,
}: {
  label: string;
  help?: string;
  children: React.ReactNode;
}) {
  return (
    <label style={{ display: "block", fontSize: 11.5, fontWeight: 700 }}>
      <span style={{ color: "var(--app-fg-3)", display: "block", marginBottom: 4 }}>
        {label}
      </span>
      {children}
      {help && (
        <span
          style={{
            display: "block",
            marginTop: 5,
            color: "var(--app-fg-3)",
            fontSize: 11,
            fontWeight: 500,
            lineHeight: 1.35,
          }}
        >
          {help}
        </span>
      )}
    </label>
  );
}

function normalizeBlueprintSet(config: Config | null, agents: AgentOption[]): PipelineSet {
  const raw = config?.pipeline_blueprint;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const obj = raw as Partial<PipelineBlueprint> & Partial<PipelineSet>;
    if (Array.isArray(obj.pipelines)) {
      const pipelines = obj.pipelines.map((pipeline, index) =>
        normalizeBlueprint(pipeline, agents, index),
      );
      const active =
        typeof obj.active_pipeline_id === "string" &&
        pipelines.some((pipeline) => pipeline.pipeline_id === obj.active_pipeline_id)
          ? obj.active_pipeline_id
          : pipelines[0]?.pipeline_id;
      return {
        active_pipeline_id: active ?? "",
        pipelines,
      };
    }
    const hasLegacyBlueprint =
      Array.isArray(obj.steps) ||
      typeof obj.pipeline_id === "string" ||
      typeof obj.pipeline_name === "string";
    if (!hasLegacyBlueprint) {
      return { active_pipeline_id: "", pipelines: [] };
    }
    const legacy = normalizeBlueprint(obj, agents, 0);
    return {
      active_pipeline_id: legacy.pipeline_id,
      pipelines: [legacy],
    };
  }
  return { active_pipeline_id: "", pipelines: [] };
}

function firstPipeline(set: PipelineSet): PipelineBlueprint {
  return set.pipelines[0] ?? makeBlankBlueprint();
}

function normalizeBlueprint(
  raw: Partial<Omit<PipelineBlueprint, "steps">> & {
    steps?: Array<Partial<PipelineStep>>;
  },
  agents: AgentOption[],
  index: number,
): PipelineBlueprint {
    const steps = Array.isArray(raw.steps) && raw.steps.length > 0
      ? raw.steps.map(normalizeStep)
      : [];
    return {
      pipeline_id: raw.pipeline_id || (index === 0 ? "main_pipeline" : `pipeline_${index + 1}`),
      pipeline_name: raw.pipeline_name || (index === 0 ? "Main pipeline" : `Pipeline ${index + 1}`),
      orchestrator_agent_id:
        typeof raw.orchestrator_agent_id === "string"
          ? raw.orchestrator_agent_id
          : defaultOrchestrator(agents),
      learning_enabled: raw.learning_enabled !== false,
      correction_rules:
        Array.isArray(raw.correction_rules) && raw.correction_rules.length > 0
          ? raw.correction_rules.filter((rule): rule is string => typeof rule === "string")
          : [],
      steps,
    };
}

function normalizeStep(raw: Partial<PipelineStep>): PipelineStep {
  return {
    id: raw.id || "step",
    label: raw.label || "Stap",
    agent: raw.agent || "Subagent",
    task: raw.task || "Taak uitvoeren.",
    handoff: raw.handoff || "Resultaat teruggeven.",
    provider: raw.provider || "openai_codex",
    model: raw.model || "",
    agent_id: raw.agent_id ?? null,
    context_policy: raw.context_policy === "none" ? "none" : "handoff_only",
    needs: raw.needs || raw.task || "Alleen de instructie van de orchestrator.",
    qa_rule: raw.qa_rule || "Orchestrator controleert output.",
    positive_prompt:
      raw.positive_prompt ||
      "Doe precies wat de orchestrator vraagt en lever compact bewijs.",
    negative_prompt:
      raw.negative_prompt ||
      "Geen aannames, geen brede context ophalen, geen externe actie uitvoeren.",
  };
}

function defaultOrchestrator(agents: AgentOption[]): string | null {
  return (
    agents.find((agent) => agent.kind === "router")?.id ??
    agents.find((agent) => agent.kind === "reviewer")?.id ??
    agents[0]?.id ??
    null
  );
}

function makeBlankBlueprint(): PipelineBlueprint {
  return {
    pipeline_id: "",
    pipeline_name: "",
    orchestrator_agent_id: null,
    learning_enabled: true,
    correction_rules: [],
    steps: [],
  };
}

function makeEmptyBlueprint(
  agents: AgentOption[],
  name: string,
  id: string,
): PipelineBlueprint {
  return {
    pipeline_id: id,
    pipeline_name: name,
    orchestrator_agent_id: defaultOrchestrator(agents),
    learning_enabled: true,
    correction_rules: [],
    steps: [],
  };
}

function syncActivePipeline(
  pipelines: PipelineBlueprint[],
  activePipelineId: string,
  active: PipelineBlueprint,
): PipelineBlueprint[] {
  if (!activePipelineId || !active.pipeline_id) return pipelines;
  const next = pipelines.map((pipeline) =>
    pipeline.pipeline_id === activePipelineId ? active : pipeline,
  );
  return next.some((pipeline) => pipeline.pipeline_id === activePipelineId)
    ? next
    : [active, ...next];
}

function serializePipelineSet(
  activePipelineId: string,
  pipelines: PipelineBlueprint[],
  active: PipelineBlueprint,
) {
  const synced = syncActivePipeline(pipelines, activePipelineId, active);
  if (synced.length === 0) {
    return {
      active_pipeline_id: "",
      pipelines: [],
      ...makeBlankBlueprint(),
    };
  }
  const selected =
    synced.find((pipeline) => pipeline.pipeline_id === activePipelineId) ??
    synced[0]!;
  return {
    active_pipeline_id: selected.pipeline_id,
    pipelines: synced,
    ...selected,
  };
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60_000);
  if (m < 1) return "net nu";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}u`;
  return `${Math.floor(h / 24)}d`;
}

function truncate(value: string, max: number): string {
  const text = value.trim();
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 3))}...`;
}

const panelStyle: React.CSSProperties = {
  border: "1.5px solid var(--app-border)",
  background: "var(--app-card)",
  borderRadius: 12,
  padding: 16,
};

const topRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  flexWrap: "wrap",
};

const titleStyle: React.CSSProperties = {
  fontFamily: "var(--hand)",
  fontSize: 22,
  fontWeight: 700,
  margin: 0,
};

const subStyle: React.CSSProperties = {
  fontSize: 12.5,
  color: "var(--app-fg-3)",
  margin: "4px 0 0",
  lineHeight: 1.45,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "var(--app-card-2)",
  border: "1.5px solid var(--app-border)",
  color: "var(--app-fg)",
  padding: "8px 10px",
  borderRadius: 8,
  fontFamily: "var(--type)",
  fontSize: 13,
};

const textareaStyle: React.CSSProperties = {
  ...inputStyle,
  minHeight: 72,
  resize: "vertical",
  lineHeight: 1.4,
};

const metricsGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
  gap: 10,
  marginTop: 16,
};

const settingsGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(180px, 1fr) 130px 120px minmax(220px, 1fr) auto",
  gap: 10,
  alignItems: "end",
  marginTop: 14,
};

const pipelineSwitcherStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  flexWrap: "wrap",
  marginTop: 14,
  paddingTop: 14,
  borderTop: "1px solid var(--app-border-2)",
};

const aiBuilderStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(220px, 1fr) auto",
  gap: 10,
  alignItems: "end",
  marginTop: 12,
};

const emptyStateStyle: React.CSSProperties = {
  display: "grid",
  gap: 4,
  padding: 14,
  marginTop: 12,
  border: "1px dashed var(--app-border)",
  borderRadius: 8,
  background: "var(--app-bg-soft)",
  color: "var(--app-fg-2)",
  fontSize: 12,
};

const pipelineSwitcherLabelStyle: React.CSSProperties = {
  color: "var(--app-fg-3)",
  fontSize: 11,
  fontWeight: 900,
  letterSpacing: ".08em",
  textTransform: "uppercase",
  marginRight: 4,
};

const emptyChipStyle: React.CSSProperties = {
  border: "1px dashed var(--app-border)",
  borderRadius: 8,
  padding: "7px 10px",
  color: "var(--app-fg-3)",
  fontSize: 12,
};

const pipelineChipStyle: React.CSSProperties = {
  border: "1px solid var(--app-border)",
  background: "var(--app-card-2)",
  color: "var(--app-fg-2)",
  borderRadius: 8,
  padding: "0 2px 0 10px",
  fontSize: 12,
  fontWeight: 800,
  display: "inline-flex",
  alignItems: "center",
  gap: 2,
};

const activePipelineChipStyle: React.CSSProperties = {
  ...pipelineChipStyle,
  border: "1.5px solid var(--tt-green)",
  background: "rgba(57,178,85,.1)",
  color: "var(--app-fg)",
};

const pipelineChipNameStyle: React.CSSProperties = {
  border: "none",
  background: "transparent",
  color: "inherit",
  font: "inherit",
  fontWeight: 800,
  padding: "7px 6px 7px 0",
  cursor: "pointer",
};

const pipelineChipDeleteStyle: React.CSSProperties = {
  border: "none",
  background: "transparent",
  color: "var(--rose)",
  fontSize: 13,
  fontWeight: 900,
  padding: "5px 8px",
  cursor: "pointer",
  lineHeight: 1,
};

const stepFormGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: 10,
};

const wideStepGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 10,
};

const metricStyle: React.CSSProperties = {
  border: "1px solid var(--app-border-2)",
  background: "var(--app-card-2)",
  borderRadius: 8,
  padding: "10px 12px",
  minHeight: 72,
  display: "flex",
  flexDirection: "column",
  justifyContent: "space-between",
};

const metricLabelStyle: React.CSSProperties = {
  fontSize: 10.5,
  color: "var(--app-fg-3)",
  textTransform: "uppercase",
  letterSpacing: ".08em",
  fontWeight: 800,
};

const infoStyle: React.CSSProperties = {
  color: "#2f9347",
  fontSize: 12.5,
  margin: "10px 0 0",
};

const errorStyle: React.CSSProperties = {
  color: "var(--rose)",
  background: "rgba(230,82,107,0.08)",
  border: "1px solid rgba(230,82,107,0.35)",
  borderRadius: 8,
  padding: "8px 10px",
  fontSize: 12.5,
  margin: "10px 0 0",
};

const graphWrapStyle: React.CSSProperties = {
  marginTop: 14,
  border: "1px solid var(--app-border-2)",
  background: "var(--app-card-2)",
  borderRadius: 8,
  overflowX: "auto",
};

const graphCanvasStyle: React.CSSProperties = {
  minWidth: 980,
  padding: 16,
  display: "flex",
  flexDirection: "column",
  gap: 12,
};

const orchestratorStyle: React.CSSProperties = {
  width: 460,
  margin: "0 auto",
  border: "1.5px solid var(--tt-green)",
  background: "rgba(57,178,85,.08)",
  borderRadius: 8,
  padding: 12,
  display: "flex",
  flexDirection: "column",
  gap: 5,
};

const graphSubStyle: React.CSSProperties = {
  color: "var(--app-fg-3)",
  fontSize: 11.5,
};

const graphNodeHeaderStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 8,
};

const orchestratorBusStyle: React.CSSProperties = {
  position: "relative",
  height: 34,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

function busLineStyle(running: boolean): React.CSSProperties {
  return {
    position: "absolute",
    left: 34,
    right: 34,
    top: 16,
    borderTop: "2px dashed var(--app-border)",
    animation: running ? "pipelineFlow 1.3s linear infinite" : "none",
  };
}

const busLabelStyle: React.CSSProperties = {
  position: "relative",
  background: "var(--app-card-2)",
  border: "1px solid var(--app-border)",
  borderRadius: 999,
  padding: "4px 10px",
  color: "var(--app-fg-3)",
  fontSize: 10.5,
  fontWeight: 900,
  letterSpacing: ".08em",
  textTransform: "uppercase",
};

const graphNodesStyle: React.CSSProperties = {
  display: "grid",
  gridAutoFlow: "column",
  gridAutoColumns: "minmax(230px, 260px)",
  gap: 18,
  alignItems: "stretch",
  overflowX: "auto",
  padding: "4px 2px 10px",
};

const graphStageWrapStyle: React.CSSProperties = {
  position: "relative",
  minWidth: 0,
};

const stageArrowStyle: React.CSSProperties = {
  position: "absolute",
  left: -17,
  top: 92,
  color: "var(--tt-green)",
  fontSize: 13,
  fontWeight: 900,
};

const providerRailStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 8,
  border: "1px solid var(--app-border-2)",
  background: "var(--app-card-2)",
  borderRadius: 7,
  padding: "5px 7px",
  color: "var(--app-fg-3)",
  fontSize: 10.5,
  fontWeight: 800,
};

const miniBlockStyle: React.CSSProperties = {
  border: "1px solid var(--app-border-2)",
  borderRadius: 7,
  padding: "6px 7px",
  color: "var(--app-fg-2)",
  fontSize: 11,
  lineHeight: 1.35,
  display: "flex",
  flexDirection: "column",
  gap: 3,
};

const miniBlockLabelStyle: React.CSSProperties = {
  color: "var(--app-fg-3)",
  fontSize: 9.5,
  fontWeight: 900,
  letterSpacing: ".08em",
  textTransform: "uppercase",
};

const promptBadgesStyle: React.CSSProperties = {
  display: "flex",
  gap: 5,
  flexWrap: "wrap",
};

const positiveBadgeStyle: React.CSSProperties = {
  border: "1px solid rgba(57,178,85,.35)",
  background: "rgba(57,178,85,.08)",
  color: "#2f9347",
  borderRadius: 999,
  padding: "2px 7px",
  fontSize: 10,
  fontWeight: 900,
};

const negativeBadgeStyle: React.CSSProperties = {
  border: "1px solid rgba(196,77,77,.35)",
  background: "rgba(196,77,77,.08)",
  color: "var(--rose)",
  borderRadius: 999,
  padding: "2px 7px",
  fontSize: 10,
  fontWeight: 900,
};

const mutedBadgeStyle: React.CSSProperties = {
  border: "1px solid var(--app-border-2)",
  background: "var(--app-card-2)",
  color: "var(--app-fg-3)",
  borderRadius: 999,
  padding: "2px 7px",
  fontSize: 10,
  fontWeight: 900,
};

const qaBadgeStyle: React.CSSProperties = {
  border: "1px solid rgba(124,92,191,.35)",
  background: "rgba(124,92,191,.08)",
  color: "#7c5cbf",
  borderRadius: 999,
  padding: "2px 7px",
  fontSize: 10,
  fontWeight: 900,
};

const feedbackRowStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 10,
};

const feedbackCardStyle: React.CSSProperties = {
  border: "1px solid var(--app-border-2)",
  background: "var(--app-card)",
  borderRadius: 8,
  padding: 10,
  display: "flex",
  flexDirection: "column",
  gap: 4,
  color: "var(--app-fg-2)",
  fontSize: 11.5,
  lineHeight: 1.4,
};

const stepEditorStyle: React.CSSProperties = {
  border: "1px solid var(--app-border-2)",
  background: "var(--app-card-2)",
  borderRadius: 8,
  padding: 12,
  display: "grid",
  gap: 10,
};

const stepEditorHeaderStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "34px minmax(0, 1fr) auto auto auto auto",
  gap: 8,
  alignItems: "center",
};

const stepNumberBadgeStyle: React.CSSProperties = {
  width: 30,
  height: 30,
  borderRadius: 8,
  border: "1px solid var(--app-border)",
  background: "var(--app-card)",
  color: "var(--app-fg-3)",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 10,
  fontWeight: 900,
  letterSpacing: ".08em",
};

const stepMoveGroupStyle: React.CSSProperties = {
  display: "inline-flex",
  gap: 4,
};

function iconButtonStyle(disabled: boolean): React.CSSProperties {
  return {
    width: 30,
    height: 30,
    borderRadius: 8,
    border: "1px solid var(--app-border)",
    background: "var(--app-card)",
    color: disabled ? "var(--app-fg-3)" : "var(--app-fg)",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.45 : 1,
    fontWeight: 900,
  };
}

const checkStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  color: "var(--app-fg-2)",
  fontSize: 12,
  fontWeight: 700,
};

const pillStyle: React.CSSProperties = {
  border: "1px solid var(--app-border-2)",
  background: "var(--app-card-2)",
  color: "var(--app-fg-3)",
  borderRadius: 999,
  padding: "6px 10px",
  fontSize: 11.5,
  fontWeight: 800,
};

function primaryButtonStyle(pending: boolean): React.CSSProperties {
  return buttonBase("var(--tt-green)", "#fff", "var(--tt-green)", pending);
}

function secondaryButtonStyle(pending: boolean): React.CSSProperties {
  return buttonBase("var(--app-card-2)", "var(--app-fg)", "var(--app-border)", pending);
}

function dangerButtonStyle(pending: boolean): React.CSSProperties {
  return buttonBase("rgba(196,77,77,.1)", "var(--rose)", "rgba(196,77,77,.35)", pending);
}

function buttonBase(
  background: string,
  color: string,
  borderColor: string,
  pending: boolean,
): React.CSSProperties {
  return {
    padding: "8px 13px",
    border: `1.5px solid ${borderColor}`,
    background,
    color,
    borderRadius: 8,
    fontWeight: 800,
    fontSize: 12.5,
    cursor: pending ? "wait" : "pointer",
    opacity: pending ? 0.68 : 1,
  };
}

function agentNodeStyle(
  status: EventRow["event_type"] | "skip",
  active: boolean,
): React.CSSProperties {
  const color = statusColor(status);
  return {
    border: `1.5px solid ${active ? color : "var(--app-border-2)"}`,
    background:
      status === "error"
        ? "rgba(196,77,77,.06)"
        : active
          ? "rgba(57,178,85,.07)"
          : "var(--app-card)",
    borderRadius: 8,
    padding: 12,
    minHeight: 280,
    display: "flex",
    flexDirection: "column",
    gap: 6,
    animation: active ? "pipelinePulse 1.25s ease-out infinite" : "none",
  };
}

const nodeIndexStyle: React.CSSProperties = {
  color: "var(--app-fg-3)",
  fontSize: 10,
  fontWeight: 900,
  letterSpacing: ".08em",
};

const handoffStyle: React.CSSProperties = {
  color: "#2f9347",
  background: "rgba(57,178,85,.07)",
  border: "1px solid rgba(57,178,85,.22)",
  borderRadius: 7,
  padding: "5px 7px",
  fontSize: 10.5,
  lineHeight: 1.35,
  marginTop: "auto",
  display: "flex",
  flexDirection: "column",
  gap: 3,
};

function nodeStatusStyle(status: EventRow["event_type"] | "skip" | "qa"): React.CSSProperties {
  const color = statusColor(status === "qa" ? "qa" : status);
  return {
    color,
    border: `1px solid ${color}`,
    borderRadius: 999,
    padding: "1px 6px",
    fontSize: 9.5,
    fontWeight: 900,
    textTransform: "uppercase",
  };
}

function eventRowStyle(status: EventRow["event_type"]): React.CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: 9,
    border: "1px solid var(--app-border-2)",
    background:
      status === "error" ? "rgba(196,77,77,.05)" : "var(--app-card-2)",
    borderRadius: 8,
    padding: "8px 10px",
  };
}

function eventDotStyle(status: EventRow["event_type"]): React.CSSProperties {
  return {
    width: 8,
    height: 8,
    borderRadius: 99,
    background: statusColor(status),
    flexShrink: 0,
  };
}

const deltaStyle: React.CSSProperties = {
  color: "#2f9347",
  border: "1px solid rgba(57,178,85,.35)",
  background: "rgba(57,178,85,.08)",
  borderRadius: 999,
  padding: "1px 7px",
  fontSize: 11,
  fontWeight: 900,
};

function statusColor(status: EventRow["event_type"] | "skip"): string {
  if (status === "error") return "#c44d4d";
  if (status === "qa") return "#7c5cbf";
  if (status === "metric" || status === "done") return "#39b255";
  if (status === "ping") return "#d4752a";
  return "var(--app-fg-3)";
}
