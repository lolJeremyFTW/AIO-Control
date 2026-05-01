// Renders open queue items as the same hand-drawn cards from the design.
// Server component-friendly — pure markup. Server actions for approve/reject
// land in fase 2.5 once we wire the per-business detail page.

import type { QueueRow } from "../lib/queries/businesses";

type Props = { items: QueueRow[] };

export function QueueGrid({ items }: Props) {
  return (
    <div className="queue">
      {items.map((q) => {
        const cls = q.state === "fail" ? "bad" : q.state === "review" ? "warn" : "";
        const pct = Number(q.confidence ?? 0) * 100;
        return (
          <div key={q.id} className="qcard">
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
                  <button>Skip</button>
                  <button className="go">Fix &amp; resubmit</button>
                </>
              ) : q.state === "review" ? (
                <>
                  <button>Reject</button>
                  <button className="go">Approve</button>
                </>
              ) : (
                <>
                  <button>Pauze</button>
                  <button className="go">Open</button>
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
