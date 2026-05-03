// Workspace-level email notifications. SMTP credentials live in env;
// the UI only manages WHO gets the mail and on which events.

"use client";

import { useState, useTransition } from "react";

import { updateWorkspaceEmailNotifs } from "../app/actions/workspace-settings";

type Props = {
  workspaceSlug: string;
  workspaceId: string;
  initial: {
    email: string | null;
    on_done: boolean;
    on_fail: boolean;
  };
  smtpConfigured: boolean;
};

export function EmailNotifsPanel({
  workspaceSlug,
  workspaceId,
  initial,
  smtpConfigured,
}: Props) {
  const [email, setEmail] = useState(initial.email ?? "");
  const [onDone, setOnDone] = useState(initial.on_done);
  const [onFail, setOnFail] = useState(initial.on_fail);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = () => {
    setError(null);
    setInfo(null);
    startTransition(async () => {
      const res = await updateWorkspaceEmailNotifs({
        workspace_slug: workspaceSlug,
        workspace_id: workspaceId,
        email: email.trim() || null,
        on_done: onDone,
        on_fail: onFail,
      });
      if (!res.ok) setError(res.error);
      else setInfo("Opgeslagen.");
    });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {!smtpConfigured && (
        <p
          style={{
            fontSize: 12,
            color: "var(--amber)",
            background: "rgba(240, 179, 64, 0.08)",
            border: "1px solid rgba(240, 179, 64, 0.4)",
            padding: 10,
            borderRadius: 8,
            margin: 0,
          }}
        >
          SMTP nog niet geconfigureerd. Zet <code>SMTP_HOST</code> /{" "}
          <code>SMTP_PORT</code> / <code>SMTP_USER</code> /{" "}
          <code>SMTP_PASS</code> / <code>SMTP_FROM</code> in <code>.env.production</code>{" "}
          op de VPS en redeploy. Daarna verstuurt deze panel echte mails.
        </p>
      )}

      <p
        style={{
          fontSize: 12.5,
          color: "var(--app-fg-3)",
          margin: 0,
          lineHeight: 1.5,
        }}
      >
        Stuur run-rapporten ook via email. Per-business of per-agent
        overrides zet je via right-click → Instellingen op de business of
        in de agent edit-dialog.
      </p>

      <Field label="Email recipients (comma- of newline-gescheiden)">
        <textarea
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="jeremy@tromptech.life, ops@tromptech.life"
          rows={2}
          style={{ ...inp, fontFamily: "var(--type)", resize: "vertical" }}
        />
      </Field>

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        <label
          style={{
            display: "flex",
            gap: 6,
            alignItems: "center",
            fontSize: 12,
            cursor: "pointer",
          }}
        >
          <input
            type="checkbox"
            checked={onFail}
            onChange={(e) => setOnFail(e.target.checked)}
            style={{ accentColor: "var(--tt-green)" }}
          />
          Stuur bij failed runs
        </label>
        <label
          style={{
            display: "flex",
            gap: 6,
            alignItems: "center",
            fontSize: 12,
            cursor: "pointer",
          }}
        >
          <input
            type="checkbox"
            checked={onDone}
            onChange={(e) => setOnDone(e.target.checked)}
            style={{ accentColor: "var(--tt-green)" }}
          />
          Stuur bij geslaagde runs (kan veel mail worden)
        </label>
      </div>

      {error && (
        <p style={{ color: "var(--rose)", fontSize: 12, margin: 0 }}>{error}</p>
      )}
      {info && (
        <p style={{ color: "var(--tt-green)", fontSize: 12, margin: 0 }}>
          {info}
        </p>
      )}

      <div>
        <button
          onClick={submit}
          disabled={pending}
          style={{
            padding: "8px 14px",
            border: "1.5px solid var(--tt-green)",
            background: "var(--tt-green)",
            color: "#fff",
            borderRadius: 10,
            fontWeight: 700,
            fontSize: 12.5,
            cursor: pending ? "wait" : "pointer",
            opacity: pending ? 0.7 : 1,
          }}
        >
          {pending ? "Opslaan…" : "Opslaan"}
        </button>
      </div>
    </div>
  );
}

const inp: React.CSSProperties = {
  width: "100%",
  background: "var(--app-card-2)",
  border: "1.5px solid var(--app-border)",
  color: "var(--app-fg)",
  padding: "8px 10px",
  borderRadius: 8,
  fontSize: 13,
};

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label style={{ display: "block", fontSize: 11, fontWeight: 600 }}>
      <span
        style={{
          display: "block",
          marginBottom: 4,
          color: "var(--app-fg-2)",
        }}
      >
        {label}
      </span>
      {children}
    </label>
  );
}
