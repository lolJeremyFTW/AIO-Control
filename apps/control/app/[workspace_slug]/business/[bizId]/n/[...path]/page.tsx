// Recursive nav drill page. URL path = [bizId, "n", ...nodeIds]. We
// resolve the node chain server-side, render breadcrumb + the deepest
// node's children + a "+ Sub" button. If the deepest node has an
// `href` set, we render a "Open externe app →" link too — that's how
// nav_nodes can absorb existing Next.js apps as zones.
//
// Recognised sub-routes at the end of the path:
//   /agents  → agents assigned to this topic (nav_node_id FK)
//   /runs    → runs tagged with this topic

import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { getAppIcon } from "@aio/ui/icon";

import {
  getCurrentUser,
  getWorkspaceBySlug,
} from "../../../../../../lib/auth/workspace";
import { resolveApiKey } from "../../../../../../lib/api-keys/resolve";
import { getDict } from "../../../../../../lib/i18n/server";
import { listAgentsForWorkspace } from "../../../../../../lib/queries/agents";
import { listBusinesses, findBusiness } from "../../../../../../lib/queries/businesses";
import {
  listNavNodes,
  listFlatNavNodes,
  resolveNavPathBySlugs,
} from "../../../../../../lib/queries/nav-nodes";
import { listSkillsForWorkspace } from "../../../../../../lib/queries/skills";
import { AgentsList } from "../../../../../../components/AgentsList";
import { GenerateDashboardCard } from "../../../../../../components/GenerateDashboardCard";
import { NewNavNodeButton } from "../../../../../../components/NewNavNodeButton";
import { RunsPage } from "../../../../../../components/RunsPage";
import { SavedModuleDashboard } from "../../../../../../components/SavedModuleDashboard";
import { TopicDashboard } from "../../../../../../components/TopicDashboard";
import { TopicRoutinesList } from "../../../../../../components/TopicRoutinesList";
import { TopicTabs } from "../../../../../../components/TopicTabs";
import { getModuleDashboard } from "../../../../../../lib/queries/dashboards";
import { createSupabaseServerClient } from "../../../../../../lib/supabase/server";

const TOPIC_SUBROUTES = ["agents", "runs"] as const;
type TopicSubroute = (typeof TOPIC_SUBROUTES)[number];

type Props = {
  params: Promise<{
    workspace_slug: string;
    bizId: string;
    path: string[];
  }>;
  searchParams: Promise<{ status?: string; agent?: string; offset?: string }>;
};

