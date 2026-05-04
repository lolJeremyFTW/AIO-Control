// Topics index for a business — flat clickable list of every nav_node
// inside the business, ordered by sort_order with depth-indented names.
// Each row links to /n/<id> which the existing routing handles. Acts as
// the destination for the BusinessTabs "Topics" tab; the rail still
// shows the nested tree for in-context drilling.

import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import {
  getCurrentUser,
  getWorkspaceBySlug,
} from "../../../../../lib/auth/workspace";
import { listFlatNavNodes } from "../../../../../lib/queries/nav-nodes";

type Props = {
  params: Promise<{ workspace_slug: string; bizId: string }>;
};

export default async function BusinessTopicsPage({ params }: Props) {
  const { workspace_slug, bizId } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const workspace = await getWorkspaceBySlug(workspace_slug);
  if (!workspace) notFound();

  const topics = await listFlatNavNodes(bizId);
  const base = `/${workspace_slug}/business/${bizId}`;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <header
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <h1
          style={{
            fontFamily: "var(--hand)",
            fontSize: 28,
            fontWeight: 700,
            margin: 0,
            letterSpacing: -0.3,
          }}
        >
          Topics
        </h1>
        <span style={{ color: "var(--app-fg-3)", fontSize: 12.5 }}>
          {topics.length} topic{topics.length === 1 ? "" : "s"} in deze business
        </span>
      </header>

      {topics.length === 0 ? (
        <p
          style={{
            color: "var(--app-fg-3)",
            fontSize: 13,
            padding: 16,
            border: "1.5px dashed var(--app-border)",
            borderRadius: 12,
          }}
        >
          Nog geen topics. Voeg er één toe via het{" "}
          <strong>+ Nieuw topic</strong> knopje in de zijbalk onder deze
          business.
        </p>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
            gap: 10,
          }}
        >
          {topics.map((t) => (
            <Link
              key={t.id}
              href={`${base}/n/${t.id}`}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "12px 14px",
                background: "var(--app-card)",
                border: "1.5px solid var(--app-border)",
                borderRadius: 12,
                textDecoration: "none",
                color: "var(--app-fg)",
                paddingLeft: 14 + t.depth * 14,
                transition: "background 0.12s, border-color 0.12s",
              }}
            >
              <span
                aria-hidden
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: "50%",
                  background: "var(--app-card-2)",
                  border: "1px dashed var(--app-border-2)",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 11,
                  fontWeight: 700,
                  color: "var(--app-fg-3)",
                  flexShrink: 0,
                }}
              >
                {t.depth > 0 ? "·" : "#"}
              </span>
              <span style={{ fontWeight: 600, fontSize: 13.5 }}>{t.name}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
