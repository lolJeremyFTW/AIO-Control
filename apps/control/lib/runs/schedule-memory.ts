import "server-only";

import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

export type ScheduleMemorySource = {
  id: string;
  title?: string | null;
  kind?: string | null;
  cron_expr?: string | null;
};

export type ScheduleRunMemoryInput = {
  schedule: ScheduleMemorySource;
  runId: string;
  status: string;
  endedAt: string;
  durationMs?: number | null;
  costCents?: number | null;
  outputText?: string | null;
  errorText?: string | null;
};

export type ScheduleMemoryFiles = {
  dir: string;
  statusFile: string;
  resourcesFile: string;
  metaFile: string;
};

export type ScheduleMemorySnapshot = {
  ok: true;
  version: 1;
  schedule: {
    id: string;
    title: string | null;
    kind: string | null;
    cron_expr: string | null;
  };
  files: ScheduleMemoryFiles;
  limits: {
    last_runs: number;
    summary_chars: number;
    resource_prompt_chars: number;
  };
  last_runs: StatusEntry[];
  resources: {
    text: string;
    line_count: number;
    truncated: boolean;
  };
  block: string;
};

type StatusEntry = {
  run_id: string;
  status: string;
  ended_at: string;
  duration_ms?: number | null;
  cost_cents?: number | null;
  summary: string;
};

const STATUS_MARKER = "aio:schedule-status:v1";
const MAX_STATUS_ENTRIES = 3;
const MAX_SUMMARY_CHARS = 520;
const MAX_RESOURCE_PROMPT_CHARS = 1200;
const PRODUCTION_SCHEDULE_MEMORY_ROOT =
  "/home/jeremy/aio-control/.aio/schedule-memory";
const LOCAL_SCHEDULE_MEMORY_ROOT =
  "C:\\Users\\jerem\\Desktop\\AIO-Control\\.aio\\schedule-memory";

function scheduleMemoryRoot(): string {
  const configured = envVar("AIO_SCHEDULE_MEMORY_DIR")?.trim();
  if (configured) return configured;
  if (envVar("NODE_ENV") === "production") {
    return PRODUCTION_SCHEDULE_MEMORY_ROOT;
  }
  return LOCAL_SCHEDULE_MEMORY_ROOT;
}

function envVar(name: string): string | undefined {
  return process.env[name];
}

function scheduleDir(scheduleId: string): string {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      scheduleId,
    )
  ) {
    throw new Error(`Invalid schedule id for memory path: ${scheduleId}`);
  }
  return path.join(
    /* turbopackIgnore: true */ scheduleMemoryRoot(),
    scheduleId,
  );
}

function memoryFiles(scheduleId: string): ScheduleMemoryFiles {
  const dir = scheduleDir(scheduleId);
  return {
    dir,
    statusFile: path.join(/* turbopackIgnore: true */ dir, "status.md"),
    resourcesFile: path.join(/* turbopackIgnore: true */ dir, "resources.md"),
    metaFile: path.join(/* turbopackIgnore: true */ dir, "meta.json"),
  };
}

export async function ensureScheduleMemoryFiles(
  schedule: ScheduleMemorySource,
): Promise<ScheduleMemoryFiles> {
  const files = memoryFiles(schedule.id);
  await mkdir(/* turbopackIgnore: true */ files.dir, { recursive: true });

  if (!(await fileExists(files.statusFile))) {
    await writeStatusFile(schedule, []);
  }
  if (!(await fileExists(files.resourcesFile))) {
    await writeTextFile(
      files.resourcesFile,
      [
        "# Persistent resources / contracts",
        "",
        "No persistent resources recorded yet.",
        "",
        "## Supabase tables",
        "- Add stable table names here when this schedule owns or reuses persistent data.",
        "",
        "## Dashboards / tabs / files",
        "- Add stable dashboard slugs, custom tab ids, file paths, sheets, APIs, or other durable resources here.",
        "",
        "## Rules",
        "- Reuse listed resources before creating new Supabase tables, dashboards, or files.",
        "- Prefer updating stable resources in-place over creating a new one each run.",
        "",
      ].join("\n"),
    );
  }
  await writeMetaFile(schedule, files);

  return files;
}

export async function deleteScheduleMemoryFiles(
  scheduleId: string,
): Promise<void> {
  await rm(/* turbopackIgnore: true */ scheduleDir(scheduleId), {
    recursive: true,
    force: true,
  });
}

export async function readScheduleMemoryBlock(
  schedule: ScheduleMemorySource,
): Promise<string> {
  return (await readScheduleMemorySnapshot(schedule)).block;
}

