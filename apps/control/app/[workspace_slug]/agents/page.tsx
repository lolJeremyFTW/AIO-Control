// Workspace-wide agent overview. Shows ALL agents in the workspace
// grouped by business, with workspace-global agents (business_id IS
// NULL) in their own "Workspace" section at the top. The page is the
// single place to scan every agent regardless of which business owns
// it — the user explicitly asked for this overview.

import { notFound, redirect } from "next/navigation";

import {
  getCurrentUser,
  getWorkspaceBySlug,
} from "../../../lib/auth/workspace";
import { resolveApiKey } from "../../../lib/api-keys/resolve";
import { listAgentsForWorkspace } from "../../../lib/queries/agents";
import { listBusinesses } from "../../../lib/queries/businesses";
import { AgentsList } from "../../../components/AgentsList";
import { createSupabaseServerClient } from "../../../lib/supabase/server";

type Props = { params: Promise<{ workspace_slug: string }> };

export default async function WorkspaceAgentsPage({ params }: Props) {
  const { workspace_slug } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const workspace = await getWorkspaceBySlug(workspace_slug);
  if (!workspace) notFound();

  const supabase = await createSupabaseServerClient();
  const [
    allAgents,
    businesses,
    { data: telegramRows },
    { data: customRows },
    { data: wsDefaults },
  ] = await Promise.all([
    listAgentsForWorkspace(workspace.id, "all"),
    listBusinesses(workspace.id),
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
  ]);

  // Resolve key status across every provider used in the workspace.
  const uniqueProviders = Array.from(
    new Set(allAgents.map((a) => a.provider)),
  );
  const providerKeyStatus: Record<string, boolean> = {};
  await Promise.all(
    uniqueProviders.map(async (p) => {
      const k = await resolveApiKey(p, { workspaceId: workspace.id });
      providerKeyStatus[p] = !!k;
    }),
  );

  // Group agents per business. Workspace-global (business_id IS NULL)
  // gets its own group, then one group per business in created order.
  const globalAgents = allAgents.filter((a) => !a.business_id);
  const groups = businesses
    .map((b) => ({
      id: b.id,
      title: b.name,
      sub: b.sub ?? null,
      agents: allAgents.filter((a) => a.business_id === b.id),
    }))
    .filter((g) => g.agents.length > 0);

  const telegramTargets = (telegramRows ?? []) as {
    id: string;
    name: string;
  }[];
  const customIntegrations = (customRows ?? []) as {
    id: string;
    name: string;
  }[];
  const wsDefaultsTyped = {
    provider: (wsDefaults?.default_provider as string | null) ?? null,
    model: (wsDefaults?.default_model as string | null) ?? null,
    systemPrompt:
      (wsDefaults?.default_system_prompt as string | null) ?? null,
  };

  return (
    <div className="content">
      <div className="page-title-row">
        <h1>Workspace agents</h1>
        <span className="sub">
          Alle agents in deze workspace, gegroepeerd per business. Workspace
          agents zijn niet aan een business gekoppeld en zijn beschikbaar
          vanuit chat over de hele workspace.
        </span>
      </div>

      {/* ── Workspace-global ───────────────────────────────────── */}
      <section style={{ marginBottom: 24 }}>
        <GroupHeading
          title="Workspace"
          sub="Niet aan een business gekoppeld"
          count={globalAgents.length}
        />
        <AgentsList
          workspaceSlug={workspace.slug}
          workspaceId={workspace.id}
          businessId={null}
          agents={globalAgents}
          providerKeyStatus={providerKeyStatus}
          telegramTargets={telegramTargets}
          customIntegrations={customIntegrations}
          workspaceDefaults={wsDefaultsTyped}
        />
      </section>

      {/* ── Per business ───────────────────────────────────────── */}
      {groups.map((g) => (
        <section key={g.id} style={{ marginBottom: 24 }}>
          <GroupHeading
            title={g.title}
            sub={g.sub ?? "Business agents"}
            count={g.agents.length}
            href={`/${workspace.slug}/business/${g.id}/agents`}
          />
          <AgentsList
            workspaceSlug={workspace.slug}
            workspaceId={workspace.id}
            businessId={g.id}
            agents={g.agents}
            providerKeyStatus={providerKeyStatus}
            telegramTargets={telegramTargets}
            customIntegrations={customIntegrations}
            workspaceDefaults={wsDefaultsTyped}
          />
        </section>
      ))}

      {globalAgents.length === 0 && groups.length === 0 && (
        <p
          style={{
            color: "var(--app-fg-3)",
            fontSize: 13,
            fontStyle: "italic",
            padding: "24px 0",
          }}
        >
          Nog geen agents in deze workspace. Maak er één aan via een business
          of via de &quot;+ Nieuwe agent&quot; knop in een lege groep.
        </p>
      )}
    </div>
  );
}

function GroupHeading({
  title,
  sub,
  count,
  href,
}: {
  title: string;
  sub: string;
  count: number;
  /** When set, the title is a link — used to deep-link to the
   *  per-business agents page. */
  href?: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        gap: 12,
        margin: "0 0 12px",
        paddingBottom: 8,
        borderBottom: "1px solid var(--app-border-2)",
      }}
    >
      {href ? (
        <a
          href={href}
          style={{
            fontFamily: "var(--hand)",
            fontSize: 22,
            fontWeight: 700,
            letterSpacing: "-0.2px",
            color: "var(--app-fg)",
            textDecoration: "none",
          }}
        >
          {title}
        </a>
      ) : (
        <span
          style={{
            fontFamily: "var(--hand)",
            fontSize: 22,
            fontWeight: 700,
            letterSpacing: "-0.2px",
          }}
        >
          {title}
        </span>
      )}
      <span style={{ fontSize: 12, color: "var(--app-fg-3)" }}>{sub}</span>
      <span
        style={{
          marginLeft: "auto",
          fontSize: 11,
          color: "var(--app-fg-3)",
          fontWeight: 700,
          letterSpacing: 0.4,
          textTransform: "uppercase",
        }}
      >
        {count} agent{count === 1 ? "" : "s"}
      </span>
    </div>
  );
}
