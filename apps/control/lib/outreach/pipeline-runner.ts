import "server-only";

import { createHash, randomBytes } from "node:crypto";

import { resolveApiKey } from "../api-keys/resolve";
import { getServiceRoleSupabase } from "../supabase/service";
import { OUTREACH_PIPELINE_STAGES } from "./pipeline-stages";

type StageKey = (typeof OUTREACH_PIPELINE_STAGES)[number]["key"];

type PipelineConfig = {
  id: string;
  workspace_id: string;
  business_id: string;
  enabled: boolean;
  interval_seconds: number;
  batch_size: number;
  delivery_mode: "local_outbox";
  last_started_at: string | null;
  last_finished_at: string | null;
  last_error: string | null;
  total_cycles: number;
  total_outreached_count: number;
  total_duplicate_skipped: number;
};

type PipelineRun = {
  id: string;
  workspace_id: string;
  business_id: string;
  config_id: string | null;
};

type LeadRow = {
  id: string;
  workspace_id: string;
  business_id: string;
  legacy_id: number | null;
  vps_lead_id: number | null;
  token: string | null;
  lead_name: string | null;
  lead_email: string | null;
  lead_website: string | null;
  lead_branche: string | null;
  lead_regio: string | null;
  telefoon: string | null;
  contact_url: string | null;
  status: string | null;
  pitch: string | null;
  angle: string | null;
  html_content: string | null;
  score: number | null;
  angle_scores: Record<string, number> | null;
  freebie_generated_at: string | null;
  freebie_path: string | null;
};

type ProcessContext = {
  firecrawlKey: string | null;
  publicOrigin: string;
};

type ProcessResult =
  | { kind: "outreached"; leadId: string }
  | { kind: "duplicate"; leadId: string }
  | { kind: "error"; leadId: string; error: string };

const inProcessConfigs = new Set<string>();

export async function tickOutreachPipeline(): Promise<void> {
  const supabase = getServiceRoleSupabase();
  const { data, error } = await supabase
    .from("outreach_pipeline_configs")
    .select(
      "id, workspace_id, business_id, enabled, interval_seconds, batch_size, delivery_mode, last_started_at, last_finished_at, last_error, total_cycles, total_outreached_count, total_duplicate_skipped",
    )
    .eq("enabled", true);
  if (error) {
    console.error("[outreach-pipeline] config query failed", error);
    return;
  }

  const configs = ((data ?? []) as PipelineConfig[]).filter((config) =>
    isDue(config),
  );
  for (const config of configs) {
    void runOutreachPipelineCycle(config.id).catch((err) => {
      console.error("[outreach-pipeline] cycle failed", err);
    });
  }
}

