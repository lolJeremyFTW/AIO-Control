// Controlled "new nav node" dialog. The right-click menu opens this
// directly with a parent_id so the user can drop "Nieuw subtopic" right
// where the cursor is.
//
// Mirrors NewNavNodeButton's modal but without the trigger button —
// state lives in WorkspaceShell and is dismissed via onClose.

"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { ALL_VARIANTS } from "@aio/ui/rail/Node";

import { createNavNode } from "../app/actions/nav-nodes";

const QUICK_EMOJIS = [
  "📁", "📺", "📈", "🤖", "🛠️", "📚",
  "🎬", "🛍️", "💬", "🔍", "🧠", "📦",
  "🎯", "📊", "🪙", "✏️",
];

type Props = {
  workspaceSlug: string;
  workspaceId: string;
  businessId: string;
  parentId: string | null;
  /** Title — e.g. "Nieuw topic" or "Nieuw subtopic" depending on
   *  whether we're at the business root or inside an existing node. */
  title?: string;
  onClose: () => void;
};

export function NewNavNodeDialog({
  workspaceSlug,
  workspaceId,
  businessId,
  parentId,
  title = "Nieuw topic",
  onClose,
}: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("");
  const [variant, setVariant] = useState<string>("slate");
  const [href, setHref] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  const submit = async () => {
    setError(null);
    setPending(true);
    const res = await createNavNode({
      workspace_slug: workspaceSlug,
      workspace_id: workspaceId,
      business_id: businessId,
      parent_id: parentId,
      name,
      variant,
      icon: icon || undefined,
      href: href || undefined,
    });
    setPending(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    onClose();
    router.refresh();
  };

  const letter = (name || "T").slice(0, 1).toUpperCase();

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
        width: "calc(100% - 32px)",
        maxWidth: 440,
      }}
    >
      <form
        method="dialog"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        style={{ padding: "20px 22px" }}
      >
        <h2
          style={{
            fontFamily: "var(--hand)",
            fontSize: 24,
            fontWeight: 700,
            margin: "0 0 4px",
          }}
        >
          {title}
        </h2>
        <p
          style={{
            color: "var(--app-fg-3)",
            fontSize: 12,
            margin: "0 0 14px",
          }}
        >
          Topics + subtopics zijn vrij. De rail toont ze direct.
        </p>

        <Field label="Naam">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="YouTube, Lead-mgmt, …"
            style={input}
            required
          />
        </Field>

        <Field label="Icon (emoji of letter)">
          <input
            value={icon}
            onChange={(e) => setIcon(e.target.value.slice(0, 4))}
            placeholder="📁"
            style={input}
          />
          <div
            style={{
              display: "flex",
              gap: 6,
              marginTop: 6,
              flexWrap: "wrap",
            }}
          >
            {QUICK_EMOJIS.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => setIcon(e)}
                style={{
                  width: 30,
                  height: 30,
                  border: `1.5px solid ${
                    icon === e ? "var(--tt-green)" : "var(--app-border)"
                  }`,
                  background: "var(--app-card-2)",
                  borderRadius: 8,
                  cursor: "pointer",
                  fontSize: 16,
                  lineHeight: 1,
                }}
              >
                {e}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Kleur">
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {ALL_VARIANTS.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setVariant(v)}
                className={`node ${v}`}
                style={{
                  width: 28,
                  height: 28,
                  fontSize: 11,
                  outline:
                    variant === v ? "2.5px solid var(--tt-green)" : "0",
                  outlineOffset: 2,
                  cursor: "pointer",
                  ["--size" as string]: "28px",
                }}
              >
                {icon || letter}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Externe URL (optioneel)">
          <input
            value={href}
            onChange={(e) => setHref(e.target.value)}
            placeholder="https://yt-intel.tromptech.life"
            style={input}
          />
        </Field>

        {error && (
          <p
            role="alert"
            style={{
              color: "var(--rose)",
              background: "rgba(230,82,107,0.08)",
              border: "1px solid rgba(230,82,107,0.4)",
              borderRadius: 8,
              padding: "6px 10px",
              margin: "8px 0",
              fontSize: 12,
            }}
          >
            {error}
          </p>
        )}

        <div
          style={{
            display: "flex",
            gap: 8,
            marginTop: 14,
            justifyContent: "flex-end",
          }}
        >
          <button type="button" onClick={onClose} style={btnSecondary}>
            Annuleer
          </button>
          <button type="submit" disabled={pending} style={btnPrimary(pending)}>
            {pending ? "Bezig…" : "Aanmaken"}
          </button>
        </div>
      </form>
    </dialog>
  );
}

const input: React.CSSProperties = {
  width: "100%",
  background: "var(--app-card-2)",
  border: "1.5px solid var(--app-border)",
  color: "var(--app-fg)",
  padding: "8px 10px",
  borderRadius: 9,
  fontFamily: "var(--type)",
  fontSize: 13,
};

const btnSecondary: React.CSSProperties = {
  padding: "8px 14px",
  border: "1.5px solid var(--app-border)",
  background: "var(--app-card-2)",
  color: "var(--app-fg)",
  borderRadius: 10,
  fontWeight: 700,
  fontSize: 12.5,
  cursor: "pointer",
};

const btnPrimary = (pending: boolean): React.CSSProperties => ({
  padding: "8px 14px",
  border: "1.5px solid var(--tt-green)",
  background: "var(--tt-green)",
  color: "#fff",
  borderRadius: 10,
  fontWeight: 700,
  fontSize: 12.5,
  cursor: pending ? "wait" : "pointer",
  opacity: pending ? 0.7 : 1,
});

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
