// Controlled "new nav node" dialog. The right-click menu opens this
// directly with a parent_id so the user can drop "Nieuw subtopic" right
// where the cursor is.

"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { createNavNode } from "../app/actions/nav-nodes";
import { AppearancePicker, type AppearanceValue } from "./AppearancePicker";

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
  const [href, setHref] = useState("");
  const [appearance, setAppearance] = useState<AppearanceValue>({
    variant: "slate",
    icon: "",
    colorHex: null,
    logoUrl: null,
  });
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
      variant: appearance.variant,
      icon: appearance.icon || undefined,
      color_hex: appearance.colorHex,
      logo_url: appearance.logoUrl,
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
        maxWidth: 480,
      }}
    >
      <form
        method="dialog"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        style={{ padding: "20px 22px", maxHeight: "85vh", overflow: "auto" }}
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

        <Field label="Externe URL (optioneel)">
          <input
            value={href}
            onChange={(e) => setHref(e.target.value)}
            placeholder="https://yt-intel.tromptech.life"
            style={input}
          />
        </Field>

        <AppearancePicker
          value={appearance}
          onChange={setAppearance}
          displayName={name || "T"}
          workspaceId={workspaceId}
        />

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
