// SMTP email sender. Resolves credentials per-workspace via the
// tiered api_keys system (providers "smtp_host", "smtp_port",
// "smtp_user", "smtp_pass", "smtp_from") with env-var fallback.
//
// Cache key is the workspace_id so multi-tenant configs don't bleed.

import "server-only";
import nodemailer, { type Transporter } from "nodemailer";

import { resolveApiKey } from "../api-keys/resolve";

const cachedByWorkspace = new Map<
  string,
  { transport: Transporter; from: string }
>();

async function getTransport(
  workspaceId: string,
): Promise<{ transport: Transporter; from: string } | null> {
  const cached = cachedByWorkspace.get(workspaceId);
  if (cached) return cached;

  // Try each credential from api_keys first, fall back to env.
  const [host, portStr, user, pass, from] = await Promise.all([
    resolveApiKey("smtp_host", { workspaceId }).then(
      (v) => v ?? process.env.SMTP_HOST ?? null,
    ),
    resolveApiKey("smtp_port", { workspaceId }).then(
      (v) => v ?? process.env.SMTP_PORT ?? "587",
    ),
    resolveApiKey("smtp_user", { workspaceId }).then(
      (v) => v ?? process.env.SMTP_USER ?? null,
    ),
    resolveApiKey("smtp_pass", { workspaceId }).then(
      (v) => v ?? process.env.SMTP_PASS ?? null,
    ),
    resolveApiKey("smtp_from", { workspaceId }).then(
      (v) =>
        v ??
        process.env.SMTP_FROM ??
        process.env.SMTP_USER ??
        "noreply@example.com",
    ),
  ]);

  if (!host || !user || !pass) return null;

  const port = Number(portStr) || 587;
  const transport = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
  const entry = { transport, from };
  cachedByWorkspace.set(workspaceId, entry);
  return entry;
}

/** Public helper for the Settings UI — flushes cache after the user
 *  edits creds so the next send picks up the new values. */
export function clearEmailTransportCache(workspaceId?: string) {
  if (workspaceId) cachedByWorkspace.delete(workspaceId);
  else cachedByWorkspace.clear();
}

export type EmailPayload = {
  workspace_id: string;
  to: string | string[];
  subject: string;
  text: string;
  html?: string;
};

export async function sendEmail(
  payload: EmailPayload,
): Promise<{ ok: boolean; error?: string }> {
  const conf = await getTransport(payload.workspace_id);
  if (!conf) {
    return { ok: false, error: "SMTP not configured" };
  }
  try {
    await conf.transport.sendMail({
      from: conf.from,
      to: Array.isArray(payload.to) ? payload.to.join(",") : payload.to,
      subject: payload.subject,
      text: payload.text,
      html: payload.html,
    });
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "send failed",
    };
  }
}

export async function isEmailConfigured(workspaceId: string): Promise<boolean> {
  const conf = await getTransport(workspaceId);
  return !!conf;
}

/** Parse comma/semicolon/whitespace-separated emails into a clean array. */
export function parseRecipients(s: string | null | undefined): string[] {
  if (!s) return [];
  return s
    .split(/[,;\s]+/)
    .map((x) => x.trim())
    .filter((x) => /.+@.+\..+/.test(x));
}
