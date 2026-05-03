// Renders open queue items as the same hand-drawn cards from the design.
// Approve/reject are real now — they call the queue server actions and
// router.refresh()es the page so resolved items disappear.

"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { ContextMenu, type ContextMenuItem } from "@aio/ui/context-menu";

import {
  approveQueueItem,
  rejectQueueItem,
} from "../app/actions/queue";
import type { QueueRow } from "../lib/queries/businesses";

type Props = {
  items: QueueRow[];
  workspaceSlug: string;
};

export function QueueGrid({ items, workspaceSlug }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [menu, setMenu] = useState<{
    x: number;
    y: number;
    item: QueueRow;
  } | null>(null);

  const buildMenu = (q: QueueRow): ContextMenuItem[] => {
    const decide = (decision: "approve" | "reject") =>
      startTransition(async () => {
        const fn = decision === "approve" ? approveQueueItem : rejectQueueItem;
        await fn({
          id: q.id,
          workspace_slug: workspaceSlug,
          business_id: q.business_id,
        });
        router.refresh();
      });
    return [
      {
        label: "✓ Approve",
        onClick: () => decide("approve"),
      },
      {
        label: "✗ Reject",
        danger: true,
        onClick: () => decide("reject"),
      },
      { kind: "separator" },
      {
        label: "Open business",
        onClick: () => {
          if (q.business_id) {
            router.push(`/${workspaceSlug}/business/${q.business_id}`);
          }
        },
        disabled: !q.business_id,
      },
      {
        label: "Kopieer titel",
        onClick: () => navigator.clipboard.writeText(q.title),
      },
    ];
  };

  return (
    <>
      <div className="queue">
        {items.map((q) => (
          <QueueCard
            key={q.id}
            item={q}
            workspaceSlug={workspaceSlug}
            onContextMenu={(e) =>
              setMenu({ x: e.clientX, y: e.clientY, item: q })
            }
          />
        ))}
      </div>
      <ContextMenu
        position={menu ? { x: menu.x, y: menu.y } : null}
        items={menu ? buildMenu(menu.item) : []}
        onClose={() => setMenu(null)}
      />
    </>
  );
}

function QueueCard({
  item: q,
  workspaceSlug,
  onContextMenu,
}: {
  item: QueueRow;
  workspaceSlug: string;
  onContextMenu: (e: React.MouseEvent) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const cls = q.state === "fail" ? "bad" : q.state === "review" ? "warn" : "";
  const pct = Number(q.confidence ?? 0) * 100;

  const decide = (decision: "approve" | "reject") =>
    startTransition(async () => {
      const fn = decision === "approve" ? approveQueueItem : rejectQueueItem;
      await fn({
        id: q.id,
        workspace_slug: workspaceSlug,
        business_id: q.business_id,
      });
      router.refresh();
    });

  return (
    <div
      className="qcard"
      onContextMenu={(e) => {
        e.preventDefault();
        // Stop the bubble — without this the global AppContextMenu
        // also opens behind our card-specific menu.
        e.stopPropagation();
        onContextMenu(e);
      }}
    >
      <span className={`pill ${cls}`.trim()}>
        {q.state === "fail"
          ? "Handmatige check"
          : q.state === "review"
            ? "Review (HITL)"
            : "Auto"}
      </span>
      <div className="ttl">{q.title}</div>
      {q.meta && <div className="meta">{q.meta}</div>}
      <div>
        <div className="row-line">
          <span>Confidence</span>
          <span>{Math.round(pct)}%</span>
        </div>
        <div className="bar">
          <i
            className={cls}
            style={{ width: `${Math.max(2, Math.min(100, pct))}%` }}
          />
        </div>
      </div>
      <div className="actions">
        {q.state === "fail" ? (
          <>
            <button disabled={pending} onClick={() => decide("reject")}>
              Skip
            </button>
            <button
              disabled={pending}
              className="go"
              onClick={() => decide("approve")}
            >
              {pending ? "Bezig…" : "Fix & resubmit"}
            </button>
          </>
        ) : q.state === "review" ? (
          <>
            <button disabled={pending} onClick={() => decide("reject")}>
              {pending ? "…" : "Reject"}
            </button>
            <button
              disabled={pending}
              className="go"
              onClick={() => decide("approve")}
            >
              {pending ? "…" : "Approve"}
            </button>
          </>
        ) : (
          <>
            <button disabled={pending} onClick={() => decide("reject")}>
              Pauze
            </button>
            <button
              disabled={pending}
              className="go"
              onClick={() => decide("approve")}
            >
              Open
            </button>
          </>
        )}
      </div>
    </div>
  );
}
