// Generic outbound HTTP integration sender. Reads the row from
// custom_integrations, substitutes mustache-style {{var}} placeholders
// in headers + body, and POSTs (or whatever method).

import "server-only";

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
}): Promise<{ ok: boolean; status?: number; error?: string }> {
  if (!opts.integration.enabled)
    return { ok: false, error: "integration_disabled" };

  const url = template(opts.integration.url, opts.vars);
  const headers = Object.fromEntries(
    Object.entries(opts.integration.headers ?? {}).map(([k, v]) => [
      k,
      template(v, opts.vars),
    ]),
  );
  const body =
    opts.integration.body_template != null
      ? template(opts.integration.body_template, opts.vars)
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