export async function runOutreachPipelineCycle(
  configId: string,
  opts: { force?: boolean } = {},
): Promise<{
  ok: boolean;
  status: "done" | "failed" | "skipped";
  claimed: number;
  outreached: number;
  duplicates: number;
  errors: number;
  error?: string;
}> {
  if (inProcessConfigs.has(configId)) {
    return {
      ok: true,
      status: "skipped",
      claimed: 0,
      outreached: 0,
      duplicates: 0,
      errors: 0,
    };
  }
  inProcessConfigs.add(configId);

  const supabase = getServiceRoleSupabase();
  let config: PipelineConfig | null = null;
  let run: PipelineRun | null = null;
  const startedAt = new Date().toISOString();

  try {
    const { data: configRow, error: configError } = await supabase
      .from("outreach_pipeline_configs")
      .select(
        "id, workspace_id, business_id, enabled, interval_seconds, batch_size, delivery_mode, last_started_at, last_finished_at, last_error, total_cycles, total_outreached_count, total_duplicate_skipped",
      )
      .eq("id", configId)
      .maybeSingle();
    if (configError || !configRow) {
      throw new Error(configError?.message ?? "Pipeline config not found.");
    }
    config = configRow as PipelineConfig;
    if (!opts.force && (!config.enabled || !isDue(config))) {
      return {
        ok: true,
        status: "skipped",
        claimed: 0,
        outreached: 0,
        duplicates: 0,
        errors: 0,
      };
    }

    await reapStaleRuns(config);
    if (await hasActiveRun(config)) {
      return {
        ok: true,
        status: "skipped",
        claimed: 0,
        outreached: 0,
        duplicates: 0,
        errors: 0,
      };
    }

    const { data: runRow, error: runError } = await supabase
      .from("outreach_pipeline_runs")
      .insert({
        workspace_id: config.workspace_id,
        business_id: config.business_id,
        config_id: config.id,
        status: "running",
        started_at: startedAt,
      })
      .select("id, workspace_id, business_id, config_id")
      .single();
    if (runError || !runRow) {
      throw new Error(runError?.message ?? "Could not create pipeline run.");
    }
    run = runRow as PipelineRun;

    await supabase
      .from("outreach_pipeline_configs")
      .update({
        last_started_at: startedAt,
        last_error: null,
        total_cycles: (config.total_cycles ?? 0) + 1,
      })
      .eq("id", config.id);

    await emit(run, "lead_finder", "ping", "Cycle gestart.");

    const { data: claimedRows, error: claimError } = await supabase.rpc(
      "claim_outreach_pipeline_leads",
      {
        p_workspace_id: config.workspace_id,
        p_business_id: config.business_id,
        p_run_id: run.id,
        p_limit: config.batch_size,
      },
    );
    if (claimError) throw new Error(claimError.message);

    const leads = (claimedRows ?? []) as LeadRow[];
    await supabase
      .from("outreach_pipeline_runs")
      .update({ claimed_count: leads.length })
      .eq("id", run.id);

    if (leads.length === 0) {
      await emit(run, "lead_finder", "skip", "Geen eligible leads.");
      await finishRun(config, run, {
        status: "done",
        claimed: 0,
        outreached: 0,
        duplicates: 0,
        errors: 0,
      });
      return {
        ok: true,
        status: "done",
        claimed: 0,
        outreached: 0,
        duplicates: 0,
        errors: 0,
      };
    }

    await emit(run, "lead_finder", "done", `${leads.length} lead(s) geclaimd.`);

    const ctx = await buildProcessContext(config);
    const results: ProcessResult[] = [];
    for (const lead of leads) {
      results.push(await processLead(config, run, lead, ctx));
    }

    const outreached = results.filter((r) => r.kind === "outreached").length;
    const duplicates = results.filter((r) => r.kind === "duplicate").length;
    const errors = results.filter((r) => r.kind === "error").length;

    await finishRun(config, run, {
      status: errors > 0 && outreached === 0 ? "failed" : "done",
      claimed: leads.length,
      outreached,
      duplicates,
      errors,
    });

    return {
      ok: errors === 0,
      status: errors > 0 && outreached === 0 ? "failed" : "done",
      claimed: leads.length,
      outreached,
      duplicates,
      errors,
      error:
        errors > 0
          ? results.find((r): r is Extract<ProcessResult, { kind: "error" }> =>
              r.kind === "error",
            )?.error
          : undefined,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (run) {
      await emit(run, "qa_gate", "error", message);
      await supabase
        .from("outreach_pipeline_runs")
        .update({
          status: "failed",
          error_count: 1,
          ended_at: new Date().toISOString(),
        })
        .eq("id", run.id);
    }
    if (config) {
      await supabase
        .from("outreach_pipeline_configs")
        .update({
          last_error: message,
          last_finished_at: new Date().toISOString(),
        })
        .eq("id", config.id);
    }
    return {
      ok: false,
      status: "failed",
      claimed: 0,
      outreached: 0,
      duplicates: 0,
      errors: 1,
      error: message,
    };
  } finally {
    inProcessConfigs.delete(configId);
  }
}

function isDue(config: PipelineConfig): boolean {
  const last = config.last_started_at ?? config.last_finished_at;
  if (!last) return true;
  return Date.now() - new Date(last).getTime() >= config.interval_seconds * 1000;
}

async function reapStaleRuns(config: PipelineConfig): Promise<void> {
  const supabase = getServiceRoleSupabase();
  const staleCutoff = new Date(Date.now() - 15 * 60_000).toISOString();
  await supabase
    .from("outreach_pipeline_runs")
    .update({
      status: "failed",
      error_count: 1,
      ended_at: new Date().toISOString(),
    })
    .eq("config_id", config.id)
    .eq("status", "running")
    .lt("started_at", staleCutoff);
}

async function hasActiveRun(config: PipelineConfig): Promise<boolean> {
  const supabase = getServiceRoleSupabase();
  const { count, error } = await supabase
    .from("outreach_pipeline_runs")
    .select("id", { count: "exact", head: true })
    .eq("config_id", config.id)
    .eq("status", "running");
  if (error) {
    console.error("[outreach-pipeline] active run check failed", error);
    return true;
  }
  return Boolean(count && count > 0);
}

async function buildProcessContext(
  config: PipelineConfig,
): Promise<ProcessContext> {
  const supabase = getServiceRoleSupabase();
  const { data: workspace } = await supabase
    .from("workspaces")
    .select("owner_id")
    .eq("id", config.workspace_id)
    .maybeSingle();
  const ownerId = (workspace?.owner_id as string | null) ?? null;
  const firecrawlKey = await resolveApiKey("firecrawl", {
    workspaceId: config.workspace_id,
    businessId: config.business_id,
    credentialOwnerUserId: ownerId,
  });
  return {
    firecrawlKey,
    publicOrigin:
      process.env.OUTREACH_PUBLIC_ORIGIN ??
      process.env.NEXT_PUBLIC_APP_ORIGIN ??
      process.env.NEXT_PUBLIC_TRIGGER_ORIGIN ??
      "https://aio.tromptech.life",
  };
}

async function processLead(
  config: PipelineConfig,
  run: PipelineRun,
  lead: LeadRow,
  ctx: ProcessContext,
): Promise<ProcessResult> {
  const supabase = getServiceRoleSupabase();
  try {
    const leadLabel = clean(lead.lead_name) ?? "naam onbekend";
    await emit(run, "lead_finder", "done", `Lead: ${leadLabel}`, lead.id);

    await emit(run, "firecrawl_scout", "ping", "Website context ophalen.", lead.id);
    const scrape = await scrapeLead(lead, ctx.firecrawlKey);
    await emit(
      run,
      "firecrawl_scout",
      scrape.usedFirecrawl ? "done" : "skip",
      scrape.usedFirecrawl
        ? "Firecrawl context toegevoegd."
        : "Geen Firecrawl scrape nodig/beschikbaar.",
      lead.id,
      { chars: scrape.markdown.length },
    );

    await emit(run, "score_agent", "ping", "Lead scoren.", lead.id);
    const scores = scoreLead(lead, scrape.markdown);
    const score = aggregateScore(scores);
    await emit(run, "score_agent", "done", `Score ${score}.`, lead.id, scores);

    await emit(run, "angle_writer", "ping", "Angle schrijven.", lead.id);
    const angle = buildAngle(lead, scrape.markdown, score);
    await emit(run, "angle_writer", "done", angle, lead.id);

    await emit(run, "freebie_builder", "ping", "Freebie rapport bouwen.", lead.id);
    const token = lead.token ?? mintToken();
    const url = `${ctx.publicOrigin}/r/${token}`;
    const proposal = buildAutomationProposal(lead, scrape.markdown);
    const pitch = buildPitch(lead, angle, proposal, url);
    const html = buildFreebieHtml(lead, scores, angle, proposal);
    await emit(run, "freebie_builder", "done", "Rapport klaar.", lead.id, {
      url,
    });

    await emit(run, "proposal_agent", "done", proposal, lead.id);

    await emit(run, "qa_gate", "ping", "Duplicate check + QA.", lead.id);
    const destinationKey = buildDestinationKey(lead);
    const checksum = checksumFor(config.workspace_id, destinationKey);
    const duplicate = await findDuplicateDestination(
      config.workspace_id,
      lead.id,
      checksum,
    );
    if (duplicate) {
      await supabase
        .from("outreach_leads")
        .update({
          status: "rejected",
          rejection_reason:
            "Duplicate destination already processed by outreach pipeline.",
          outreach_pipeline_error: `Duplicate of ${duplicate.id}`,
          outreach_pipeline_qa: {
            ok: false,
            reason: "duplicate_destination",
            duplicate_id: duplicate.id,
            destination_key: destinationKey,
          },
          outreach_pipeline_claimed_at: null,
        })
        .eq("id", lead.id);
      await emit(run, "qa_gate", "skip", "Duplicate destination.", lead.id, {
        duplicate_id: duplicate.id,
      });
      return { kind: "duplicate", leadId: lead.id };
    }

    const qa = qaLead({ lead, score, pitch, url, destinationKey });
    if (!qa.ok) {
      await supabase
        .from("outreach_leads")
        .update({
          outreach_pipeline_error: qa.reason,
          outreach_pipeline_qa: qa,
          outreach_pipeline_claimed_at: null,
        })
        .eq("id", lead.id);
      await emit(run, "qa_gate", "error", qa.reason, lead.id, qa);
      return { kind: "error", leadId: lead.id, error: qa.reason };
    }
    await emit(run, "qa_gate", "qa", "QA akkoord.", lead.id, qa);

    await emit(run, "outreach_sender", "ping", "Outreach in local outbox.", lead.id);
    const nowIso = new Date().toISOString();
    const { error: updateError } = await supabase
      .from("outreach_leads")
      .update({
        token,
        vps_lead_id: lead.vps_lead_id ?? lead.legacy_id,
        html_content: html,
        score,
        angle_scores: scores,
        angle,
        pitch,
        status: "outreached",
        sent_via: "aio_pipeline_local_outbox",
        freebie_generated_at: lead.freebie_generated_at ?? nowIso,
        freebie_path: `/r/${token}`,
        wa_link: buildWhatsAppLink(lead.telefoon, pitch),
        outreach_automation_proposal: proposal,
        outreach_pipeline_qa: qa,
        outreach_pipeline_outreached_at: nowIso,
        outreach_sent_checksum: checksum,
        outreach_pipeline_claimed_at: null,
        outreach_pipeline_error: null,
      })
      .eq("id", lead.id)
      .is("outreach_pipeline_outreached_at", null)
      .is("sent_at", null);
    if (updateError) throw new Error(updateError.message);

    await emit(
      run,
      "outreach_sender",
      "metric",
      "Lead geoutreached.",
      lead.id,
      { url },
      1,
    );
    return { kind: "outreached", leadId: lead.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await supabase
      .from("outreach_leads")
      .update({
        outreach_pipeline_error: message,
        outreach_pipeline_claimed_at: null,
      })
      .eq("id", lead.id);
    await emit(run, "qa_gate", "error", message, lead.id);
    return { kind: "error", leadId: lead.id, error: message };
  }
}

async function finishRun(
  config: PipelineConfig,
  run: PipelineRun,
  result: {
    status: "done" | "failed";
    claimed: number;
    outreached: number;
    duplicates: number;
    errors: number;
  },
): Promise<void> {
  const supabase = getServiceRoleSupabase();
  const endedAt = new Date().toISOString();
  await supabase
    .from("outreach_pipeline_runs")
    .update({
      status: result.status,
      claimed_count: result.claimed,
      outreached_count: result.outreached,
      duplicate_skipped_count: result.duplicates,
      error_count: result.errors,
      ended_at: endedAt,
    })
    .eq("id", run.id);

  await supabase
    .from("outreach_pipeline_configs")
    .update({
      last_finished_at: endedAt,
      last_error: result.errors > 0 ? `${result.errors} lead(s) failed QA` : null,
      total_outreached_count:
        (config.total_outreached_count ?? 0) + result.outreached,
      total_duplicate_skipped:
        (config.total_duplicate_skipped ?? 0) + result.duplicates,
    })
    .eq("id", config.id);
}

async function emit(
  run: PipelineRun,
  stage: StageKey,
  eventType: "ping" | "done" | "skip" | "error" | "metric" | "qa",
  message: string,
  leadId?: string | null,
  payload?: unknown,
  deltaOutreached = 0,
): Promise<void> {
  const supabase = getServiceRoleSupabase();
  const stageSpec =
    OUTREACH_PIPELINE_STAGES.find((item) => item.key === stage) ??
    OUTREACH_PIPELINE_STAGES[0];
  const { error } = await supabase.from("outreach_pipeline_events").insert({
    run_id: run.id,
    workspace_id: run.workspace_id,
    business_id: run.business_id,
    lead_id: leadId ?? null,
    stage,
    agent_name: stageSpec.agent,
    event_type: eventType,
    message,
    delta_outreached: deltaOutreached,
    payload: payload == null ? null : payload,
  });
  if (error) {
    console.error("[outreach-pipeline] event insert failed", error);
  }
}

async function scrapeLead(
  lead: LeadRow,
  firecrawlKey: string | null,
): Promise<{ markdown: string; usedFirecrawl: boolean }> {
  const website = normalizeUrl(lead.lead_website);
  if (!website || !firecrawlKey) {
    return { markdown: "", usedFirecrawl: false };
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 18_000);
  try {
    const res = await fetch("https://api.firecrawl.dev/v2/scrape", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${firecrawlKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url: website,
        formats: ["markdown"],
        onlyMainContent: true,
        maxAge: 172800000,
        timeout: 15000,
      }),
      signal: controller.signal,
    });
    if (!res.ok) return { markdown: "", usedFirecrawl: false };
    const json = (await res.json()) as {
      data?: { markdown?: string };
      markdown?: string;
    };
    const markdown = (json.data?.markdown ?? json.markdown ?? "").slice(0, 5000);
    return { markdown, usedFirecrawl: markdown.length > 0 };
  } catch {
    return { markdown: "", usedFirecrawl: false };
  } finally {
    clearTimeout(timeout);
  }
}

