// Shared edit-popup for businesses + nav-nodes. Opens via right-click
// menu → "Instellingen" item. Dispatches the right server action
// depending on `target.kind`.
//
// Uses AppearancePicker so the appearance editing experience is
// identical across create + edit + business + nav-node.

"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { updateBusiness } from "../app/actions/businesses";
import { updateNavNode } from "../app/actions/nav-nodes";
import { AppearancePicker, type AppearanceValue } from "./AppearancePicker";

export type EditTarget =
  | {
      kind: "business";
      id: string;
      workspace_id: string;
      name: string;
      sub: string | null;
      variant: string;
      icon: string | null;
      color_hex: string | null;
      logo_url: string | null;
    }
  | {
      kind: "navnode";
      id: string;
      workspace_id: string;
      business_id: string;
      name: string;
      variant: string;
      icon: string | null;
      color_hex: string | null;
      logo_url: string | null;
      href: string | null;
    };

type Props = {
  workspaceSlug: string;
  target: EditTarget;
  onClose: () => void;
};

export function EditNodeDialog({ workspaceSlug, target, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState(target.name);
  const [sub, setSub] = useState(
    target.kind === "business" ? target.sub ?? "" : "",
  );
  const [href, setHref] = useState(
    target.kind === "navnode" ? target.href ?? "" : "",
  );
  const [appearance, setAppearance] = useState<AppearanceValue>({
    variant: target.variant ?? "slate",
    icon: target.icon ?? "",
    colorHex: target.color_hex,
    logoUrl: target.logo_url,
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const router = useRouter();

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  const submit = async () => {
    setError(null);
    setPending(true);
    let res;
    if (target.kind === "business") {
      res = await updateBusiness({
        workspace_slug: workspaceSlug,
        id: target.id,
        patch: {
          name,
          sub: sub || null,
          variant: appearance.variant,
          icon: appearance.icon || null,
          color_hex: appearance.colorHex,
          logo_url: appearance.logoUrl,
        },
      });
    } else {
      res = await updateNavNode({
        workspace_slug: workspaceSlug,
        business_id: target.business_id,
        id: target.id,
        patch: {
          name,
          variant: appearance.variant,
          icon: appearance.icon || null,
          color_hex: appearance.colorHex,
          logo_url: appearance.logoUrl,
          href: href || null,
        },
      });
    }
    setPending(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    onClose();
    router.refresh();
  };

  const title =
    target.kind === "business" ? "Business bewerken" : "Topic bewerken";

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
        maxWidth: 500,
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
        style={{ padding: "22px 24px", maxHeight: "85vh", overflow: "auto" }}
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
          {title}
        </h2>
        <p
          style={{
            color: "var(--app-fg-3)",
            fontSize: 12.5,
            margin: "0 0 16px",
          }}
        >
          Pas naam, kleur, logo en emoji aan. Wijzigingen zijn direct zichtbaar.
        </p>

        <Field label="Naam">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={inputStyle}
            required
          />
        </Field>

        {target.kind === "business" && (
          <Field label="Sub (optioneel)">
            <input
              value={sub}
              onChange={(e) => setSub(e.target.value)}
              placeholder="Bijv. NL Tech kanaal"
              style={inputStyle}
            />
          </Field>
        )}

        {target.kind === "navnode" && (
          <Field label="Externe link (optioneel)">
            <input
              value={href}
              onChange={(e) => setHref(e.target.value)}
              placeholder="https://..."
              style={inputStyle}
            />
          </Field>
        )}

        <AppearancePicker
          value={appearance}
          onChange={setAppearance}
          displayName={name}
          workspaceId={target.workspace_id}
        />

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
          style={{
            display: "flex",
            gap: 8,
            marginTop: 18,
            justifyContent: "flex-end",
          }}
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
            {pending ? "Bezig…" : "Opslaan"}
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
