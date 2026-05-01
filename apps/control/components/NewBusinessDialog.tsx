// "+ New business" modal triggered from the rail. Uses a native <dialog> for
// accessibility — Escape + click-outside both dismiss. Calls the
// createBusiness server action and closes on success.

"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { createBusiness } from "../app/actions/businesses";

type Props = {
  workspaceSlug: string;
  workspaceId: string;
  onClose: () => void;
};

const VARIANTS = [
  "brand",
  "orange",
  "indigo",
  "blue",
  "violet",
  "rose",
  "amber",
] as const;

export function NewBusinessDialog({
  workspaceSlug,
  workspaceId,
  onClose,
}: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState("");
  const [sub, setSub] = useState("");
  const [variant, setVariant] = useState<(typeof VARIANTS)[number]>("brand");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const router = useRouter();

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  const submit = async () => {
    setError(null);
    setPending(true);
    const res = await createBusiness({
      workspace_slug: workspaceSlug,
      workspace_id: workspaceId,
      name,
      sub: sub || undefined,
      variant,
    });
    setPending(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    onClose();
    router.refresh();
  };

  const letter = (name || "B").slice(0, 1).toUpperCase();

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      style={{
        background: "var(--app-card)",
        border: "1.5px solid var(--app-border)",
        borderRadius: 16,
        color: "var(--app-fg)",
        padding: 0,
        maxWidth: 440,
        width: "calc(100% - 32px)",
        boxShadow: "0 24px 60px -12px rgba(0,0,0,0.55)",
      }}
    >
      <form
        method="dialog"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        style={{ padding: "22px 24px" }}
      >
        <h2
          style={{
            fontFamily: "var(--hand)",
            fontSize: 26,
            fontWeight: 700,
            margin: "0 0 4px",
            letterSpacing: "-0.3px",
          }}
        >
          Nieuwe business
        </h2>
        <p
          style={{
            color: "var(--app-fg-3)",
            fontSize: 12.5,
            margin: "0 0 16px",
          }}
        >
          Geef je nieuwe automated business een naam en kleur. Agents en
          schedules voeg je daarna toe.
        </p>

        <Field label="Naam">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Faceless YouTube"
            style={inputStyle}
            required
          />
        </Field>

        <Field label="Sub (optioneel)">
          <input
            value={sub}
            onChange={(e) => setSub(e.target.value)}
            placeholder="NL Tech kanaal"
            style={inputStyle}
          />
        </Field>

        <Field label="Kleur">
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {VARIANTS.map((v) => (
              <button
                type="button"
                key={v}
                aria-label={v}
                aria-pressed={variant === v}
                onClick={() => setVariant(v)}
                className={`node ${v}`}
                style={{
                  width: 32,
                  height: 32,
                  fontSize: 12,
                  outline:
                    variant === v
                      ? "2.5px solid var(--tt-green)"
                      : "0",
                  outlineOffset: 2,
                  cursor: "pointer",
                  ["--size" as string]: "32px",
                }}
              >
                {letter}
              </button>
            ))}
          </div>
        </Field>

        {error && (
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
            {error}
          </p>
        )}

        <div
          style={{ display: "flex", gap: 8, marginTop: 18, justifyContent: "flex-end" }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "9px 14px",
              border: "1.5px solid var(--app-border)",
              background: "var(--app-card-2)",
              color: "var(--app-fg)",
              borderRadius: 10,
              fontWeight: 700,
              fontSize: 12.5,
              cursor: "pointer",
            }}
          >
            Annuleer
          </button>
          <button
            type="submit"
            disabled={pending}
            style={{
              padding: "9px 16px",
              border: "1.5px solid var(--tt-green)",
              background: "var(--tt-green)",
              color: "#fff",
              borderRadius: 10,
              fontWeight: 700,
              fontSize: 12.5,
              cursor: pending ? "wait" : "pointer",
              opacity: pending ? 0.8 : 1,
            }}
          >
            {pending ? "Bezig…" : "Aanmaken"}
          </button>
        </div>
      </form>
    </dialog>
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