function scoreLead(
  lead: LeadRow,
  markdown: string,
): Record<"A" | "B" | "C" | "D" | "E", number> {
  const body = [lead.pitch, lead.lead_branche, lead.lead_regio, markdown]
    .filter(Boolean)
    .join("\n")
    .toLowerCase();
  const hasWebsite = Boolean(clean(lead.lead_website));
  const hasEmail = Boolean(clean(lead.lead_email));
  const hasPhone = Boolean(clean(lead.telefoon));
  const hasRegion = Boolean(clean(lead.lead_regio));
  const hasBranch = Boolean(clean(lead.lead_branche));
  return {
    A: hasWebsite ? 8 : 4,
    B: body.includes("whatsapp") || hasPhone ? 8 : 6,
    C: hasBranch && hasRegion ? 8 : 5,
    D:
      body.includes("afspraak") ||
      body.includes("contact") ||
      body.includes("offerte")
        ? 8
        : 6,
    E: hasEmail || hasPhone ? 8 : 5,
  };
}

function aggregateScore(scores: Record<string, number>): number {
  const values = Object.values(scores);
  return Math.round(
    (values.reduce((sum, value) => sum + value, 0) / values.length) * 10,
  );
}

function buildAngle(lead: LeadRow, markdown: string, score: number): string {
  const branch = clean(lead.lead_branche) ?? "lokale dienstverlener";
  const region = clean(lead.lead_regio) ?? "de regio";
  const websiteSignal = markdown
    ? "Ik zag genoeg website-context om een concreet verbeterpunt te pakken."
    : clean(lead.lead_website)
      ? "De website geeft genoeg aanleiding voor een snelle intake/follow-up verbetering."
      : "De vindbaarheid en eerste reactie kunnen waarschijnlijk direct scherper.";
  return `${branch} in ${region}: digitale score ${score}. ${websiteSignal}`;
}

