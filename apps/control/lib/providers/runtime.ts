// Shared constants + helpers for the persistent runtime-agent
// onboarding flow. Lives in /lib (not /app/actions) because Next.js'
// "use server" boundary forbids non-async-function exports — the
// panel needs these synchronously to render the install command and
// to compute the default name.

export type RuntimeAgentProvider = "hermes" | "openclaw";

/** Conventional name template — `aio-<workspaceSlug>` keeps both
 *  runtimes scoped to the workspace so multi-workspace operators
 *  don't collide on the same host. */
export function defaultRuntimeAgentName(workspaceSlug: string): string {
  // Slugs are already kebab-case but normalise defensively — Hermes
  // profile create chokes on chars outside [a-z0-9_-].
  const safe = workspaceSlug.toLowerCase().replace(/[^a-z0-9-]/g, "-");
  return `aio-${safe}`;
}

/** Validation rule for runtime-agent names. Must mirror what the
 *  runtimes themselves accept. Server action enforces too. */
export const RUNTIME_AGENT_NAME_RE = /^[a-z][a-z0-9_-]{1,40}$/;

/** Generate the exact install command the operator pastes into the
 *  Hermes/OpenClaw host. Centralised here so the rendered copy-button
 *  text and the verify-step's expectations stay aligned with what
 *  the providers actually invoke at runtime. */
export function runtimeInstallCommand(
  provider: RuntimeAgentProvider,
  name: string,
): string {
  if (provider === "hermes") {
    // `hermes profile create` registers the profile; `<name> setup`
    // walks the user through the credential + model picker. Chained
    // so one paste covers the full bootstrap.
    return `hermes profile create ${name} && ${name} setup`;
  }
  // OpenClaw needs an init in the workspace dir before agents can
  // be added; we keep the dir conventional under ~/.aio-control so
  // all per-workspace agents land in one place.
  return `mkdir -p ~/.aio-control && cd ~/.aio-control && openclaw init && openclaw agents add ${name}`;
}
