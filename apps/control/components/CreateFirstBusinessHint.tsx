// Empty-state CTA shown on the workspace dashboard when zero businesses
// exist. Wraps NewBusinessDialog so a single click drops the user into the
// modal — exactly mirrors the rail's "+ New business" flow.

"use client";

import { useState } from "react";

import { PlusIcon } from "@aio/ui/icon";

import { NewBusinessDialog } from "./NewBusinessDialog";

type Props = {
  workspaceSlug: string;
  workspaceId: string;
};

export function CreateFirstBusinessHint({
  workspaceSlug,
  workspaceId,
}: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="empty-state">
        <h2>Maak je eerste business →</h2>
        <p>
          Hier verschijnen straks Faceless YouTube, Etsy, Blog Network en je
          andere automated mini-businesses. Maak er één aan om door te gaan.
        </p>
        <button className="cta" onClick={() => setOpen(true)}>
          <PlusIcon /> Nieuwe business
        </button>
      </div>
      {open && (
        <NewBusinessDialog
          workspaceSlug={workspaceSlug}
          workspaceId={workspaceId}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
