// Cross-table search modal. Opens via Cmd/Ctrl+K or clicking the
// search input in the header.
//
// Two big upgrades over the previous version:
//   1. Scope toggle — All / This business / Workspace-global. When the
//      user is drilled into a business the "This business" pill auto-
//      activates so a Ctrl+K within Faceless YouTube only searches
//      THAT business by default.
//   2. Quick-action templates — when the input is empty, we render a
//      grid of common navigation shortcuts (Open queue, Failed runs,
//      Workspace agents, Cost & spend, …). Click → router.push, the
//      modal closes. No typing required for the most-frequent paths.

"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

type Hit = {
  kind: "business" | "agent" | "queue" | "node" | "marketplace";
  id: string;
  title: string;
  sub?: string;
  href: string;
};

type Scope = "all" | "business" | "global";

type Template = {
  label: string;
  hint: string;
  /** Either a relative path under /[ws] or a full URL. */
  href: string;
  /** Render only when the user is currently drilled into a business
   *  (and replace {bizId} in href). */
  requiresBusiness?: boolean;
};

const TEMPLATES: Template[] = [
  // Workspace-wide.
  { label: "Open wachtrij", hint: "HITL items te reviewen", href: "/queue" },
  { label: "Mislukte runs (24u)", hint: "Failed status laatst 24u", href: "/runs?status=failed" },
  { label: "Workspace agents", hint: "Alle agents per business", href: "/agents" },
  { label: "Activiteit", hint: "Audit log alle wijzigingen", href: "/activity" },
  { label: "Kosten & spend", hint: "Per provider / business / agent", href: "/cost" },
  { label: "Marketplace", hint: "Curated agent presets", href: "/marketplace" },
  { label: "Profile", hint: "Account voorkeuren", href: "/profile" },
  { label: "Settings · Telegram", hint: "Bot targets configureren", href: "/settings/telegram" },
  { label: "Settings · API keys", hint: "Provider keys + overrides", href: "/settings/api-keys" },
  { label: "Settings · Spend limits", hint: "Daag/maand caps", href: "/settings/spend-limits" },
  { label: "Settings · Providers", hint: "Hermes/OpenClaw/Ollama setup", href: "/settings/providers" },
  // Business-scoped — only when drilled in.
  { label: "Deze business: agents", hint: "Per-business agents lijst", href: "/business/{bizId}/agents", requiresBusiness: true },
  { label: "Deze business: routines", hint: "Cron + webhook schedules", href: "/business/{bizId}/schedules", requiresBusiness: true },
  { label: "Deze business: runs", hint: "Volledige run-historie", href: "/business/{bizId}/runs", requiresBusiness: true },
];

type Props = { workspaceSlug: string };

