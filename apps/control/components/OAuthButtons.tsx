// Google + GitHub sign-in buttons. We probe /api/auth/oauth-config on
// mount to figure out which providers are actually configured in the
// Supabase dashboard — buttons for unconfigured providers stay hidden so
// we don't drop users into a 500.

"use client";

import { useEffect, useState } from "react";

import { getSupabaseBrowserClient } from "../lib/supabase/client";

type Available = { google: boolean; github: boolean };

type Props = { next?: string };

export function OAuthButtons({ next }: Props) {
  const [enabled, setEnabled] = useState<Available>({ google: false, github: false });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/auth/oauth-config")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data && typeof data === "object") {
          setEnabled({
            google: !!data.google,
            github: !!data.github,
          });
        }
      })
      .catch(() => {});
  }, []);

  const sign = async (provider: "google" | "github") => {
    setError(null);
    try {
      const supabase = getSupabaseBrowserClient();
      const redirect =
        window.location.origin +
        (process.env.NEXT_PUBLIC_BASE_PATH ?? "") +
        "/auth/callback" +
        (next ? `?next=${encodeURIComponent(next)}` : "");
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo: redirect },
      });
      if (error) setError(error.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : "OAuth failed");
    }
  };

  if (!enabled.google && !enabled.github) return null;

  return (
    <>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          margin: "14px 0 10px",
          color: "var(--app-fg-3)",
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
        }}
      >
        <span style={{ flex: 1, height: 1, background: "var(--app-border-2)" }} />
        of via
        <span style={{ flex: 1, height: 1, background: "var(--app-border-2)" }} />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {enabled.google && (
          <button type="button" onClick={() => sign("google")} style={oauthBtn}>
            Doorgaan met Google
          </button>
        )}
        {enabled.github && (
          <button type="button" onClick={() => sign("github")} style={oauthBtn}>
            Doorgaan met GitHub
          </button>
        )}
      </div>
      {error && (
        <p style={{ color: "var(--rose)", fontSize: 12, marginTop: 8 }} role="alert">
          {error}
        </p>
      )}
    </>
  );
}

const oauthBtn: React.CSSProperties = {
  width: "100%",
  background: "var(--app-card-2)",
  border: "1.5px solid var(--app-border)",
  color: "var(--app-fg)",
  padding: "10px 14px",
  borderRadius: 10,
  fontWeight: 700,
  fontSize: 13,
  cursor: "pointer",
};
