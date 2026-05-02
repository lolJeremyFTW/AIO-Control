// Shared client component for login + signup. Uses a server action plus a
// client-side useFormStatus to render a pending state and surface error
// messages without a full page reload.

"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { OAuthButtons } from "../../components/OAuthButtons";

import type { AuthResult } from "./actions";

type Mode = "login" | "signup";

type Props = {
  mode: Mode;
  action: (
    state: AuthResult | null,
    formData: FormData,
  ) => Promise<AuthResult | null>;
  next?: string;
};

export function AuthForm({ mode, action, next }: Props) {
  const [state, formAction] = useActionState<AuthResult | null, FormData>(
    action,
    null,
  );

  const isLogin = mode === "login";

  return (
    <form
      action={formAction}
      style={{
        background: "var(--app-card)",
        border: "1.5px solid var(--app-border)",
        borderRadius: 16,
        padding: "26px 28px",
      }}
    >
      <h1
        style={{
          fontFamily: "var(--hand)",
          fontWeight: 700,
          fontSize: 30,
          letterSpacing: "-0.4px",
          margin: "0 0 4px",
        }}
      >
        {isLogin ? "Inloggen" : "Account aanmaken"}
      </h1>
      <p
        style={{
          color: "var(--app-fg-3)",
          fontSize: 13,
          margin: "0 0 18px",
        }}
      >
        {isLogin
          ? "Log in op je AIO Control workspace."
          : "Maak een account aan; je krijgt automatisch een eigen workspace."}
      </p>

      {!isLogin && (
        <Field label="Naam">
          <input
            name="display_name"
            type="text"
            autoComplete="name"
            required
            style={inputStyle}
          />
        </Field>
      )}

      <Field label={isLogin ? "Gebruikersnaam of e-mail" : "E-mail"}>
        <input
          name="email"
          type={isLogin ? "text" : "email"}
          autoComplete={isLogin ? "username" : "email"}
          required
          style={inputStyle}
        />
      </Field>

      <Field label="Wachtwoord">
        <input
          name="password"
          type="password"
          autoComplete={isLogin ? "current-password" : "new-password"}
          required
          minLength={isLogin ? undefined : 8}
          style={inputStyle}
        />
      </Field>

      {next && <input type="hidden" name="next" value={next} />}

      {state && !state.ok && (
        <p
          role="alert"
          style={{
            color: "var(--rose)",
            background: "rgba(230,82,107,0.08)",
            border: "1px solid rgba(230,82,107,0.4)",
            borderRadius: 10,
            padding: "8px 10px",
            margin: "12px 0 4px",
            fontSize: 12.5,
          }}
        >
          {state.error}
        </p>
      )}

      <SubmitButton label={isLogin ? "Log in" : "Account aanmaken"} />

      <OAuthButtons next={next} />

      <p style={{ fontSize: 12, color: "var(--app-fg-3)", marginTop: 16 }}>
        {isLogin ? (
          <>
            Nog geen account?{" "}
            <Link
              href="/signup"
              style={{ color: "var(--tt-green)", fontWeight: 700 }}
            >
              Registreer
            </Link>
          </>
        ) : (
          <>
            Heb je al een account?{" "}
            <Link
              href="/login"
              style={{ color: "var(--tt-green)", fontWeight: 700 }}
            >
              Log in
            </Link>
          </>
        )}
      </p>
    </form>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "var(--app-card-2)",
  border: "1.5px solid var(--app-border)",
  color: "var(--app-fg)",
  padding: "9px 11px",
  borderRadius: 9,
  fontFamily: "var(--type)",
  fontSize: 13.5,
};

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label
      style={{
        display: "block",
        marginBottom: 12,
        fontSize: 12,
        fontWeight: 600,
        color: "var(--app-fg-2)",
      }}
    >
      <span style={{ display: "block", marginBottom: 4 }}>{label}</span>
      {children}
    </label>
  );
}

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      style={{
        width: "100%",
        background: "var(--tt-green)",
        border: "1.5px solid var(--tt-green)",
        color: "#fff",
        padding: "10px 14px",
        borderRadius: 10,
        fontWeight: 700,
        fontSize: 13,
        cursor: pending ? "wait" : "pointer",
        opacity: pending ? 0.8 : 1,
        marginTop: 6,
      }}
    >
      {pending ? "Bezig…" : label}
    </button>
  );
}
