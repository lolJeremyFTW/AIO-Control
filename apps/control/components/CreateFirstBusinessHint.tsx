// Empty-state CTA shown on the workspace dashboard when zero businesses
// exist. Wraps NewBusinessDialog so a single click drops the user into the
// modal — exactly mirrors the rail's "+ New business" flow.

"use client";

import { useState } from "react";

import { PlusIcon } from "@aio/ui/icon";

import { useLocale } from "../lib/i18n/client";
import { translate, type T } from "../lib/i18n/dict";
import { NewBusinessDialog } from "./NewBusinessDialog";

type Props = {
  workspaceSlug: string;
  workspaceId: string;
};

export function CreateFirstBusinessHint({
  workspaceSlug,
  workspaceId,
}: Props) {
  const locale = useLocale();
  const t: T = (key, vars) => translate(locale, key, vars);
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="empty-state">
        <h2>{t("dashboard.empty.title")}</h2>
        <p>{t("dashboard.empty.body")}</p>
        <button className="cta" onClick={() => setOpen(true)}>
          <PlusIcon /> {t("nav.newBusiness")}
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
