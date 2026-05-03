// Shared constants + types for the API-keys subsystem. Lives in /lib
// (not /app/actions) because Next.js' "use server" files may only
// export async functions — constants and regexes have to come from
// somewhere else if both client and server need them.

/** Validation rule for custom-secret names — UPPERCASE, A-Z 0-9 _.
 *  Matches conventional env-var naming so secrets can be referenced
 *  identically from agent tools and Mustache integration templates. */
export const CUSTOM_KEY_NAME_RE = /^[A-Z][A-Z0-9_]*$/;

export type ApiKeyKind = "provider" | "custom";

export type ApiKeyScope = "workspace" | "business" | "navnode";

export type ApiKeyMetadata = {
  id: string;
  workspace_id: string;
  scope: ApiKeyScope;
  scope_id: string;
  provider: string;
  label: string | null;
  has_value: boolean;
  created_at: string;
  updated_at: string;
  /** 'provider' = canonical (anthropic/openai/…), 'custom' = user
   *  secret read by agent tools / modules / integrations. */
  kind: ApiKeyKind;
};
