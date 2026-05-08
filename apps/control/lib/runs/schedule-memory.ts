import "server-only";

import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
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
  const root = scheduleMemoryRoot();
  return path.join(/* turbopackIgnore: true */ root, scheduleId);
}

function statusPath(scheduleId: string): string {
  return path.join(scheduleDir(scheduleId), "status.md");
}

function resourcesPath(scheduleId: string): string {
  return path.join(scheduleDir(scheduleId), "resources.md");
}

export async function ensureScheduleMemoryFiles(
  schedule: ScheduleMemorySource,
): Promise<{ statusFile: string; resourcesFile: string }> {
  const dir = scheduleDir(schedule.id);
  const statusFile = statusPath(schedule.id);
  const resourcesFile = resourcesPath(schedule.id);
  await mkdir(/* turbopackIgnore: true */ dir, { recursive: true });

  if (!(await fileExists(statusFile))) {
    await writeStatusFile(schedule, []);
  }
  if (!(await fileExists(resourcesFile))) {
    await writeFile(
      /* turbopackIgnore: true */ resourcesFile,
      [
        "# Persistent resources / contracts",
        "",
        "No persistent resources recorded yet.",
        "",
        "- Add stable Supabase tables, dashboard slugs, file paths, external sheets/APIs, or other durable resources here.",
        "- Reuse listed resources before creating new Supabase tables, dashboards, or files.",
        "",
      ].join("\n"),
      "utf8",
    );
  }

  return { statusFile, resourcesFile };
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
  const files = await ensureScheduleMemoryFiles(schedule);
  const entries = await readStatusEntries(schedule);
  const resourcesText = await readFile(
    /* turbopackIgnore: true */ files.resourcesFile,
    "utf8",
  ).catch(() => "");
  const resources = compactResources(resourcesText);
  const lastRuns =
    entries.length > 0
      ? entries
          .map((entry) => {
            const duration =
              entry.duration_ms != null
                ? `, ${Math.round(entry.duration_ms / 1000)}s`
                : "";
            return [
              `- ${entry.ended_at}`,
              `${entry.status}${duration}`,
              `run ${shortId(entry.run_id)}: ${entry.summary}`,
            ].join(" | ");
          })
          .join("\n")
      : "- Nog geen eerdere runstatus voor deze schedule.";

  return [
    "<schedule_memory>",
    `Schedule: ${schedule.title || schedule.kind || "cron"} (${schedule.id})`,
    `Files: status=${files.statusFile} resources=${files.resourcesFile}`,
    "Laatste 3 runstatussen:",
    lastRuns,
    "Vaste resources/contracts:",
    resources ||
      "- Nog niets vastgelegd. Check bestaande Supabase tabellen/resources voordat je nieuwe maakt.",
    "Regels:",
    "- Hergebruik resources hierboven.",
    "- Maak niet elke run nieuwe Supabase tabellen/files/dashboards.",
    "- Als je een duurzame resource kiest of maakt, zet in je eindantwoord `Resource note: ...` zodat AIO resources.md kan bijwerken.",
    "</schedule_memory>",
  ].join("\n");
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
    await appendResourceNotes(input.schedule, notes);
  }
}

async function readStatusEntries(
  schedule: ScheduleMemorySource,
): Promise<StatusEntry[]> {
  const text = await readFile(
    /* turbopackIgnore: true */ statusPath(schedule.id),
    "utf8",
  ).catch(() => "");
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
      ? entries
          .map((entry) => {
            const duration =
              entry.duration_ms != null
                ? ` (${Math.round(entry.duration_ms / 1000)}s)`
                : "";
            return [
              `- ${entry.ended_at}`,
              `${entry.status}${duration}`,
              `run ${shortId(entry.run_id)}: ${entry.summary}`,
            ].join(" | ");
          })
          .join("\n")
      : "- Nog geen eerdere runstatus.";
  await writeFile(
    /* turbopackIgnore: true */ statusPath(schedule.id),
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
    "utf8",
  );
}

async function appendResourceNotes(
  schedule: ScheduleMemorySource,
  notes: string[],
): Promise<void> {
  const file = resourcesPath(schedule.id);
  const current = await readFile(
    /* turbopackIgnore: true */ file,
    "utf8",
  ).catch(() => "");
  const lower = current.toLowerCase();
  const unique = notes.filter((note) => !lower.includes(note.toLowerCase()));
  if (unique.length === 0) return;
  const base = current.replace("No persistent resources recorded yet.\n\n", "");
  await writeFile(
    /* turbopackIgnore: true */ file,
    `${base.trimEnd()}\n${unique.map((note) => `- ${note}`).join("\n")}\n`,
    "utf8",
  );
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

function compactResources(text: string): string {
  const cleaned = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .filter((line) => line !== "No persistent resources recorded yet.")
    .join("\n");
  if (cleaned.length <= MAX_RESOURCE_PROMPT_CHARS) return cleaned;
  return `${cleaned.slice(0, MAX_RESOURCE_PROMPT_CHARS)}\n- ... resources.md truncated; inspect the file directly if needed.`;
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
