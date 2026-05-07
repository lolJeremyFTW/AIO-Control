import { notFound, redirect } from "next/navigation";

import {
  getCurrentUser,
  getWorkspaceBySlug,
} from "../../../lib/auth/workspace";
import { ImprovementsDashboard } from "../../../components/ImprovementsDashboard";
import { listImprovements } from "../../../lib/queries/improvements";

type Props = { params: Promise<{ workspace_slug: string }> };

export default async function SelfImprovingPage({ params }: Props) {
  const { workspace_slug } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const workspace = await getWorkspaceBySlug(workspace_slug);
  if (!workspace) notFound();

  const improvements = await listImprovements(workspace.id);

  return (
    <main
      style={{
        maxWidth: 1100,
        margin: "0 auto",
        padding: "24px 24px 60px",
        display: "flex",
        flexDirection: "column",
        gap: 18,
      }}
    >
      <header>
        <h1
          style={{
            fontFamily: "var(--hand)",
            fontSize: 32,
            fontWeight: 700,
            margin: 0,
          }}
        >
          Self-Improving
        </h1>
        <p
          style={{
            color: "var(--app-fg-3)",
            fontSize: 13.5,
            margin: "6px 0 0",
            lineHeight: 1.55,
          }}
        >
          Improvement voorstellen, goedkeuringen en bouw-logboek. De
          self-improving agent kan hier nieuwe voorstellen plaatsen.
          Goedgekeurde items worden gevolgd tot ze gebouwd zijn.
        </p>
      </header>

      <ImprovementsDashboard
        workspaceSlug={workspace_slug}
        workspaceId={workspace.id}
        initialImprovements={improvements}
      />
    </main>
  );
}
