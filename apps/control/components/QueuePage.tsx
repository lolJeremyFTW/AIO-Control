// Workspace-wide queue browser. Filter pills (state, business),
// "show resolved" toggle, paginated 50-per-load. Each row uses the
// same approve/reject server actions as the dashboard QueueGrid.

"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { ContextMenu, type ContextMenuItem } from "@aio/ui/context-menu";

import {
  approveQueueItem,
  rejectQueueItem,
} from "../app/actions/queue";
import type { BusinessRow } from "../lib/queries/businesses";

type QueueItem = {
  id: string;
  business_id: string | null;
  state: "auto" | "review" | "fail";
  confidence: string | number;
  title: string;
  meta: string | null;
  resolved_at: string | null;
  decision: "approve" | "reject" | null;
  created_at: string;
};

const PAGE_SIZE = 50;

type Props = {
  workspaceSlug: string;
  workspaceId: string;
  businesses: BusinessRow[];
  stateFilter: string | null;
  businessFilter: string | null;
  showResolved: boolean;
};

export function QueuePage({
  workspaceSlug,
  workspaceId,
  businesses,
  stateFilter,
  businessFilter,
  showResolved,
}: Props) {
  const router = useRouter();
  const search = useSearchParams();
  const [items, setItems] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const [menu, setMenu] = useState<{
    x: number;
    y: number;
    item: QueueItem;
  } | null>(null);

  useEffect(() => {
    setItems([]);
    setOffset(0);
    setHasMore(false);
  }, [stateFilter, businessFilter, showResolved]);

  useEffect(() => {
    const ctl = new AbortController();
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({
      workspace: workspaceId,
      limit: String(PAGE_SIZE),
      offset: String(offset),
    });
    if (stateFilter) params.set("state", stateFilter);
    if (businessFilter) params.set("business", businessFilter);
    if (showResolved) params.set("show", "all");
    const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
    fetch(`${base}/api/queue?${params.toString()}`, { signal: ctl.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(await res.text());
        return res.json() as Promise<{ items: QueueItem[]; hasMore: boolean }>;
      })
      .then((data) => {
        setItems((prev) =>
          offset === 0 ? data.items : [...prev, ...data.items],
        );
        setHasMore(data.hasMore);
      })
      .catch((err) => {
        if (err instanceof Error && err.name !== "AbortError") {
          setError(err.message);
        }
      })
      .finally(() => setLoading(false));
    return () => ctl.abort();
  }, [workspaceId, stateFilter, businessFilter, showResolved, offset]);

  const setQueryFilter = (k: "state" | "business" | "show", v: string | null) => {
    const sp = new URLSearchParams(search.toString());
    if (v) sp.set(k, v);
    else sp.delete(k);
    router.push(`/${workspaceSlug}/queue?${sp.toString()}`);
  };

  const businessName = (id: string | null) =>
    id ? (businesses.find((b) => b.id === id)?.name ?? "—") : "—";

  const decide = (q: QueueItem, dec: "approve" | "reject") =>
    startTransition(async () => {
      const fn = dec === "approve" ? approveQueueItem : rejectQueueItem;
      await fn({
        id: q.id,
        workspace_slug: workspaceSlug,
        business_id: q.business_id ?? undefined,
      });
      // Optimistically remove (or update) the row.
      setItems((prev) =>
        showResolved
          ? prev.map((x) =>
              x.id === q.id
                ? {
                    ...x,
                    decision: dec,
                    resolved_at: new Date().toISOString(),
                  }
                : x,
            )
          : prev.filter((x) => x.id !== q.id),
      );
    });

  const buildMenu = (q: QueueItem): ContextMenuItem[] => [
    {
      label: "✓ Approve",
      onClick: () => decide(q, "approve"),
      disabled: !!q.resolved_at,
    },
    {
      label: "✗ Reject",
      danger: true,
      onClick: () => decide(q, "reject"),
      disabled: !!q.resolved_at,
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

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Pill
          active={!stateFilter}
          label="Alle states"
          onClick={() => setQueryFilter("state", null)}
        />
        {(["review", "fail", "auto"] as const).map((s) => (
          <Pill
            key={s}
            active={stateFilter === s}
            label={s}
            onClick={() => setQueryFilter("state", s)}
          />
        ))}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Pill
          active={!businessFilter}
          label="Alle businesses"
          onClick={() => setQueryFilter("business", null)}
        />
        {businesses.map((b) => (
          <Pill
            key={b.id}
            active={businessFilter === b.id}
            label={b.name}
            onClick={() => setQueryFilter("business", b.id)}
          />
        ))}
      </div>
      <label
        style={{
          display: "flex",
          gap: 6,
          alignItems: "center",
          fontSize: 12,
          color: "var(--app-fg-2)",
          cursor: "pointer",
        }}
      >
        <input
          type="checkbox"
          checked={showResolved}
          onChange={(e) =>
            setQueryFilter("show", e.target.checked ? "all" : null)
          }
          style={{ accentColor: "var(--tt-green)" }}
        />
        Toon ook opgeloste items
      </label>

      {error && (
        <p style={{ color: "var(--rose)", fontSize: 12 }}>{error}</p>
      )}

      {!loading && items.length === 0 ? (
        <p
          style={{
            color: "var(--app-fg-3)",
            fontSize: 13,
            padding: 16,
            border: "1.5px dashed var(--app-border)",
            borderRadius: 12,
          }}
        >
          Geen queue items voor deze filter.
        </p>
      ) : (
        <div
          style={{
            border: "1px solid var(--app-border)",
            borderRadius: 12,
            overflow: "hidden",
          }}
        >
          {items.map((q) => (
            <Row
              key={q.id}
              q={q}
              businessName={businessName(q.business_id)}
              onContextMenu={(e) => {
                e.preventDefault();
                setMenu({ x: e.clientX, y: e.clientY, item: q });
              }}
              onApprove={() => decide(q, "approve")}
              onReject={() => decide(q, "reject")}
            />
          ))}
        </div>
      )}

      {loading && <p style={{ fontSize: 12, color: "var(--app-fg-3)" }}>Laden…</p>}
      {hasMore && !loading && (
        <button
          onClick={() => setOffset((o) => o + PAGE_SIZE)}
          style={{
            padding: "8px 14px",
            border: "1.5px solid var(--app-border)",
            background: "transparent",
            color: "var(--app-fg)",
            borderRadius: 10,
            fontWeight: 700,
            fontSize: 12.5,
            cursor: "pointer",
            alignSelf: "center",
          }}
        >
          Meer laden
        </button>
      )}

      <ContextMenu
        position={menu ? { x: menu.x, y: menu.y } : null}
        items={menu ? buildMenu(menu.item) : []}
        onClose={() => setMenu(null)}
      />
    </div>
  );
}

function Row({
  q,
  businessName,
  onContextMenu,
  onApprove,
  onReject,
}: {
  q: QueueItem;
  businessName: string;
  onContextMenu: (e: React.MouseEvent) => void;
  onApprove: () => void;
  onReject: () => void;
}) {
  const resolved = !!q.resolved_at;
  const stateColor =
    q.state === "fail"
      ? "var(--rose)"
      : q.state === "review"
        ? "var(--amber)"
        : "var(--tt-green)";
  return (
    <div
      onContextMenu={onContextMenu}
      style={{
        padding: "10px 14px",
        background: "var(--app-card)",
        borderBottom: "1px solid var(--app-border-2)",
        display: "grid",
        gridTemplateColumns: "10px 1fr auto",
        gap: 10,
        alignItems: "center",
      }}
    >
      <span
        style={{
          width: 10,
          height: 10,
          borderRadius: 999,
          background: stateColor,
          opacity: resolved ? 0.4 : 1,
        }}
      />
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: resolved ? "var(--app-fg-3)" : "var(--app-fg)",
            textDecoration: resolved ? "line-through" : "none",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {q.title}
        </div>
        <div style={{ fontSize: 11, color: "var(--app-fg-3)", marginTop: 2 }}>
          {businessName} · {q.state}
          {resolved && q.decision ? ` → ${q.decision}` : ""} ·{" "}
          {new Date(q.created_at).toLocaleString("nl-NL")}
        </div>
      </div>
      {!resolved && (
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={onReject} style={btn}>
            ✗
          </button>
          <button onClick={onApprove} style={{ ...btn, color: "var(--tt-green)" }}>
            ✓
          </button>
        </div>
      )}
    </div>
  );
}

function Pill({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "5px 11px",
        borderRadius: 999,
        fontSize: 11.5,
        fontWeight: 700,
        border: `1.5px solid ${active ? "var(--tt-green)" : "var(--app-border)"}`,
        background: active ? "rgba(57,178,85,0.10)" : "transparent",
        color: active ? "var(--tt-green)" : "var(--app-fg-2)",
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}

const btn: React.CSSProperties = {
  padding: "4px 10px",
  border: "1px solid var(--app-border)",
  background: "transparent",
  color: "var(--app-fg-2)",
  borderRadius: 6,
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
};
