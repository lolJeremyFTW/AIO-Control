// Server action to save SMTP credentials in the api_keys table.
// We reuse the tiered key storage (encrypted at rest via pgcrypto)
// and just use synthetic provider names: smtp_host / smtp_port /
// smtp_user / smtp_pass / smtp_from. Resolution at send-time happens
// in lib/notify/email.ts.

"use server";

import { revalidatePath } from "next/cache";

import { setApiKey } from "./api-keys";
import { clearEmailTransportCache } from "../../lib/notify/email";

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

export async function saveSmtpCreds(input: {
  workspace_slug: string;
  workspace_id: string;
  host: string;
  port: string;
  user: string;
  pass: string;
  from: string;
}): Promise<Result<null>> {
  if (!input.host.trim() || !input.user.trim() || !input.pass.trim()) {
    return {
      ok: false,
      error: "Host, user en pass zijn verplicht.",
    };
  }
  // Save each credential as its own workspace-scope key. This piggy-
  // backs on the existing encryption + RLS infra without a new table.
  const fields: { provider: string; value: string; label: string }[] = [
    { provider: "smtp_host", value: input.host.trim(), label: "SMTP host" },
    { provider: "smtp_port", value: input.port.trim() || "587", label: "SMTP port" },
    { provider: "smtp_user", value: input.user.trim(), label: "SMTP user" },
    { provider: "smtp_pass", value: input.pass, label: "SMTP password" },
    { provider: "smtp_from", value: input.from.trim() || input.user.trim(), label: "SMTP from" },
  ];
  for (const f of fields) {
    const res = await setApiKey({
      workspace_slug: input.workspace_slug,
      workspace_id: input.workspace_id,
      scope: "workspace",
      scope_id: input.workspace_id,
      provider: f.provider,
      value: f.value,
      label: f.label,
    });
    if (!res.ok) return { ok: false, error: `${f.provider}: ${res.error}` };
  }
  // Bust the in-process transport cache so the next sendEmail call
  // picks up the freshly saved values.
  clearEmailTransportCache(input.workspace_id);
  revalidatePath(`/${input.workspace_slug}/settings`);
  return { ok: true, data: null };
}
