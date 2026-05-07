import "server-only";

import { createHash, randomBytes, randomUUID } from "node:crypto";

import { getServiceRoleSupabase } from "../supabase/service";
import { resolveApiKey } from "../api-keys/resolve";

export type CodexOAuthPayload = {
  access_token: string;
  refresh_token?: string;
  expires_at: number;
  account_id?: string;
  scope?: string;
  plan_type?: string;
  token_type?: string;
};

export type CodexCredential = {
  accessToken: string;
  payload: CodexOAuthPayload;
};

const PROVIDER = "openai_codex";
const TOKEN_URL =
  process.env.OPENAI_CODEX_TOKEN_URL ?? "https://auth.openai.com/oauth/token";

export function requireCodexClientId(): string {
  const clientId = process.env.OPENAI_CODEX_CLIENT_ID;
  if (!clientId) {
    throw new Error(
      "OPENAI_CODEX_CLIENT_ID is not configured. Set it to the Codex OAuth client id before enabling ChatGPT login.",
    );
  }
  return clientId;
}

export function getCodexRedirectUri(origin: string): string {
  return `${origin.replace(/\/$/, "")}/api/providers/openai-codex/callback`;
}

export function createPkcePair(): {
  verifier: string;
  challenge: string;
  state: string;
} {
  const verifier = base64Url(randomBytes(48));
  const challenge = base64Url(createHash("sha256").update(verifier).digest());
  return { verifier, challenge, state: randomUUID() };
}

export async function storeCodexOAuthCredential(input: {
  workspaceId: string;
  ownerUserId: string;
  token: CodexOAuthPayload;
}): Promise<string> {
  const masterKey = process.env.AGENT_SECRET_KEY;
  if (!masterKey) throw new Error("AGENT_SECRET_KEY is not configured.");
  const supabase = getServiceRoleSupabase();
  const { data, error } = await supabase.rpc("set_api_key", {
    _workspace_id: input.workspaceId,
    _scope: "workspace",
    _scope_id: input.workspaceId,
    _provider: PROVIDER,
    _value: JSON.stringify(input.token),
    _label: input.token.account_id ?? "ChatGPT Codex OAuth",
    _master_key: masterKey,
    _credential_type: "oauth_token",
    _owner_user_id: input.ownerUserId,
  });
  if (error) throw new Error(error.message);
  return data as string;
}

export async function resolveCodexCredential(input: {
  workspaceId: string;
  ownerUserId: string;
}): Promise<CodexCredential | null> {
  const raw = await resolveApiKey(PROVIDER, {
    workspaceId: input.workspaceId,
    credentialOwnerUserId: input.ownerUserId,
    credentialType: "oauth_token",
  });
  if (!raw) return null;
  const payload = JSON.parse(raw) as CodexOAuthPayload;
  if (!payload.access_token) return null;
  if (payload.expires_at && payload.expires_at - 60_000 > Date.now()) {
    return { accessToken: payload.access_token, payload };
  }
  if (!payload.refresh_token) return { accessToken: payload.access_token, payload };
  const refreshed = await refreshCodexToken(payload.refresh_token);
  const next: CodexOAuthPayload = {
    ...payload,
    ...refreshed,
    refresh_token: refreshed.refresh_token ?? payload.refresh_token,
    expires_at: Date.now() + ((refreshed.expires_in ?? 3600) * 1000),
  };
  await storeCodexOAuthCredential({
    workspaceId: input.workspaceId,
    ownerUserId: input.ownerUserId,
    token: next,
  });
  return { accessToken: next.access_token, payload: next };
}

export async function exchangeCodexCode(input: {
  code: string;
  verifier: string;
  redirectUri: string;
}): Promise<CodexOAuthPayload> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: requireCodexClientId(),
    code: input.code,
    redirect_uri: input.redirectUri,
    code_verifier: input.verifier,
  });
  const json = await tokenRequest(body);
  return normalizeToken(json);
}

async function refreshCodexToken(refreshToken: string): Promise<
  Partial<CodexOAuthPayload> & { expires_in?: number }
> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: requireCodexClientId(),
    refresh_token: refreshToken,
  });
  return (await tokenRequest(body)) as Partial<CodexOAuthPayload> & {
    expires_in?: number;
  };
}

async function tokenRequest(body: URLSearchParams): Promise<Record<string, unknown>> {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Codex OAuth token exchange failed: ${response.status} ${text}`);
  }
  return JSON.parse(text) as Record<string, unknown>;
}

function normalizeToken(json: Record<string, unknown>): CodexOAuthPayload {
  const expiresIn =
    typeof json.expires_in === "number" ? json.expires_in : 3600;
  const access = stringField(json, "access_token");
  if (!access) throw new Error("Codex OAuth response did not include access_token.");
  return {
    access_token: access,
    refresh_token: stringField(json, "refresh_token") || undefined,
    expires_at: Date.now() + expiresIn * 1000,
    account_id: extractAccountId(access),
    scope: stringField(json, "scope") || undefined,
    token_type: stringField(json, "token_type") || undefined,
  };
}

function stringField(obj: Record<string, unknown>, key: string): string {
  const v = obj[key];
  return typeof v === "string" ? v : "";
}

function extractAccountId(accessToken: string): string | undefined {
  const parts = accessToken.split(".");
  if (parts.length < 2 || !parts[1]) return undefined;
  try {
    const payload = JSON.parse(
      Buffer.from(parts[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString(
        "utf8",
      ),
    ) as Record<string, unknown>;
    return stringField(payload, "https://api.openai.com/profile/account_id")
      || stringField(payload, "account_id")
      || stringField(payload, "sub")
      || undefined;
  } catch {
    return undefined;
  }
}

function base64Url(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}
