"use client";

import { useRouter } from "next/navigation";
import type React from "react";
import { useEffect, useRef, useState } from "react";

import type { AgentRow } from "../lib/queries/agents";
import { ScheduleBuilder } from "./ScheduleBuilder";

type Target = { id: string; name: string };

type Props = {
  workspaceSlug: string;
  workspaceId: string;
  businessId: string;
  agents: AgentRow[];
  triggerOrigin: string;
  telegramTargets: Target[];
  customIntegrations: Target[];
  navNodes: { id: string; name: string; depth: number }[];
  initialNavNodeId?: string | null;
};

export function ScheduleBuilderDialog({
  workspaceSlug,
  workspaceId,
  businessId,
  agents,
  triggerOrigin,
  telegramTargets,
  customIntegrations,
  navNodes,
  initialNavNodeId = null,
}: Props) {
  const router = useRouter();
  const ref = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} style={btnPrimary}>
        Nieuwe schedule
      </button>

      {open && (
        <dialog
          ref={ref}
          onClose={() => setOpen(false)}
          onClick={(e) => {
            if (e.target === ref.current) setOpen(false);
          }}
          style={{
            background: "transparent",
            border: 0,
            color: "var(--app-fg)",
            padding: 0,
            width: "calc(100% - 32px)",
            maxWidth: 840,
          }}
        >
          <div style={{ maxHeight: "88vh", overflow: "auto" }}>
            <ScheduleBuilder
              workspaceSlug={workspaceSlug}
              workspaceId={workspaceId}
              businessId={businessId}
              agents={agents}
              triggerOrigin={triggerOrigin}
              telegramTargets={telegramTargets}
              customIntegrations={customIntegrations}
              navNodes={navNodes}
              initialNavNodeId={initialNavNodeId}
              onCreated={() => {
                setOpen(false);
                router.refresh();
              }}
            />
          </div>
        </dialog>
      )}
    </>
  );
}

const btnPrimary: React.CSSProperties = {
  padding: "9px 15px",
  border: "1.5px solid var(--tt-green)",
  background: "var(--tt-green)",
  color: "#fff",
  borderRadius: 10,
  fontWeight: 700,
  fontSize: 12.5,
  cursor: "pointer",
};
