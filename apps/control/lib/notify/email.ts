// SMTP email sender. Uses nodemailer; transport is built once per
// process and reused across requests. Returns { ok: false, ... } when
// SMTP isn't configured so the dispatcher can quietly skip without
// logging an error every run.
//
// Required env vars:
//   SMTP_HOST     e.g. smtp.postmarkapp.com
//   SMTP_PORT     587 (STARTTLS) or 465 (SSL)
//   SMTP_USER
//   SMTP_PASS
//   SMTP_FROM     "AIO Control <noreply@tromptech.life>"

import "server-only";
import nodemailer, { type Transporter } from "nodemailer";

let cached: Transporter | null = null;

function getTransport(): Transporter | null {
  if (cached) return cached;
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) return null;
  const port = Number(process.env.SMTP_PORT ?? 587);
  cached = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
  return cached;
}

export type EmailPayload = {
  to: string | string[];
  subject: string;
  text: string;
  html?: string;
};

export async function sendEmail(
  payload: EmailPayload,
): Promise<{ ok: boolean; error?: string }> {
  const transport = getTransport();
  if (!transport) {
    return { ok: false, error: "SMTP not configured" };
  }
  const from = process.env.SMTP_FROM ?? process.env.SMTP_USER ?? "noreply@example.com";
  try {
    await transport.sendMail({
      from,
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

export function isEmailConfigured(): boolean {
  return !!(
    process.env.SMTP_HOST &&
    process.env.SMTP_USER &&
    process.env.SMTP_PASS
  );
}

/** Parse comma/semicolon/whitespace-separated emails into a clean array. */
export function parseRecipients(s: string | null | undefined): string[] {
  if (!s) return [];
  return s
    .split(/[,;\s]+/)
    .map((x) => x.trim())
    .filter((x) => /.+@.+\..+/.test(x));
}
