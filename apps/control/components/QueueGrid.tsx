// Renders open queue items as the same hand-drawn cards from the design.
// Approve/reject are real now — they call the queue server actions and
// router.refresh()es the page so resolved items disappear.

"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

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
  return (
    <div className="queue">
      {items.map((q) => (
        <QueueCard key={q.id} item={q} workspaceSlug={workspaceSlug} />
      ))}
    </div>
  );
}

function QueueCard({
  item: q,
  workspaceSlug,
}: {
  item: QueueRow;
  workspaceSlug: string;
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
    <div className="qcard">
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
