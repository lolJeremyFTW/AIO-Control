// Next.js instrumentation hook — runs ONCE per server process at boot.
// We use it to start the local cron scheduler so non-subscription
// agent schedules fire on time without needing an external cron
// trigger.
//
// Skipped during build (`phase-production-build`) — only the running
// server should ever start the scheduler. Also skipped on the Edge
// runtime since node-cron needs Node APIs.

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // Don't bootstrap during a static-build pass. Standalone build sets
  // NEXT_PHASE here when invoked by the build tool.
  if (process.env.NEXT_PHASE === "phase-production-build") return;

  // Lazy-import so the build doesn't try to bundle node-cron into the
  // edge runtime by accident.
  const { startCronScheduler } = await import(
    "./lib/dispatch/cron-scheduler"
  );
  startCronScheduler();
}