function buildAutomationProposal(lead: LeadRow, markdown: string): string {
  const branch = clean(lead.lead_branche) ?? "jullie bedrijf";
  const hasAppointmentSignal = /afspraak|boeken|reserver|intake|offerte/i.test(
    markdown,
  );
  if (hasAppointmentSignal) {
    return `Gratis automation voorstel: een intake-flow die aanvragen uit website, mail en WhatsApp samenvat, kwalificeert en direct een opvolgbericht klaarzet.`;
  }
  return `Gratis automation voorstel: een simpele lead-opvolger voor ${branch} die gemiste vragen opvangt, contactgegevens structureert en warme leads automatisch klaarzet voor opvolging.`;
}

function buildPitch(
  lead: LeadRow,
  angle: string,
  proposal: string,
  reportUrl: string,
): string {
  const name = clean(lead.lead_name) ?? "daar";
  return [
    `Hoi ${name},`,
    "",
    `Ik heb kort naar jullie online eerste indruk gekeken. ${angle}`,
    "",
    `Ik heb er een gratis mini-rapport van gemaakt: ${reportUrl}`,
    "",
    proposal,
    "",
    "Wij bouwen dit als een bewezen systeem: lead vinden, site/context checken, score bepalen, rapport maken, automation voorstel toevoegen en daarna strak opvolgen. Als je wilt, kan ik de eerste versie voor jullie uitwerken.",
    "",
    "Groet,",
    "TrompTech",
  ].join("\n");
}

