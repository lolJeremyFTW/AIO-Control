// Per-business pause toggle. The worker dispatcher checks businesses.status
// and skips queued runs whose business is paused — that's our minimum
// "revenue-aware throttling" while we don't yet have proper time-window
// concurrency policies.

"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { toggleBusinessStatus } from "../app/actions/businesses";

type Props = {
  workspaceSlug: string;
  businessId: string;
  status: "running" | "paused";
};

export function PauseToggle({ workspaceSlug, businessId, status }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const next = status === "running" ? "paused" : "running";

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await toggleBusinessStatus({
            workspace_slug: workspaceSlug,
            id: businessId,
            to: next,
          });
          router.refresh();
        })
      }
      className={status === "running" ? "auto-status" : "auto-status paused"}
      style={{ cursor: pending ? "wait" : "pointer", border: "1.5px solid currentColor" }}
    >
      <span className="d" />
      {status === "running" ? "Live · auto" : "Gepauzeerd"}
      <span style={{ opacity: 0.7, fontWeight: 600, marginLeft: 4 }}>
        {pending ? "…" : "→ klik om " + (status === "running" ? "te pauzeren" : "te starten")}
      </span>
    </button>
  );
}