export async function readScheduleMemorySnapshot(
  schedule: ScheduleMemorySource,
  options?: { includeFullResources?: boolean; maxResourceChars?: number },
): Promise<ScheduleMemorySnapshot> {
  const files = await ensureScheduleMemoryFiles(schedule);
  const entries = await readStatusEntries(schedule);
  const resourcesText = await readTextFile(files.resourcesFile);
  const resources = compactResources(resourcesText, {
    includeFullResources: options?.includeFullResources,
    maxChars: options?.maxResourceChars ?? MAX_RESOURCE_PROMPT_CHARS,
  });
  const block = formatMemoryBlock(schedule, files, entries, resources.text);

  return {
    ok: true,
    version: 1,
    schedule: {
      id: schedule.id,
      title: schedule.title ?? null,
      kind: schedule.kind ?? null,
      cron_expr: schedule.cron_expr ?? null,
    },
    files,
    limits: {
      last_runs: MAX_STATUS_ENTRIES,
      summary_chars: MAX_SUMMARY_CHARS,
      resource_prompt_chars:
        options?.maxResourceChars ?? MAX_RESOURCE_PROMPT_CHARS,
    },
    last_runs: entries,
    resources,
    block,
  };
}

export async function recordScheduleRunMemory(
  input: ScheduleRunMemoryInput,
): Promise<void> {
  await ensureScheduleMemoryFiles(input.schedule);
  const entries = await readStatusEntries(input.schedule);
  const next: StatusEntry = {
    run_id: input.runId,
    status: input.status,
    ended_at: input.endedAt,
    duration_ms: input.durationMs ?? null,
    cost_cents: input.costCents ?? null,
    summary: summarizeRun(input),
  };
  const deduped = [
    next,
    ...entries.filter((entry) => entry.run_id !== input.runId),
  ].slice(0, MAX_STATUS_ENTRIES);
  await writeStatusFile(input.schedule, deduped);

  const notes = extractResourceNotes(
    `${input.outputText ?? ""}\n${input.errorText ?? ""}`,
  );
  if (notes.length > 0) {
    await appendScheduleResourceNotes(input.schedule, notes, {
      source: `run:${shortId(input.runId)}`,
    });
  }
}

export async function appendScheduleResourceNotes(
  schedule: ScheduleMemorySource,
  notes: string[],
  options?: { source?: string },
): Promise<{ added: number; resourcesFile: string }> {
  await ensureScheduleMemoryFiles(schedule);
  const files = memoryFiles(schedule.id);
  const current = await readTextFile(files.resourcesFile);
  const currentLower = current.toLowerCase();
  const source = normalizeText(options?.source ?? "agent").slice(0, 80);
  const unique = notes
    .map((note) => normalizeText(note).slice(0, 260))
    .filter(Boolean)
    .filter((note, idx, arr) => arr.indexOf(note) === idx)
    .filter((note) => !currentLower.includes(note.toLowerCase()));

  if (unique.length === 0) {
    return { added: 0, resourcesFile: files.resourcesFile };
  }

  const stamp = new Date().toISOString();
  const base = current
    .replace("No persistent resources recorded yet.\n\n", "")
    .trimEnd();
  const lines = unique.map((note) => `- ${stamp} | ${source} | ${note}`);
  await writeTextFile(files.resourcesFile, `${base}\n${lines.join("\n")}\n`);
  await writeMetaFile(schedule, files);
  return { added: unique.length, resourcesFile: files.resourcesFile };
}

async function readStatusEntries(
  schedule: ScheduleMemorySource,
): Promise<StatusEntry[]> {
  const text = await readTextFile(memoryFiles(schedule.id).statusFile);
  const match = text.match(
    new RegExp(`<!-- ${STATUS_MARKER}\\n([\\s\\S]*?)\\n-->`),
  );
  if (!match?.[1]) return [];
  try {
    const parsed = JSON.parse(match[1]) as StatusEntry[];
    return Array.isArray(parsed) ? parsed.slice(0, MAX_STATUS_ENTRIES) : [];
  } catch {
    return [];
  }
}

async function writeStatusFile(
  schedule: ScheduleMemorySource,
  entries: StatusEntry[],
): Promise<void> {
  const visible =
    entries.length > 0
      ? entries.map(formatStatusLine).join("\n")
      : "- Nog geen eerdere runstatus.";
  await writeTextFile(
    memoryFiles(schedule.id).statusFile,
    [
      "# Last 3 run statuses",
      "",
      `Schedule: ${schedule.title || schedule.kind || schedule.id}`,
      "",
      visible,
      "",
      `<!-- ${STATUS_MARKER}`,
      JSON.stringify(entries),
      "-->",
      "",
    ].join("\n"),
  );
}

async function writeMetaFile(
  schedule: ScheduleMemorySource,
  files: ScheduleMemoryFiles,
): Promise<void> {
  await writeTextFile(
    files.metaFile,
    `${JSON.stringify(
      {
        version: 1,
        schedule: {
          id: schedule.id,
          title: schedule.title ?? null,
          kind: schedule.kind ?? null,
          cron_expr: schedule.cron_expr ?? null,
        },
        files,
        limits: {
          last_runs: MAX_STATUS_ENTRIES,
          summary_chars: MAX_SUMMARY_CHARS,
          resource_prompt_chars: MAX_RESOURCE_PROMPT_CHARS,
        },
        updated_at: new Date().toISOString(),
        rules: [
          "Keep status.md to the last 3 run summaries.",
          "Keep resources.md for stable Supabase tables, dashboards, tabs, files, APIs, and other durable resources.",
          "Agents should reuse resources.md before creating new persistent resources.",
        ],
      },
      null,
      2,
    )}\n`,
  );
}