export function SearchModal({ workspaceSlug }: Props) {
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [loading, setLoading] = useState(false);
  const [scope, setScope] = useState<Scope>("all");

  // Detect whether the user is currently inside a business and
  // capture its id — the scope pill needs this to filter; the
  // templates substitute {bizId}.
  const currentBizId = useMemo(() => {
    const m = pathname.match(
      new RegExp(`^/${workspaceSlug}/business/([^/]+)`),
    );
    return m?.[1] ?? null;
  }, [pathname, workspaceSlug]);

  // When the modal opens AND the user is inside a business, default
  // the scope to "this business" — Ctrl+K from inside Faceless YT
  // searches Faceless YT first, not the whole workspace.
  useEffect(() => {
    if (open) setScope(currentBizId ? "business" : "all");
  }, [open, currentBizId]);

  // Cmd/Ctrl+K opens the modal.
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

  // Click on the header search bar opens the modal.
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

  // Debounced query — re-fires when scope changes too.
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
        const params = new URLSearchParams({ q });
        if (scope === "business" && currentBizId)
          params.set("business", currentBizId);
        if (scope === "global") params.set("scope", "global");
        const res = await fetch(`${base}/api/search?${params.toString()}`, {
          signal: ctl.signal,
        });
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
  }, [q, scope, currentBizId, open]);

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  const goHit = (h: Hit) => go(h.href);

  // Filter templates based on whether we're drilled into a business +
  // expand {bizId} placeholders.
  const visibleTemplates = useMemo(() => {
    return TEMPLATES.filter(
      (tpl) => !tpl.requiresBusiness || !!currentBizId,
    ).map((tpl) => ({
      ...tpl,
      fullHref:
        `/${workspaceSlug}` +
        (currentBizId
          ? tpl.href.replace("{bizId}", currentBizId)
          : tpl.href),
    }));
  }, [currentBizId, workspaceSlug]);

  return (
    <dialog
      ref={dialogRef}
      onClose={() => setOpen(false)}
      onClick={(e) => {
        if (e.target === dialogRef.current) setOpen(false);
      }}
      style={{
        background: "var(--app-card)",
        border: "1.5px solid var(--app-border)",
        borderRadius: 16,
        color: "var(--app-fg)",
        padding: 0,
        width: "calc(100% - 32px)",
        maxWidth: 640,
        boxShadow: "0 24px 60px -12px rgba(0,0,0,0.55)",
      }}
    >
      {/* Search input + scope toggles */}
      <div
        style={{
          padding: 14,
          borderBottom: "1px solid var(--app-border-2)",
          display: "grid",
          gap: 10,
        }}
      >
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && hits[0]) goHit(hits[0]);
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

        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <ScopePill
            active={scope === "all"}
            onClick={() => setScope("all")}
            label="Alles"
          />
          {currentBizId && (
            <ScopePill
              active={scope === "business"}
              onClick={() => setScope("business")}
              label="Deze business"
            />
          )}
          <ScopePill
            active={scope === "global"}
            onClick={() => setScope("global")}
            label="Workspace-global"
          />
        </div>
      </div>

      {/* Body: results when typing, templates when empty */}
      <div
        style={{
          maxHeight: 400,
          overflow: "auto",
          padding: 6,
        }}
      >
        {loading && (
          <p style={{ color: "var(--app-fg-3)", fontSize: 12, padding: 10 }}>
            Zoeken…
          </p>
        )}

        {!q && (
          <div style={{ padding: "8px 6px" }}>
            <div
              style={{
                fontSize: 10.5,
                fontWeight: 700,
                letterSpacing: 0.5,
                textTransform: "uppercase",
                color: "var(--app-fg-3)",
                margin: "0 6px 8px",
              }}
            >
              Snelle acties
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 6,
              }}
            >
              {visibleTemplates.map((tpl) => (
                <button
                  key={tpl.label}
                  onClick={() => go(tpl.fullHref)}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 2,
                    padding: "10px 12px",
                    background: "var(--app-card-2)",
                    border: "1.5px solid var(--app-border-2)",
                    borderRadius: 10,
                    cursor: "pointer",
                    textAlign: "left",
                    color: "var(--app-fg)",
                    transition:
                      "border-color 0.12s ease, background 0.12s ease",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = "var(--tt-green)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor =
                      "var(--app-border-2)";
                  }}
                >
                  <span style={{ fontSize: 13, fontWeight: 700 }}>
                    {tpl.label}
                  </span>
                  <span style={{ fontSize: 11, color: "var(--app-fg-3)" }}>
                    {tpl.hint}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {!loading && q && hits.length === 0 && (
          <p style={{ color: "var(--app-fg-3)", fontSize: 12, padding: 10 }}>
            Geen resultaten in deze scope.
          </p>
        )}

        {hits.map((h) => (
          <button
            key={`${h.kind}:${h.id}`}
            onClick={() => goHit(h)}
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
        <span style={{ marginLeft: "auto" }}>Ctrl+K opent overal</span>
        <span>workspace: {workspaceSlug}</span>
      </div>
    </dialog>
  );
}

function ScopePill({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "4px 12px",
        borderRadius: 999,
        border: "1.5px solid",
        borderColor: active ? "var(--tt-green)" : "var(--app-border-2)",
        background: active ? "rgba(57,178,85,0.12)" : "transparent",
        color: active ? "var(--tt-green)" : "var(--app-fg-2)",
        fontSize: 11.5,
        fontWeight: 700,
        cursor: "pointer",
        transition: "all 0.12s ease",
      }}
    >
      {label}
    </button>
  );
}