function buildFreebieHtml(
  lead: LeadRow,
  scores: Record<"A" | "B" | "C" | "D" | "E", number>,
  angle: string,
  proposal: string,
): string {
  const name = clean(lead.lead_name) ?? "Onbekende lead";
  const website = clean(lead.lead_website);
  const branche = clean(lead.lead_branche);
  const regio = clean(lead.lead_regio);
  const score = aggregateScore(scores);
  const date = new Intl.DateTimeFormat("nl-NL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date());

  const sections = [
    ["Website scan", scores.A, website ?? "Geen duidelijke website gevonden."],
    [
      "Reactiesnelheid",
      scores.B,
      "Maak reageren laagdrempelig via WhatsApp, mail of een korte intake.",
    ],
    [
      "Lokale positie",
      scores.C,
      `${branche ?? "De branche"} in ${regio ?? "de regio"} is lokaal zoekgedreven.`,
    ],
    ["Automation kans", scores.D, proposal],
    ["Outreach angle", scores.E, angle],
  ] as const;

  return `<!doctype html>
<html lang="nl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>TrompTech analyse - ${escapeHtml(name)}</title>
  <style>
    :root { color-scheme: light; --green:#39b255; --ink:#1c1f1d; --muted:#68716b; --line:#d8ddd7; --paper:#f7f8f4; }
    * { box-sizing: border-box; }
    body { margin:0; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color:var(--ink); background:#e9ece6; }
    main { max-width: 880px; margin: 0 auto; min-height: 100vh; background: var(--paper); padding: 34px 38px 30px; }
    header { display:flex; justify-content:space-between; gap:22px; border-bottom:1px solid var(--line); padding-bottom:20px; margin-bottom:24px; }
    .brand { font-weight:800; letter-spacing:0; }
    .brand span { color:var(--green); }
    .tag { border:1px solid rgba(57,178,85,.28); background:rgba(57,178,85,.09); color:#257f3c; border-radius:999px; padding:6px 12px; font-size:12px; font-weight:700; height:max-content; }
    h1 { font-size:34px; line-height:1.05; margin:0 0 10px; letter-spacing:0; }
    .meta { display:flex; flex-wrap:wrap; gap:8px 14px; color:var(--muted); font-size:13px; }
    .hero { display:grid; grid-template-columns:1fr auto; gap:20px; align-items:end; margin-bottom:22px; }
    .score { text-align:right; font-weight:800; font-size:38px; color:var(--green); }
    .score small { display:block; font-size:11px; color:var(--muted); text-transform:uppercase; letter-spacing:.12em; margin-top:2px; }
    .grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:14px; }
    section { background:#fff; border:1px solid var(--line); border-radius:10px; padding:16px; box-shadow:0 1px 0 rgba(0,0,0,.03); }
    section.wide { grid-column:1 / -1; }
    .section-head { display:flex; align-items:center; gap:10px; margin-bottom:10px; padding-bottom:10px; border-bottom:1px solid #edf0ea; }
    .nr { color:var(--green); font-size:12px; font-weight:800; letter-spacing:.1em; }
    h2 { font-size:16px; margin:0; flex:1; }
    .badge { border:1px solid var(--green); color:var(--green); border-radius:6px; padding:2px 7px; font-size:12px; font-weight:800; }
    p { margin:0; color:#3e4641; line-height:1.62; font-size:14px; }
    footer { margin-top:24px; padding-top:16px; border-top:1px solid var(--line); display:flex; justify-content:space-between; gap:16px; color:var(--muted); font-size:13px; }
    a { color:#20833a; font-weight:700; }
    @media (max-width: 720px) { main { padding:24px 18px; } .hero, .grid { grid-template-columns:1fr; } .score { text-align:left; } section.wide { grid-column:auto; } }
  </style>
</head>
<body>
  <main>
    <header><div class="brand">Tromp<span>Tech</span></div><div class="tag">Gratis analyse</div></header>
    <div class="hero">
      <div>
        <h1>${escapeHtml(name)}</h1>
        <div class="meta">
          ${website ? `<span>${escapeHtml(website)}</span>` : ""}
          ${branche ? `<span>${escapeHtml(branche)}</span>` : ""}
          ${regio ? `<span>${escapeHtml(regio)}</span>` : ""}
          <span>${escapeHtml(date)}</span>
        </div>
      </div>
      <div class="score">${score}<small>digitale score</small></div>
    </div>
    <div class="grid">
      ${sections
        .map(
          ([title, sectionScore, body], index) => `<section class="${index === 3 ? "wide" : ""}">
        <div class="section-head"><span class="nr">${String(index + 1).padStart(2, "0")}</span><h2>${escapeHtml(title)}</h2><span class="badge">${sectionScore}/10</span></div>
        <p>${escapeHtml(body)}</p>
      </section>`,
        )
        .join("")}
    </div>
    <footer>
      <span>Opgesteld door TrompTech</span>
      <a href="https://wa.me/31649556856">WhatsApp +31 6 49 55 68 56</a>
    </footer>
  </main>
</body>
</html>`;
}

function qaLead(input: {
  lead: LeadRow;
  score: number;
  pitch: string;
  url: string;
  destinationKey: string;
}): { ok: true; score: number; destination_key: string } | { ok: false; reason: string } {
  if (!input.lead.lead_name?.trim()) return { ok: false, reason: "Lead mist naam." };
  if (!input.destinationKey) return { ok: false, reason: "Lead mist destination key." };
  if (!input.pitch.includes(input.url)) {
    return { ok: false, reason: "Pitch mist rapport-URL." };
  }
  if (input.score < 45) return { ok: false, reason: "Lead score te laag." };
  return {
    ok: true,
    score: input.score,
    destination_key: input.destinationKey,
  };
}

async function findDuplicateDestination(
  workspaceId: string,
  leadId: string,
  checksum: string,
): Promise<{ id: string } | null> {
  const supabase = getServiceRoleSupabase();
  const { data } = await supabase
    .from("outreach_leads")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("outreach_sent_checksum", checksum)
    .neq("id", leadId)
    .limit(1)
    .maybeSingle();
  return (data as { id: string } | null) ?? null;
}

function buildDestinationKey(lead: LeadRow): string {
  const email = clean(lead.lead_email)?.toLowerCase();
  if (email && /.+@.+\..+/.test(email)) return `email:${email}`;
  const phone = (lead.telefoon ?? "").replace(/\D/g, "");
  if (phone.length >= 8) return `phone:${phone}`;
  const domain = domainFromUrl(lead.lead_website);
  if (domain) return `domain:${domain}`;
  return `lead:${lead.id}`;
}

function checksumFor(workspaceId: string, destinationKey: string): string {
  return createHash("sha256")
    .update(`${workspaceId}:${destinationKey}`)
    .digest("hex");
}

function buildWhatsAppLink(phone: string | null | undefined, pitch: string): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (digits.length < 8) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(pitch)}`;
}

function mintToken(): string {
  return randomBytes(8).toString("base64url").slice(0, 11);
}

function normalizeUrl(value: string | null | undefined): string | null {
  const trimmed = clean(value);
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function domainFromUrl(value: string | null | undefined): string | null {
  const normalized = normalizeUrl(value);
  if (!normalized) return null;
  try {
    return new URL(normalized).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return null;
  }
}

function clean(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
