export type ScheduleLabelSource = {
  id?: string | null;
  title?: string | null;
  kind?: string | null;
  cron_expr?: string | null;
  instructions?: string | null;
  agent_id?: string | null;
  business_id?: string | null;
  nav_node_id?: string | null;
};

export type RunScheduleLabelSource = {
  schedule_id?: string | null;
  schedules?: ScheduleLabelSource | null;
  input?: unknown;
  agent_id?: string | null;
  business_id?: string | null;
};

export function buildScheduleSnapshot(
  schedule: ScheduleLabelSource | null | undefined,
): ScheduleLabelSource | null {
  if (!schedule?.id) return null;
  return {
    id: schedule.id,
    title: clean(schedule.title),
    kind: clean(schedule.kind),
    cron_expr: clean(schedule.cron_expr),
  };
}

export function mergeScheduleSnapshotIntoInput(
  input: unknown,
  schedule: ScheduleLabelSource | null | undefined,
): unknown {
  const snapshot = buildScheduleSnapshot(schedule);
  if (!snapshot) return input ?? null;
  if (isRecord(input)) {
    return scheduleSnapshotFromRunInput(input)
      ? input
      : { ...input, schedule: snapshot };
  }
  return { schedule: snapshot };
}

export function scheduleSnapshotFromRunInput(
  input: unknown,
): ScheduleLabelSource | null {
  if (!isRecord(input) || !isRecord(input.schedule)) return null;
  const schedule = input.schedule;
  const id = clean(schedule.id);
  if (!id) return null;
  return {
    id,
    title: clean(schedule.title),
    kind: clean(schedule.kind),
    cron_expr: clean(schedule.cron_expr),
  };
}

export function readRunPrompt(input: unknown): string | null {
  if (!isRecord(input)) return null;
  const prompt = clean(input.prompt);
  return prompt && prompt.length > 0 ? prompt : null;
}

export function findMatchingScheduleForRun(
  run: RunScheduleLabelSource,
  schedules: ScheduleLabelSource[] | null | undefined,
): ScheduleLabelSource | null {
  if (!schedules || schedules.length === 0) return null;
  if (run.schedule_id) {
    const byId = schedules.find((s) => s.id === run.schedule_id);
    if (byId) return byId;
  }

  const prompt = readRunPrompt(run.input);
  if (!prompt) return null;
  const matches = schedules.filter((s) => {
    if (s.agent_id && run.agent_id && s.agent_id !== run.agent_id) return false;
    if (
      s.business_id !== undefined &&
      run.business_id !== undefined &&
      s.business_id !== run.business_id
    ) {
      return false;
    }
    return clean(s.instructions) === prompt;
  });
  return matches.length === 1 ? matches[0]! : null;
}

export function getRunScheduleLabel(
  run: RunScheduleLabelSource,
  schedules?: ScheduleLabelSource[] | null,
): string | null {
  const snapshot = scheduleSnapshotFromRunInput(run.input);
  const inferred = findMatchingScheduleForRun(run, schedules);
  const candidates = [run.schedules, snapshot, inferred].filter(
    Boolean,
  ) as ScheduleLabelSource[];

  for (const candidate of candidates) {
    const title = clean(candidate.title);
    if (title) return title;
  }
  for (const candidate of candidates) {
    const label = formatScheduleLabel(candidate, candidate.id ?? run.schedule_id);
    if (label) return label;
  }
  return run.schedule_id ? `schedule ${shortId(run.schedule_id)}` : null;
}

export function formatScheduleLabel(
  schedule: ScheduleLabelSource | null | undefined,
  scheduleId?: string | null,
): string | null {
  if (!schedule) return scheduleId ? `schedule ${shortId(scheduleId)}` : null;
  const title = clean(schedule.title);
  if (title) return title;

  const kind = clean(schedule.kind);
  const cronExpr = clean(schedule.cron_expr);
  if (kind === "cron" && cronExpr) return `cron ${cronExpr}`;
  if (kind) return `${kind} schedule${scheduleId ? ` ${shortId(scheduleId)}` : ""}`;
  if (cronExpr) return `cron ${cronExpr}`;
  return scheduleId ? `schedule ${shortId(scheduleId)}` : null;
}

function clean(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function shortId(id: string): string {
  return id.replace(/-/g, "").slice(0, 8);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
