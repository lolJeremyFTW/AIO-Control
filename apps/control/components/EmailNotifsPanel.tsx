// Workspace-level email notifications. SMTP credentials live in env;
// the UI only manages WHO gets the mail and on which events.

"use client";

import { useState, useTransition } from "react";

import { saveSmtpCreds } from "../app/actions/smtp";
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

  // ── SMTP form state (workspace-scope, encrypted via api_keys) ──
  const [showSmtpForm, setShowSmtpForm] = useState(false);
  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState("587");
  const [smtpUser, setSmtpUser] = useState("");
  const [smtpPass, setSmtpPass] = useState("");
  const [smtpFrom, setSmtpFrom] = useState("");
  const [smtpInfo, setSmtpInfo] = useState<string | null>(null);
  const [smtpError, setSmtpError] = useState<string | null>(null);

  const submitSmtp = () => {
    setSmtpError(null);
    setSmtpInfo(null);
    startTransition(async () => {
      const res = await saveSmtpCreds({
        workspace_slug: workspaceSlug,
        workspace_id: workspaceId,
        host: smtpHost,
        port: smtpPort,
        user: smtpUser,
        pass: smtpPass,
        from: smtpFrom,
      });
      if (!res.ok) setSmtpError(res.error);
      else {
        setSmtpInfo(
          "SMTP creds opgeslagen + encrypted. Reload de pagina om de status-pill te updaten.",
        );
        setSmtpPass("");
        setShowSmtpForm(false);
      }
    });
  };

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
      <div
        style={{
          border: `1.5px solid ${
            smtpConfigured ? "var(--tt-green)" : "var(--amber)"
          }`,
          background: smtpConfigured
            ? "rgba(57,178,85,0.08)"
            : "rgba(240,179,64,0.08)",
          borderRadius: 10,
          padding: 12,
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700 }}>
            SMTP server: {smtpConfigured ? "✓ Configured" : "⚠ Not configured"}
          </div>
          <button
            type="button"
            onClick={() => setShowSmtpForm((v) => !v)}
            style={{
              padding: "5px 10px",
              border: "1.5px solid var(--app-border)",
              background: "var(--app-card-2)",
              color: "var(--app-fg)",
              borderRadius: 8,
              fontSize: 11.5,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            {showSmtpForm
              ? "Verberg"
              : smtpConfigured
                ? "Wijzig"
                : "Configureer"}
          </button>
        </div>

        {showSmtpForm && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 8,
              padding: "8px 0 0",
              borderTop: "1px solid var(--app-border-2)",
            }}
          >
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 8 }}>
              <Field label="Host">
                <input
                  value={smtpHost}
                  onChange={(e) => setSmtpHost(e.target.value)}
                  placeholder="smtp.postmarkapp.com"
                  style={inp}
                />
              </Field>
              <Field label="Port">
                <input
                  value={smtpPort}
                  onChange={(e) => setSmtpPort(e.target.value)}
                  placeholder="587"
                  style={inp}
                />
              </Field>
            </div>
            <Field label="User">
              <input
                value={smtpUser}
                onChange={(e) => setSmtpUser(e.target.value)}
                autoComplete="off"
                style={inp}
              />
            </Field>
            <Field label="Password (encrypted opgeslagen)">
              <input
                type="password"
                value={smtpPass}
                onChange={(e) => setSmtpPass(e.target.value)}
                autoComplete="new-password"
                placeholder={smtpConfigured ? "•••••• (laat leeg om bestaande te houden)" : ""}
                style={inp}
              />
            </Field>
            <Field label="From (optioneel — default = user)">
              <input
                value={smtpFrom}
                onChange={(e) => setSmtpFrom(e.target.value)}
                placeholder='"AIO Control <noreply@tromptech.life>"'
                style={inp}
              />
            </Field>
            {smtpError && (
              <p style={{ color: "var(--rose)", fontSize: 12, margin: 0 }}>
                {smtpError}
              </p>
            )}
            {smtpInfo && (
              <p style={{ color: "var(--tt-green)", fontSize: 12, margin: 0 }}>
                {smtpInfo}
              </p>
            )}
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                onClick={submitSmtp}
                disabled={pending || !smtpHost.trim() || !smtpUser.trim() || !smtpPass.trim()}
                style={{
                  padding: "7px 12px",
                  border: "1.5px solid var(--tt-green)",
                  background: "var(--tt-green)",
                  color: "#fff",
                  borderRadius: 8,
                  fontWeight: 700,
                  fontSize: 12,
                  cursor: pending ? "wait" : "pointer",
                  opacity: pending ? 0.7 : 1,
                }}
              >
                {pending ? "Opslaan…" : "SMTP opslaan"}
              </button>
              <button
                type="button"
                onClick={() => setShowSmtpForm(false)}
                style={{
                  padding: "7px 12px",
                  border: "1.5px solid var(--app-border)",
                  background: "transparent",
                  color: "var(--app-fg)",
                  borderRadius: 8,
                  fontWeight: 700,
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                Annuleer
              </button>
            </div>
          </div>
        )}
      </div>

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
