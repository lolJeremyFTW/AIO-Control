// Inline "+ Nieuwe topic / module / submodule" button + minimal modal.
// Lives wherever a parent's children are listed (business root, a topic
// detail page, …) — the parent_id determines depth.

"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import {
  APP_ICON_PICKER_NAMES,
  getAppIcon,
  isAppIconName,
} from "@aio/ui/icon";
import { ALL_VARIANTS } from "@aio/ui/rail/Node";

import { createNavNode } from "../app/actions/nav-nodes";

type Props = {
  workspaceSlug: string;
  workspaceId: string;
  businessId: string;
  parentId: string | null;
  /** Display label for the create button — "Nieuwe topic" at the
   *  business root, "Nieuwe module" inside a topic, etc. */
  label?: string;
};

export function NewNavNodeButton({
  workspaceSlug,
  workspaceId,
  businessId,
  parentId,
  label = "+ Nieuwe topic",
}: Props) {
  const router = useRouter();
  const ref = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("");
  const [variant, setVariant] = useState<string>("slate");
  const [href, setHref] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) ref.current?.showModal();
    else ref.current?.close();
  }, [open]);

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
    setOpen(false);
    setName("");
    setIcon("");
    setVariant("slate");
    setHref("");
    router.refresh();
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        style={{
          padding: "8px 14px",
          border: "1.5px dashed var(--app-border)",
          background: "transparent",
          color: "var(--app-fg-2)",
          borderRadius: 10,
          fontWeight: 700,
          fontSize: 12.5,
          cursor: "pointer",
        }}
      >
        {label}
      </button>
      <dialog
        ref={ref}
        onClose={() => setOpen(false)}
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
            {label}
          </h2>
          <p
            style={{
              color: "var(--app-fg-3)",
              fontSize: 12,
              margin: "0 0 14px",
            }}
          >
            Topics, modules en submodules zijn vrij. De rail toont ze
            zodra je dit opslaat.
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

          <Field label="Icoon (optioneel)">
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(34px, 1fr))",
                gap: 6,
              }}
            >
              {APP_ICON_PICKER_NAMES.map((n) => {
                const active = icon === n;
                return (
                  <button
                    key={n}
                    type="button"
                    aria-label={n}
                    aria-pressed={active}
                    onClick={() => setIcon(active ? "" : n)}
                    style={{
                      width: 34,
                      height: 34,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      border: `1.5px solid ${
                        active ? "var(--tt-green)" : "var(--app-border)"
                      }`,
                      background: active
                        ? "rgba(57,178,85,0.10)"
                        : "var(--app-card-2)",
                      color: "var(--app-fg)",
                      borderRadius: 8,
                      cursor: "pointer",
                      padding: 0,
                      lineHeight: 0,
                    }}
                  >
                    {getAppIcon(n, 16)}
                  </button>
                );
              })}
            </div>
            {icon && !isAppIconName(icon) && (
              <p
                style={{
                  fontSize: 11,
                  color: "var(--app-fg-3)",
                  marginTop: 6,
                }}
              >
                Bestaande waarde &quot;{icon}&quot; (oude emoji) — kies hierboven
                een SVG om te vervangen.
              </p>
            )}
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
                  {getAppIcon(icon, 14) ??
                    (icon || (name || "T").slice(0, 1).toUpperCase())}
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
            <button
              type="button"
              onClick={() => setOpen(false)}
              style={btnSecondary}
            >
              Annuleer
            </button>
            <button type="submit" disabled={pending} style={btnPrimary(pending)}>
              {pending ? "Bezig…" : "Aanmaken"}
            </button>
          </div>
        </form>
      </dialog>
    </>
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