function formatMemoryBlock(
  schedule: ScheduleMemorySource,
  files: ScheduleMemoryFiles,
  entries: StatusEntry[],
  resources: string,
): string {
  const lastRuns =
    entries.length > 0
      ? entries.map(formatStatusLine).join("\n")
      : "- Nog geen eerdere runstatus voor deze schedule.";

  return [
    "<schedule_memory>",
    `Schedule: ${schedule.title || schedule.kind || "cron"} (${schedule.id})`,
    `Files: status=${files.statusFile} resources=${files.resourcesFile} meta=${files.metaFile}`,
    "Laatste 3 runstatussen:",
    lastRuns,
    "Vaste resources/contracts:",
    resources ||
      "- Nog niets vastgelegd. Check bestaande Supabase tabellen/resources voordat je nieuwe maakt.",
    "Regels:",
    "- Hergebruik resources hierboven.",
    "- Maak niet elke run nieuwe Supabase tabellen/files/dashboards.",
    "- Gebruik `aio__get_schedule_memory` voor meer detail als die tool beschikbaar is.",
    "- Gebruik `aio__remember_schedule_resource` of zet `Resource note: ...` in je eindantwoord wanneer je een duurzame resource kiest of maakt.",
    "</schedule_memory>",
  ].join("\n");
}

function formatStatusLine(entry: StatusEntry): string {
  const duration =
    entry.duration_ms != null
      ? ` (${Math.round(entry.duration_ms / 1000)}s)`
      : "";
  return [
    `- ${entry.ended_at}`,
    `${entry.status}${duration}`,
    `run ${shortId(entry.run_id)}: ${entry.summary}`,
  ].join(" | ");
}

function summarizeRun(input: ScheduleRunMemoryInput): string {
  if (input.errorText) {
    return sentences(`Mislukt: ${input.errorText}`, 2, MAX_SUMMARY_CHARS);
  }
  const text = input.outputText?.trim();
  if (!text) return "Run afgerond zonder tekstoutput.";
  return sentences(stripNoise(text), 3, MAX_SUMMARY_CHARS);
}

function extractResourceNotes(text: string): string[] {
  const notes: string[] = [];
  const re =
    /\b(?:resource note|schedule resource|persistent resource)\s*:\s*([^\n\r"]+)/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) && notes.length < 8) {
    const note = normalizeText(match[1] ?? "").slice(0, 260);
    if (note) notes.push(note);
  }
  return notes;
}

function compactResources(
  text: string,
  options: { includeFullResources?: boolean; maxChars: number },
): { text: string; line_count: number; truncated: boolean } {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .filter((line) => line !== "No persistent resources recorded yet.");
  const cleaned = lines.join("\n");
  if (options.includeFullResources || cleaned.length <= options.maxChars) {
    return { text: cleaned, line_count: lines.length, truncated: false };
  }

  const head = lines.slice(0, 8);
  const tail = lines.slice(-8);
  const compact = [
    ...head,
    "- ... resources.md truncated; call get_schedule_memory with include_full_resources=true if needed.",
    ...tail,
  ].join("\n");
  const textOut =
    compact.length <= options.maxChars
      ? compact
      : `${compact.slice(0, options.maxChars - 3)}...`;
  return { text: textOut, line_count: lines.length, truncated: true };
}

function stripNoise(text: string): string {
  return normalizeText(
    text
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/^resource note\s*:.+$/gim, " "),
  );
}

function sentences(
  text: string,
  maxSentences: number,
  maxChars: number,
): string {
  const normalized = normalizeText(text);
  const parts =
    normalized.match(/[^.!?]+[.!?]+(?:\s|$)/g)?.slice(0, maxSentences) ?? [];
  const sentenceText = normalizeText(parts.join(" "));
  const chosen = sentenceText || normalized;
  if (chosen.length <= maxChars) return chosen || "Geen samenvatting.";
  return chosen.length > maxChars
    ? `${chosen.slice(0, maxChars - 3)}...`
    : chosen;
}

function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

async function readTextFile(file: string): Promise<string> {
  return await readFile(/* turbopackIgnore: true */ file, "utf8").catch(
    () => "",
  );
}

async function writeTextFile(file: string, text: string): Promise<void> {
  const tmp = `${file}.${process.pid}.${Date.now()}.${Math.random()
    .toString(36)
    .slice(2)}.tmp`;
  await writeFile(/* turbopackIgnore: true */ tmp, text, "utf8");
  await rename(/* turbopackIgnore: true */ tmp, file);
}

async function fileExists(file: string): Promise<boolean> {
  try {
    await readFile(/* turbopackIgnore: true */ file, "utf8");
    return true;
  } catch {
    return false;
  }
}

function shortId(id: string): string {
  return id.replace(/-/g, "").slice(0, 8);
}
