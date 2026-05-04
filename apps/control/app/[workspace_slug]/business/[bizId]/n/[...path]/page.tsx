// Recursive nav drill page. URL path = [bizId, "n", ...nodeIds]. We
// resolve the node chain server-side, render breadcrumb + the deepest
// node's children + a "+ Sub" button. If the deepest node has an
// `href` set, we render a "Open externe app →" link too — that's how
// nav_nodes can absorb existing Next.js apps as zones.

import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { getAppIcon } from "@aio/ui/icon";

import {
  getCurrentUser,
  getWorkspaceBySlug,
} from "../../../../../../lib/auth/workspace";
import { listAgentsForWorkspace } from "../../../../../../lib/queries/agents";
import { listBusinesses } from "../../../../../../lib/queries/businesses";
import {
  listNavNodes,
  resolveNavPath,
} from "../../../../../../lib/queries/nav-nodes";
import { GenerateDashboardCard } from "../../../../../../components/GenerateDashboardCard";
import { NewNavNodeButton } from "../../../../../../components/NewNavNodeButton";
import { TopicDashboard } from "../../../../../../components/TopicDashboard";
import { TopicRoutinesList } from "../../../../../../components/TopicRoutinesList";

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

  const [businesses, chain, allAgents] = await Promise.all([
    listBusinesses(workspace.id),
    resolveNavPath(bizId, path),
    listAgentsForWorkspace(workspace.id),
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
            {/* b.icon holds a registry key (e.g. "chat") — never
                an emoji glyph. Rendering it as text leaks "chat
                Outreach" into the breadcrumb. We only render the
                name; the SVG icon already lives next to the same
                node in the rail. */}
            {i < breadcrumb.length - 1 ? (
              <Link
                href={b.href}
                style={{ color: "var(--app-fg-2)", fontWeight: 600 }}
              >
                {b.name}
              </Link>
            ) : (
              <span style={{ color: "var(--app-fg)", fontWeight: 700 }}>
                {b.name}
              </span>
            )}
          </span>
        ))}
      </div>

      <div className="page-title-row">
        {/* Same reasoning as the business root page: icon is a
            registry-key string, not a glyph — render only the name
            so we don't leak "video Faceless YouTube" into the h1. */}
        <h1>{current?.name}</h1>
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

      {current && (
        <>
          <TopicDashboard
            workspaceSlug={workspace.slug}
            workspaceId={workspace.id}
            businessId={biz.id}
            navNodeId={current.id}
            includeDescendants
          />
          <GenerateDashboardCard
            workspaceSlug={workspace.slug}
            workspaceId={workspace.id}
            businessId={biz.id}
            navNodeId={current.id}
            navNodeName={current.name}
            agents={allAgents.filter(
              (a) => a.business_id === biz.id || a.business_id === null,
            )}
          />
          <TopicRoutinesList
            workspaceSlug={workspace.slug}
            workspaceId={workspace.id}
            businessId={biz.id}
            navNodeId={current.id}
            includeDescendants
          />
        </>
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
              {/* Render registered icons through the icon component
                  registry so they pick up the variant's foreground
                  color via currentColor. Used to render the literal
                  string "folder" which showed up as black text on the
                  variant background. */}
              {getAppIcon(c.icon, 20) ?? c.letter}
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
