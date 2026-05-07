import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import {
  createPkcePair,
  getCodexRedirectUri,
  requireCodexClientId,
} from "../../../../../lib/openai-codex/oauth";
import { createSupabaseServerClient } from "../../../../../lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const workspaceId = url.searchParams.get("workspace_id");
  if (!workspaceId) {
    return NextResponse.json({ error: "workspace_id is required" }, { status: 400 });
  }

  const { data: member } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("workspace_id", workspaceId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!member) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const origin = url.origin;
  const redirectUri = getCodexRedirectUri(origin);
  const { verifier, challenge, state } = createPkcePair();
  const next = url.searchParams.get("next") ?? "/settings/providers";

  const cookieStore = await cookies();
  cookieStore.set(`aio_codex_oauth_${state}`, JSON.stringify({
    verifier,
    workspaceId,
    ownerUserId: user.id,
    next,
    redirectUri,
  }), {
    httpOnly: true,
    sameSite: "lax",
    secure: origin.startsWith("https://"),
    maxAge: 10 * 60,
    path: "/",
  });

  const auth = new URL(
    process.env.OPENAI_CODEX_AUTHORIZE_URL ??
      "https://auth.openai.com/oauth/authorize",
  );
  auth.searchParams.set("response_type", "code");
  auth.searchParams.set("client_id", requireCodexClientId());
  auth.searchParams.set("redirect_uri", redirectUri);
  auth.searchParams.set("scope", process.env.OPENAI_CODEX_SCOPES ?? "openid profile email model.request api.responses.write");
  auth.searchParams.set("code_challenge", challenge);
  auth.searchParams.set("code_challenge_method", "S256");
  auth.searchParams.set("state", state);

  return NextResponse.redirect(auth);
}
