import "server-only";

import { tickOutreachPipeline } from "./pipeline-runner";

let started = false;
let timer: NodeJS.Timeout | null = null;

export function startOutreachPipelineScheduler(): void {
  if (started) return;
  started = true;

  const tickMs = Math.max(
    3000,
    Number(process.env.OUTREACH_PIPELINE_TICK_MS ?? "5000"),
  );

  timer = setInterval(() => {
    void tickOutreachPipeline().catch((err) =>
      console.error("[outreach-pipeline] tick failed", err),
    );
  }, tickMs);

  void tickOutreachPipeline().catch((err) =>
    console.error("[outreach-pipeline] initial tick failed", err),
  );

  console.log(`[outreach-pipeline] started - scanning every ${tickMs}ms`);
}

export function stopOutreachPipelineScheduler(): void {
  if (timer) clearInterval(timer);
  timer = null;
  started = false;
}
