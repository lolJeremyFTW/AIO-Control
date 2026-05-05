// Workspace-level integrations overview — shows all connected services
// across every business in the workspace in one place.

import { notFound, redirect } from "next/navigation";
import Link from "next/link";

import {
  getCurrentUser,
  getWorkspaceBySlug,
} from "../../../../lib/auth/workspace";
import { listBusinesses } from "../../../../lib/queries/businesses";
import { listAllIntegrationsForWorkspace } from "../../../../lib/queries/integrations";

type Props = {
  params: Promise<{ workspace_slug: string }>;
};

const STATUS_COLOR: Record<string, string> = {
  connected: "var(--tt-green)",
  disconnected: "var(--app-fg-3)",
  expired: "var(--amber)",
  error: "var(--rose)",
};

export default async function SettingsIntegrationsPage({ params }: Props) {
  const { workspace_slug } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const workspace = await getWorkspaceBySlug(workspace_slug);
  if (!workspace) notFound();

  const [businesses, integrations] = await Promise.all([
    listBusinesses(workspace.id),
    listAllIntegrationsForWorkspace(workspace.id),
  ]);

  const bizMap = new Map(businesses.map((b) => [b.id, b.name]));

  return (
    <>
      <div className="page-title-row">
        <h1>Integraties</h1>
        <span className="sub">Verbindingen per business</span>
      </div>

      {integrations.length === 0 ? (
        <div className="empty-state">
          <h2>Geen integraties</h2>
          <p>
            Ga naar een business en voeg verbindingen toe via de Integraties
            tab.
          </p>
          <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
            {businesses.map((biz) => (
              <Link
                key={biz.id}
                href={`/${workspace_slug}/business/${biz.id}/integrations`}
                className="cta"
              >
                {biz.name}
              </Link>
            ))}
          </div>
        </div>
      ) : (
        <>
          <div className="card">
            {integrations.map((integration, idx) => (
              <div
                key={integration.id}
                className="field"
                style={idx === 0 ? { borderTop: "none", paddingTop: 4 } : undefined}
              >
                <span className="lbl">
                  {integration.name}
                  <small>
                    {integration.business_id
                      ? bizMap.get(integration.business_id) ?? "Business"
                      : "Workspace"}
                  </small>
                </span>
                <span className="val">{integration.provider}</span>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: STATUS_COLOR[integration.status] ?? "var(--app-fg-3)",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                  }}
                >
                  {integration.status}
                </span>
              </div>
            ))}
          </div>

          <div className="card" style={{ marginTop: 0 }}>
            <h3 style={{ fontFamily: "var(--hand)", fontSize: 18, margin: "0 0 12px" }}>
              Beheren
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {businesses.map((biz) => (
                <Link
                  key={biz.id}
                  href={`/${workspace_slug}/business/${biz.id}/integrations`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "10px 14px",
                    borderRadius: 10,
                    border: "1px solid var(--app-border)",
                    background: "var(--app-card-2)",
                    fontSize: 13,
                    fontWeight: 600,
                    color: "var(--app-fg)",
                    textDecoration: "none",
                  }}
                >
                  <span>{biz.name}</span>
                  <span style={{ color: "var(--app-fg-3)", fontSize: 11 }}>
                    {integrations.filter((i) => i.business_id === biz.id).length} verbindingen →
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </>
      )}
    </>
  );
}