export default async function NavNodePage({ params, searchParams }: Props) {
  const { workspace_slug, bizId, path } = await params;
  const sp = await searchParams;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const workspace = await getWorkspaceBySlug(workspace_slug);
  if (!workspace) notFound();

  const [businesses, allAgents] = await Promise.all([
    listBusinesses(workspace.id),
    listAgentsForWorkspace(workspace.id),
  ]);
  const biz = findBusiness(businesses, bizId);
  if (!biz) notFound();

  // Detect reserved sub-route at the end of the path.
  const lastSeg = path[path.length - 1] ?? "";
  const customTabId =
    path.length >= 3 && path[path.length - 2] === "tab" ? lastSeg : null;
  const subRoute: TopicSubroute | null = (
    TOPIC_SUBROUTES as readonly string[]
  ).includes(lastSeg) && !customTabId
    ? (lastSeg as TopicSubroute)
    : null;
  const navPath = customTabId
    ? path.slice(0, -2)
    : subRoute
      ? path.slice(0, -1)
      : path;

  // Require at least one nav segment (sub-route alone → 404).
  if (navPath.length === 0) notFound();

  // path now contains slugs; resolve to actual NavNode objects using biz.id (UUID)
  const chain = await resolveNavPathBySlugs(biz.id, navPath);
  if (chain.length !== navPath.length) notFound();
  const current = chain[chain.length - 1];
  if (!current) notFound();

  const baseHref = `/${workspace.slug}/business/${biz.slug}`;
  const topicBaseHref = `${baseHref}/n/${navPath.join("/")}`;
  const savedDashboardForTabs = await getModuleDashboard(current.id);

  // ── Agents sub-route ────────────────────────────────────────────────
  if (subRoute === "agents") {
    const supabase = await createSupabaseServerClient();
    const [skills, { data: telegramRows }, { data: customRows }, { data: wsDefaults }, navOptions, { t }] =
      await Promise.all([
        listSkillsForWorkspace(workspace.id),
        supabase
          .from("telegram_targets")
          .select("id, name")
          .eq("workspace_id", workspace.id)
          .eq("enabled", true),
        supabase
          .from("custom_integrations")
          .select("id, name")
          .eq("workspace_id", workspace.id)
          .eq("enabled", true),
        supabase
          .from("workspaces")
          .select("default_provider, default_model, default_system_prompt")
          .eq("id", workspace.id)
          .maybeSingle(),
        listFlatNavNodes(biz.id),
        getDict(),
      ]);

    const topicAgents = allAgents.filter((a) => a.nav_node_id === current.id);
    const uniqueProviders = Array.from(new Set(topicAgents.map((a) => a.provider)));
    const providerKeyStatus: Record<string, boolean> = {};
    await Promise.all(
      uniqueProviders.map(async (p) => {
        const k = await resolveApiKey(p, {
          workspaceId: workspace.id,
          businessId: biz.id,
          navNodeId: current.id,
        });
        providerKeyStatus[p] = !!k;
      }),
    );

    return (
      <>
        <TopicTabs
          baseHref={topicBaseHref}
          topicName={current.name}
          navNodeId={current.id}
          workspaceId={workspace.id}
        />
        <div className="content">
        <div className="page-title-row">
          <h1>Agents — {current.name}</h1>
          <span className="sub">{t("page.business.agents.sub")}</span>
        </div>
        <AgentsList
          workspaceSlug={workspace.slug}
          workspaceId={workspace.id}
          businessId={biz.id}
          agents={topicAgents}
          providerKeyStatus={providerKeyStatus}
          telegramTargets={(telegramRows ?? []) as { id: string; name: string }[]}
          customIntegrations={
            (customRows ?? []) as { id: string; name: string }[]
          }
          workspaceDefaults={{
            provider: (wsDefaults?.default_provider as string | null) ?? null,
            model: (wsDefaults?.default_model as string | null) ?? null,
            systemPrompt:
              (wsDefaults?.default_system_prompt as string | null) ?? null,
          }}
          navOptions={navOptions}
          availableSkills={skills.map((s) => ({
            id: s.id,
            name: s.name,
            description: s.description,
          }))}
        />
        </div>
      </>
    );
  }

  // ── Runs sub-route ──────────────────────────────────────────────────
  if (subRoute === "runs") {
    const businessAgents = allAgents.filter((a) => a.business_id === biz.id);
    return (
      <>
        <TopicTabs
          baseHref={topicBaseHref}
          topicName={current.name}
          navNodeId={current.id}
          workspaceId={workspace.id}
        />
        <div className="content">
        <div className="page-title-row">
          <h1>Runs — {current.name}</h1>
          <span className="sub">Alle runs gekoppeld aan dit topic</span>
        </div>
        <RunsPage
          workspaceSlug={workspace.slug}
          workspaceId={workspace.id}
          businessId={biz.id}
          agents={businessAgents}
          businessName={Object.fromEntries(businesses.map((b) => [b.id, b.name]))}
          statusFilter={sp.status ?? null}
          agentFilter={sp.agent ?? null}
          offset={Number(sp.offset ?? 0)}
          navNodeId={current.id}
        />
        </div>
      </>
    );
  }

  // ── Overview (default) ──────────────────────────────────────────────
  if (customTabId) {
    const supabase = await createSupabaseServerClient();
    const { data: tab } = await supabase
      .from("custom_tabs")
      .select("label, url")
      .eq("id", customTabId)
      .eq("business_id", biz.id)
      .eq("nav_node_id", current.id)
      .maybeSingle();

    if (!tab) notFound();

    return (
      <>
        <TopicTabs
          baseHref={topicBaseHref}
          topicName={current.name}
          navNodeId={current.id}
          workspaceId={workspace.id}
        />
        <div className="content">
          <iframe
            src={tab.url}
            title={tab.label}
            style={{
              width: "100%",
              height: "calc(100vh - 174px)",
              border: "1px solid var(--app-border-2)",
              borderRadius: 10,
              background: "var(--app-card)",
            }}
            allow="fullscreen"
          />
        </div>
      </>
    );
  }

  const [children, savedDashboard] = await Promise.all([
    current ? listNavNodes(biz.id, current.id) : Promise.resolve([]),
    Promise.resolve(savedDashboardForTabs),
  ]);

  const breadcrumb = [
    { name: biz.name, href: baseHref, icon: biz.icon },
    ...chain.map((n, i) => ({
      name: n.name,
      icon: n.icon,
      href: `${baseHref}/n/${navPath.slice(0, i + 1).join("/")}`,
    })),
  ];

  return (
    <>
      <TopicTabs
        baseHref={topicBaseHref}
        topicName={current?.name ?? ""}
        navNodeId={current?.id ?? ""}
        workspaceId={workspace.id}
      />
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
          {savedDashboard && (
            <SavedModuleDashboard
              workspaceSlug={workspace.slug}
              workspaceId={workspace.id}
              businessId={biz.id}
              dashboard={savedDashboard}
            />
          )}
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
            href={`${baseHref}/n/${[...navPath, c.slug].join("/")}`}
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
          navPath.length === 1
            ? "+ Nieuwe module"
            : "+ Nieuwe sub-module"
        }
      />
      </div>
    </>
  );
}

