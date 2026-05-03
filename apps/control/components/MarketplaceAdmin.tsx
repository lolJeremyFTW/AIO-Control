// Admin UI for importing marketplace items. Top section: catalog
// source cards with "Preview" + "Import all" buttons. Bottom section:
// already-imported items grouped by source_provider with delete +
// open-source-link.

"use client";

import { useState, useTransition } from "react";

import {
  deleteMarketplaceItem,
  importMarketplaceItems,
  type ImportItem,
} from "../app/actions/marketplace-admin";

type SourceLite = {
  id: string;
  label: string;
  description: string;
  url: string;
};

type CatalogItem = {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  marketplace_kind: "agent" | "skill" | "plugin" | "mcp_server";
  source_url: string | null;
  source_provider: string | null;
  official: boolean;
  install_count: number;
  share_count: number;
  imported_at: string | null;
};

type Props = {
  sources: SourceLite[];
  items: CatalogItem[];
};

export function MarketplaceAdmin({ sources, items }: Props) {
  const [preview, setPreview] = useState<ImportItem[] | null>(null);
  const [previewSource, setPreviewSource] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  const fetchPreview = async (sourceId: string) => {
    setError(null);
    setInfo(null);
    setPreviewSource(sourceId);
    setPreview(null);
    const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
    const res = await fetch(
      `${base}/api/admin/marketplace/preview?source=${sourceId}`,
    );
    if (!res.ok) {
      setError(`Preview faalde (HTTP ${res.status}).`);
      return;
    }
    const data = (await res.json()) as { items: ImportItem[] };
    setPreview(data.items);
  };

  const importNow = () => {
    if (!preview || preview.length === 0) return;
    startTransition(async () => {
      const res = await importMarketplaceItems(preview);
      if (!res.ok) setError(res.error);
      else {
        setInfo(
          `${res.data.inserted} nieuwe + ${res.data.updated} bijgewerkt.`,
        );
        setPreview(null);
        setPreviewSource(null);
      }
    });
  };

  const remove = (id: string) =>
    startTransition(async () => {
      if (!confirm("Item verwijderen uit de catalog?")) return;
      const res = await deleteMarketplaceItem({ id });
      if (!res.ok) setError(res.error);
    });

  // Group items by source_provider so the "what came from where" is clear.
  const grouped = new Map<string, CatalogItem[]>();
  for (const it of items) {
    const k = it.source_provider ?? "(handmatig geseed)";
    if (!grouped.has(k)) grouped.set(k, []);
    grouped.get(k)!.push(it);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      {/* ── Sources ─────────────────────────────────────────── */}
      <section>
        <h2
          style={{
            fontFamily: "var(--hand)",
            fontSize: 22,
            fontWeight: 700,
            margin: "0 0 10px",
          }}
        >
          Catalog sources
        </h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
            gap: 12,
          }}
        >
          {sources.map((s) => (
            <div
              key={s.id}
              style={{
                border: "1.5px solid var(--app-border)",
                background: "var(--app-card)",
                borderRadius: 12,
                padding: 12,
                display: "flex",
                flexDirection: "column",
                gap: 6,
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 700 }}>{s.label}</div>
              <div style={{ fontSize: 11.5, color: "var(--app-fg-3)" }}>
                {s.description}
              </div>
              <a
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  fontSize: 10.5,
                  color: "var(--tt-green)",
                  textDecoration: "none",
                  marginTop: 4,
                  wordBreak: "break-all",
                }}
              >
                {s.url} ↗
              </a>
              <button
                onClick={() => fetchPreview(s.id)}
                disabled={busy}
                style={{
                  marginTop: 8,
                  padding: "6px 12px",
                  border: "1.5px solid var(--app-border)",
                  background: "var(--app-card-2)",
                  color: "var(--app-fg)",
                  borderRadius: 8,
                  fontWeight: 700,
                  fontSize: 12,
                  cursor: busy ? "wait" : "pointer",
                }}
              >
                {previewSource === s.id ? "Opnieuw fetchen" : "Preview"}
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* ── Preview + import ──────────────────────────────── */}
      {previewSource && (
        <section>
          <h2
            style={{
              fontFamily: "var(--hand)",
              fontSize: 20,
              fontWeight: 700,
              margin: "0 0 10px",
            }}
          >
            Preview ({preview?.length ?? 0} items)
          </h2>
          {!preview ? (
            <p style={{ fontSize: 12, color: "var(--app-fg-3)" }}>Laden…</p>
          ) : preview.length === 0 ? (
            <p style={{ fontSize: 12, color: "var(--app-fg-3)" }}>
              Geen items gevonden — deze source heeft nog geen importer of de
              catalog is leeg.
            </p>
          ) : (
            <>
              <div
                style={{
                  maxHeight: 280,
                  overflowY: "auto",
                  border: "1px solid var(--app-border)",
                  borderRadius: 10,
                  padding: 6,
                  background: "var(--app-card)",
                }}
              >
                {preview.map((p) => (
                  <div
                    key={p.slug}
                    style={{
                      padding: "6px 10px",
                      fontSize: 12,
                      borderBottom: "1px solid var(--app-border-2)",
                    }}
                  >
                    <strong>{p.name}</strong>
                    <span
                      style={{
                        marginLeft: 6,
                        color: "var(--app-fg-3)",
                        fontSize: 11,
                      }}
                    >
                      [{p.marketplace_kind}]
                    </span>
                    <div style={{ color: "var(--app-fg-3)", fontSize: 11, marginTop: 2 }}>
                      {p.tagline}
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <button
                  onClick={importNow}
                  disabled={busy}
                  style={{
                    padding: "8px 14px",
                    border: "1.5px solid var(--tt-green)",
                    background: "var(--tt-green)",
                    color: "#fff",
                    borderRadius: 10,
                    fontWeight: 700,
                    fontSize: 12.5,
                    cursor: busy ? "wait" : "pointer",
                  }}
                >
                  {busy ? "Importeren…" : `Importeer alle ${preview.length}`}
                </button>
                <button
                  onClick={() => {
                    setPreview(null);
                    setPreviewSource(null);
                  }}
                  style={{
                    padding: "8px 14px",
                    border: "1.5px solid var(--app-border)",
                    background: "transparent",
                    color: "var(--app-fg)",
                    borderRadius: 10,
                    fontWeight: 700,
                    fontSize: 12.5,
                    cursor: "pointer",
                  }}
                >
                  Annuleer
                </button>
              </div>
            </>
          )}
        </section>
      )}

      {error && (
        <p
          role="alert"
          style={{
            color: "var(--rose)",
            fontSize: 12,
            background: "rgba(230,82,107,0.08)",
            border: "1px solid rgba(230,82,107,0.4)",
            borderRadius: 8,
            padding: "8px 12px",
            margin: 0,
          }}
        >
          {error}
        </p>
      )}
      {info && (
        <p
          style={{
            color: "var(--tt-green)",
            fontSize: 12,
            background: "rgba(57,178,85,0.08)",
            border: "1px solid var(--tt-green)",
            borderRadius: 8,
            padding: "8px 12px",
            margin: 0,
          }}
        >
          {info}
        </p>
      )}

      {/* ── Already imported ──────────────────────────────── */}
      <section>
        <h2
          style={{
            fontFamily: "var(--hand)",
            fontSize: 22,
            fontWeight: 700,
            margin: "0 0 10px",
          }}
        >
          In de catalog ({items.length} totaal)
        </h2>
        {[...grouped.entries()].map(([source, group]) => (
          <div key={source} style={{ marginBottom: 16 }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: "var(--app-fg-3)",
                letterSpacing: "0.16em",
                textTransform: "uppercase",
                marginBottom: 6,
              }}
            >
              {source} · {group.length}
            </div>
            <div
              style={{
                border: "1px solid var(--app-border)",
                borderRadius: 10,
                overflow: "hidden",
              }}
            >
              {group.map((it) => (
                <div
                  key={it.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr auto auto",
                    gap: 10,
                    alignItems: "center",
                    padding: "8px 12px",
                    background: "var(--app-card)",
                    borderBottom: "1px solid var(--app-border-2)",
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>
                      {it.name}
                      {it.official && (
                        <span
                          style={{
                            marginLeft: 6,
                            fontSize: 9.5,
                            fontWeight: 700,
                            color: "var(--tt-green)",
                            letterSpacing: "0.14em",
                          }}
                        >
                          OFFICIAL
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--app-fg-3)" }}>
                      {it.marketplace_kind} ·{" "}
                      {it.install_count} installs · {it.share_count} shares
                      {it.source_url && (
                        <>
                          {" · "}
                          <a
                            href={it.source_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              color: "var(--tt-green)",
                              textDecoration: "none",
                            }}
                          >
                            source ↗
                          </a>
                        </>
                      )}
                    </div>
                  </div>
                  <a
                    href={`/share/${it.slug}`}
                    target="_blank"
                    style={{
                      fontSize: 11,
                      color: "var(--app-fg-2)",
                      textDecoration: "none",
                      padding: "5px 8px",
                      border: "1px solid var(--app-border)",
                      borderRadius: 6,
                    }}
                  >
                    Open share
                  </a>
                  <button
                    onClick={() => remove(it.id)}
                    disabled={busy}
                    style={{
                      padding: "5px 8px",
                      border: "1px solid var(--app-border)",
                      background: "transparent",
                      color: "var(--rose)",
                      borderRadius: 6,
                      fontSize: 11,
                      cursor: "pointer",
                    }}
                  >
                    Verwijder
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
