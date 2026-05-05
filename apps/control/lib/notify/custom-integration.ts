// Generic outbound HTTP integration sender. Reads the row from
// custom_integrations, substitutes mustache-style {{var}} placeholders
// in headers + body, and POSTs (or whatever method).

import "server-only";

import { isIP } from "node:net";

import { resolveApiKey } from "../api-keys/resolve";

export type CustomIntegration = {
  id: string;
  workspace_id: string;
  url: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  headers: Record<string, string>;
  body_template: string | null;
  enabled: boolean;
};

/** A var value can be a primitive, null, undefined, or a nested
 *  object whose own values can be the same — supports {{run.status}}
 *  style dot-notation references in templates. */
export type TemplateVars = {
  [key: string]:
    | string
    | number
    | boolean
    | null
    | undefined
    | TemplateVars;
};

export async function sendCustom(opts: {
  integration: CustomIntegration;
  vars: TemplateVars;
  /** Optional business scope so secret resolution honours per-business
   *  overrides for keys defined at that level. */
  businessId?: string | null;
}): Promise<{ ok: boolean; status?: number; error?: string }> {
  if (!opts.integration.enabled)
    return { ok: false, error: "integration_disabled" };

  // Pre-resolve any {{secret.X}} placeholders referenced in url +
  // headers + body. We scan all three template strings in one pass,
  // hit api_keys once per unique name, and stash the values under
  // vars.secret so the existing sync template() can render them.
  const sources = [
    opts.integration.url,
    ...Object.values(opts.integration.headers ?? {}),
    opts.integration.body_template ?? "",
  ];
  const secretNames = new Set<string>();
  const SECRET_REF = /\{\{\s*secret\.([A-Z][A-Z0-9_]*)\s*\}\}/g;
  for (const src of sources) {
    let m: RegExpExecArray | null;
    while ((m = SECRET_REF.exec(src)) !== null) secretNames.add(m[1]!);
  }
  const secretMap: Record<string, string> = {};
  for (const name of secretNames) {
    const value = await resolveApiKey(name, {
      workspaceId: opts.integration.workspace_id,
      businessId: opts.businessId ?? null,
    });
    if (value) secretMap[name] = value;
  }
  const vars: TemplateVars = { ...opts.vars, secret: secretMap };

  const url = template(opts.integration.url, vars);
  const urlCheck = validateOutboundUrl(url);
  if (!urlCheck.ok) return { ok: false, error: urlCheck.error };

  const headers = Object.fromEntries(
    Object.entries(opts.integration.headers ?? {}).map(([k, v]) => [
      k,
      template(v, vars),
    ]),
  );
  const body =
    opts.integration.body_template != null
      ? template(opts.integration.body_template, vars)
      : undefined;

  // If body looks like JSON and Content-Type isn't set, set it.
  if (body && !headers["content-type"] && !headers["Content-Type"]) {
    const trimmed = body.trim();
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      headers["content-type"] = "application/json";
    }
  }

  try {
    const res = await fetch(url, {
      method: opts.integration.method,
      headers,
      body:
        opts.integration.method === "GET" ||
        opts.integration.method === "DELETE"
          ? undefined
          : body,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      return {
        ok: false,
        status: res.status,
        error: text.slice(0, 300),
      };
    }
    return { ok: true, status: res.status };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "network error",
    };
  }
}

function validateOutboundUrl(
  raw: string,
): { ok: true } | { ok: false; error: string } {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, error: "invalid_url" };
  }

  if (url.protocol !== "https:") {
    return { ok: false, error: "only_https_urls_allowed" };
  }

  const allowPrivate = process.env.AIO_ALLOW_PRIVATE_INTEGRATION_URLS === "true";
  if (allowPrivate) return { ok: true };

  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    host === "localhost" ||
    host === "0.0.0.0" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local")
  ) {
    return { ok: false, error: "private_urls_not_allowed" };
  }

  const ipVersion = isIP(host);
  if (ipVersion === 4 && isPrivateIPv4(host)) {
    return { ok: false, error: "private_urls_not_allowed" };
  }
  if (ipVersion === 6 && isPrivateIPv6(host)) {
    return { ok: false, error: "private_urls_not_allowed" };
  }

  return { ok: true };
}

function isPrivateIPv4(host: string): boolean {
  const parts = host.split(".").map((p) => Number(p));
  if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p))) return true;
  const [a, b] = parts as [number, number, number, number];
  return (
    a === 10 ||
    a === 127 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254) ||
    (a === 100 && b >= 64 && b <= 127) ||
    a === 0
  );
}

function isPrivateIPv6(host: string): boolean {
  return (
    host === "::1" ||
    host.startsWith("fc") ||
    host.startsWith("fd") ||
    host.startsWith("fe80:")
  );
}

/** Mustache-style {{key}} substitution. Missing keys render as "".
 *  Nested keys via dot-notation: {{run.status}}. */
function template(
  src: string,
  vars: Record<string, unknown>,
): string {
  return src.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key: string) => {
    const path = key.split(".");
    let cur: unknown = vars;
    for (const p of path) {
      if (cur && typeof cur === "object" && p in (cur as object)) {
        cur = (cur as Record<string, unknown>)[p];
      } else {
        cur = "";
        break;
      }
    }
    return cur == null ? "" : String(cur);
  });
}
