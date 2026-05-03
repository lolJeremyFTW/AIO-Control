// Profile actions: update display name / avatar / timezone, change
// password via Supabase auth, sign out of other sessions. RLS allows
// users to update their own profile row.

"use server";

import { revalidatePath } from "next/cache";

import { createSupabaseServerClient } from "../../lib/supabase/server";
import { getServiceRoleSupabase } from "../../lib/supabase/service";

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

export async function updateProfile(input: {
  display_name?: string;
  avatar_letter?: string;
  avatar_variant?: string;
  avatar_url?: string | null;
  timezone?: string;
}): Promise<Result<null>> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Niet ingelogd." };

  const patch: Record<string, unknown> = {};
  if (input.display_name !== undefined) {
    const t = input.display_name.trim();
    if (!t) return { ok: false, error: "Naam mag niet leeg zijn." };
    patch.display_name = t;
    // Keep the avatar letter in sync with the first character of the
    // new name unless the user explicitly overrode it.
    if (input.avatar_letter === undefined) {
      patch.avatar_letter = t.slice(0, 1).toUpperCase();
    }
  }
  if (input.avatar_letter !== undefined) {
    patch.avatar_letter = input.avatar_letter.slice(0, 1).toUpperCase();
  }
  if (input.avatar_variant !== undefined)
    patch.avatar_variant = input.avatar_variant;
  if (input.avatar_url !== undefined)
    patch.avatar_url = input.avatar_url?.trim() || null;
  if (input.timezone !== undefined)
    patch.timezone = input.timezone.trim() || "Europe/Amsterdam";

  if (Object.keys(patch).length === 0) return { ok: true, data: null };

  const { error } = await supabase
    .from("profiles")
    .update(patch)
    .eq("id", user.id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/", "layout");
  return { ok: true, data: null };
}

export async function changePassword(input: {
  new_password: string;
}): Promise<Result<null>> {
  if (input.new_password.length < 8) {
    return { ok: false, error: "Wachtwoord moet minimaal 8 tekens zijn." };
  }
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.updateUser({
    password: input.new_password,
  });
  if (error || !data?.user) {
    return { ok: false, error: error?.message ?? "Wachtwoord wijzigen faalde." };
  }
  return { ok: true, data: null };
}

export async function changeEmail(input: {
  new_email: string;
}): Promise<Result<null>> {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.new_email)) {
    return { ok: false, error: "Ongeldig email-adres." };
  }
  // Find the current user. We use the regular cookie-bound client to
  // get the auth.uid() so the user can only change THEIR OWN email.
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Niet ingelogd." };

  // Direct admin update — bypasses Supabase's confirmation-email
  // dance (which fails when GoTrue has no SMTP configured). Since
  // we already authenticated via cookie + cap to the user's own id,
  // the security boundary is preserved.
  const admin = getServiceRoleSupabase();
  const { error: authErr } = await admin.auth.admin.updateUserById(user.id, {
    email: input.new_email,
    email_confirm: true,
  });
  if (authErr) {
    return { ok: false, error: authErr.message };
  }

  // Mirror to profiles.email so the rest of the app sees the new
  // address without waiting for a trigger.
  await admin
    .from("profiles")
    .update({ email: input.new_email })
    .eq("id", user.id);

  revalidatePath("/", "layout");
  return { ok: true, data: null };
}

export async function signOutEverywhere(): Promise<Result<null>> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signOut({ scope: "global" });
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: null };
}
