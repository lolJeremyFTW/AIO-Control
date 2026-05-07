import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import {
  exchangeCodexCode,
  storeCodexOAuthCredential,
} from "../../../../../lib/openai-codex/oauth";

export const dynamic = "force-dynamic";

type StateCookie = {
  verifier: string;
  workspaceId: string;
  ownerUserId: string;
  next: string;
  redirectUri: string;
};

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) {
    return NextResponse.redirect(
      new URL(`/settings/providers?codex_error=${encodeURIComponent(error)}`, url.origin),
    );
  }
  if (!code || !state) {
    return NextResponse.json({ error: "Missing OAuth code/state" }, { status: 400 });
  }

  const cookieStore = await cookies();
  const name = `aio_codex_oauth_${state}`;
  const raw = cookieStore.get(name)?.value;
  cookieStore.delete(name);
  if (!raw) {
    return NextResponse.json({ error: "Invalid or expired OAuth state" }, { status: 400 });
  }

  let stored: StateCookie;
  try {
    stored = JSON.parse(raw) as StateCookie;
  } catch {
    return NextResponse.json({ error: "Invalid OAuth state payload" }, { status: 400 });
  }

  try {
    const token = await exchangeCodexCode({
      code,
      verifier: stored.verifier,
      redirectUri: stored.redirectUri,
    });
    await storeCodexOAuthCredential({
      workspaceId: stored.workspaceId,
      ownerUserId: stored.ownerUserId,
      token,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.redirect(
      new URL(
        `${stored.next}?codex_error=${encodeURIComponent(message)}`,
        url.origin,
      ),
    );
  }

  return NextResponse.redirect(
    new URL(`${stored.next}?codex_connected=1`, url.origin),
  );
}
