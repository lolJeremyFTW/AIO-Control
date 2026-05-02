// Recursive nav drill page. URL path = [bizId, "n", ...nodeIds]. We
// resolve the node chain server-side, render breadcrumb + the deepest
// node's children + a "+ Sub" button. If the deepest node has an
// `href` set, we render a "Open externe app →" link too — that's how
// nav_nodes can absorb existing Next.js apps as zones.

import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import {
  getCurrentUser,
  getWorkspaceBySlug,
} from "../../../../../../lib/auth/workspace";
import { listBusinesses } from "../../../../../../lib/queries/businesses";
import {
  listNavNodes,
  resolveNavPath,
} from "../../../../../../lib/queries/nav-nodes";
import { NewNavNodeButton } from "../../../../../../components/NewNavNodeButton";

type Props = {
  params: Promise<{
    workspace_slug: string;
    bizId: string;
    path: string[];
  }>;
};

export default async function NavNodePage({ params }: Props) {
  const { workspace_slug, bizId, path } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const workspace = await getWorkspaceBySlug(workspace_slug);
  if (!workspace) notFound();

  const [businesses, chain] = await Promise.all([
    listBusinesses(workspace.id),
    resolveNavPath(bizId, path),
  ]);
  const biz = businesses.find((b) => b.id === bizId);
  if (!biz) notFound();
  if (chain.length !== path.length) notFound();
  const current = chain[chain.length - 1];
  const children = current
    ? await listNavNodes(bizId, current.id)
    : [];

  const baseHref = `/${workspace.slug}/business/${biz.id}`;
  const breadcrumb = [
    { name: biz.name, href: baseHref, icon: biz.icon },
    ...chain.map((n, i) => ({
      name: n.name,
      icon: n.icon,
      href: `${baseHref}/n/${path.slice(0, i + 1).join("/")}`,
    })),
  ];

  return (
    <div className="content">
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          flexWrap: "wrap",
          fontSize: 13,
          color: "var(--app-fg-3)",
          marginBottom: 12,
        }}
      >
        {breadcrumb.map((b, i) => (
          <span
            key={i}
            style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
          >
            {i > 0 && <span>›</span>}
            {i < breadcrumb.length - 1 ? (
              <Link
                href={b.href}
                style={{ color: "var(--app-fg-2)", fontWeight: 600 }}
              >
                {b.icon ? `${b.icon} ` : ""}
                {b.name}
              </Link>
            ) : (
              <span style={{ color: "var(--app-fg)", fontWeight: 700 }}>
                {b.icon ? `${b.icon} ` : ""}
                {b.name}
              </span>
            )}
          </span>
        ))}
      </div>

      <div className="page-title-row">
        <h1>
          {current?.icon ? `${current.icon} ` : ""}
          {current?.name}
        </h1>
        <span className="sub">{current?.sub ?? "Sub-navigation"}</span>
      </div>

      {current?.href && (
        <a
          href={current.href}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "inline-block",
            padding: "8px 14px",
            border: "1.5px solid var(--tt-green)",
            background: "var(--tt-green)",
            color: "#fff",
            borderRadius: 10,
            fontWeight: 700,
            fontSize: 12.5,
            marginBottom: 18,
            textDecoration: "none",
          }}
        >
          Open externe app → {current.href}
        </a>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
          gap: 12,
          marginBottom: 18,
        }}
      >
        {children.map((c) => (
          <Link
            key={c.id}
            href={`${baseHref}/n/${[...path, c.id].join("/")}`}
            style={{
              border: "1.5px solid var(--app-border)",
              borderRadius: 14,
              padding: 14,
              background: "var(--app-card)",
              display: "flex",
              alignItems: "center",
              gap: 10,
              color: "var(--app-fg)",
            }}
          >
            <span
              className={`node ${c.variant}`}
              style={{
                ["--size" as string]: "36px",
                fontSize: c.icon ? 18 : 14,
              }}
            >
              {c.icon || c.letter}
            </span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{c.name}</div>
              {c.sub && (
                <div style={{ fontSize: 11, color: "var(--app-fg-3)" }}>
                  {c.sub}
                </div>
              )}
            </div>
          </Link>
        ))}
      </div>

      <NewNavNodeButton
        workspaceSlug={workspace.slug}
        workspaceId={workspace.id}
        businessId={biz.id}
        parentId={current?.id ?? null}
        label={
          path.length === 0
            ? "+ Nieuwe topic"
            : path.length === 1
              ? "+ Nieuwe module"
              : "+ Nieuwe sub-module"
        }
      />
    </div>
  );
}
