// Server actions for auth flows. Kept in one file because they share helpers
// and never need to be imported anywhere else.

"use server";

import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "../../lib/supabase/server";

export type AuthResult = { ok: true } | { ok: false; error: string };

export async function signInAction(formData: FormData): Promise<AuthResult> {
  const identifier = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/");

  if (!identifier || !password) {
    return { ok: false, error: "Vul je gebruikersnaam of e-mail en wachtwoord in." };
  }

  const supabase = await createSupabaseServerClient();

  // If the user typed something without an "@", treat it as a username and
  // resolve it to the matching email via the SECURITY DEFINER RPC. The RPC
  // returns null if there's no match — we surface a friendly error rather
  // than the raw "Invalid login credentials" string from gotrue, since the
  // auth call below would be skipped in that branch.
  let email = identifier;
  if (!identifier.includes("@")) {
    const { data, error } = await supabase
      .rpc("lookup_email_by_username", { uname: identifier });
    if (error) return { ok: false, error: error.message };
    if (!data || typeof data !== "string") {
      return { ok: false, error: "Gebruiker niet gevonden." };
    }
    email = data;
  }

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { ok: false, error: error.message };

  redirect(next || "/");
}

export async function signUpAction(formData: FormData): Promise<AuthResult> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const displayName = String(formData.get("display_name") ?? "").trim();

  if (!email || !password || !displayName) {
    return {
      ok: false,
      error: "Vul je naam, e-mail en wachtwoord in.",
    };
  }
  if (password.length < 8) {
    return { ok: false, error: "Wachtwoord moet minstens 8 tekens hebben." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { display_name: displayName } },
  });
  if (error) return { ok: false, error: error.message };

  // The handle_new_user trigger has created profile + first workspace.
  // The session cookie is now set, so we redirect to root which forwards to
  // the user's first workspace.
  redirect("/");
}

export async function signOutAction() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}
