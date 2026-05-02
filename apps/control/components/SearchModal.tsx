// Cross-table search modal. Opens via Cmd/Ctrl+K or clicking the
// search input in the header. Hits a single /api/search endpoint that
// fans out to businesses, agents, queue items, and nav nodes — RLS
// keeps results scoped to the current workspace automatically.

"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type Hit = {
  kind: "business" | "agent" | "queue" | "node" | "marketplace";
  id: string;
  title: string;
  sub?: string;
  href: string;
};

type Props = { workspaceSlug: string };

export function SearchModal({ workspaceSlug }: Props) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [loading, setLoading] = useState(false);

  // Cmd/Ctrl+K opens the modal. Listening at the document level keeps
  // the shortcut alive even when focus is in a textarea or button.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen(true);
      }
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // Also listen for clicks on the global search bar (CSS .search) so
  // the existing header element behaves as a modal trigger.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const tgt = e.target as HTMLElement | null;
      if (!tgt) return;
      const search = tgt.closest(".search");
      if (search) {
        e.preventDefault();
        setOpen(true);
      }
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  // Open/close the native <dialog> + focus the input.
  useEffect(() => {
    const dlg = dialogRef.current;
    if (!dlg) return;
    if (open && !dlg.open) dlg.showModal();
    if (!open && dlg.open) dlg.close();
    if (open) setTimeout(() => inputRef.current?.focus(), 30);
  }, [open]);

  // Debounced query.
  useEffect(() => {
    if (!open || !q.trim()) {
      setHits([]);
      return;
    }
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
        const res = await fetch(
          `${base}/api/search?q=${encodeURIComponent(q)}`,
          { signal: ctl.signal },
        );
        if (res.ok) {
          const data = (await res.json()) as { hits: Hit[] };
          setHits(data.hits ?? []);
        } else {
          setHits([]);
        }
      } catch {
        /* aborted */
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => {
      ctl.abort();
      clearTimeout(t);
    };
  }, [q, open]);

  const go = (h: Hit) => {
    setOpen(false);
    router.push(h.href);
  };

  return (
    <dialog
      ref={dialogRef}
      onClose={() => setOpen(false)}
      style={{
        background: "var(--app-card)",
        border: "1.5px solid var(--app-border)",
        borderRadius: 16,
        color: "var(--app-fg)",
        padding: 0,
        width: "calc(100% - 32px)",
        maxWidth: 580,
        boxShadow: "0 24px 60px -12px rgba(0,0,0,0.55)",
      }}
    >
      <div style={{ padding: 14, borderBottom: "1px solid var(--app-border-2)" }}>
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && hits[0]) go(hits[0]);
          }}
          placeholder="Zoek businesses, agents, queue items, marketplace…"
          style={{
            width: "100%",
            background: "transparent",
            border: "none",
            color: "var(--app-fg)",
            fontSize: 15,
            outline: "none",
            padding: 6,
          }}
        />
      </div>
      <div
        style={{
          maxHeight: 360,
          overflow: "auto",
          padding: 6,
        }}
      >
        {loading && (
          <p style={{ color: "var(--app-fg-3)", fontSize: 12, padding: 10 }}>
            Zoeken…
          </p>
        )}
        {!loading && q && hits.length === 0 && (
          <p style={{ color: "var(--app-fg-3)", fontSize: 12, padding: 10 }}>
            Geen resultaten.
          </p>
        )}
        {hits.map((h) => (
          <button
            key={`${h.kind}:${h.id}`}
            onClick={() => go(h)}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 2,
              width: "100%",
              padding: "8px 10px",
              background: "transparent",
              border: "none",
              borderRadius: 8,
              cursor: "pointer",
              textAlign: "left",
              color: "var(--app-fg)",
            }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.background = "var(--app-card-2)")
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.background = "transparent")
            }
          >
            <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span
                style={{
                  fontSize: 9.5,
                  letterSpacing: "0.16em",
                  textTransform: "uppercase",
                  color: "var(--app-fg-3)",
                  fontWeight: 700,
                  minWidth: 70,
                }}
              >
                {h.kind}
              </span>
              <span style={{ fontWeight: 600 }}>{h.title}</span>
            </span>
            {h.sub && (
              <span
                style={{
                  fontSize: 11,
                  color: "var(--app-fg-3)",
                  marginLeft: 78,
                }}
              >
                {h.sub}
              </span>
            )}
          </button>
        ))}
      </div>
      <div
        style={{
          padding: "8px 14px",
          borderTop: "1px solid var(--app-border-2)",
          fontSize: 10.5,
          color: "var(--app-fg-3)",
          display: "flex",
          gap: 12,
        }}
      >
        <span>↵ open</span>
        <span>Esc sluiten</span>
        <span style={{ marginLeft: "auto" }}>
          ⌘/Ctrl + K opent overal
        </span>
        <span>workspace: {workspaceSlug}</span>
      </div>
    </dialog>
  );
}
