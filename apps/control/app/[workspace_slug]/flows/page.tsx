// AI Flow Builder page — describe an automation, AI generates the complete
// setup (agent + schedule + skills), user reviews and creates in one click.

import { notFound, redirect } from "next/navigation";

import {
  getCurrentUser,
  getWorkspaceBySlug,
} from "../../../lib/auth/workspace";
import { listBusinesses } from "../../../lib/queries/businesses";
import { FlowBuilder } from "../../../components/FlowBuilder";

type Props = { params: Promise<{ workspace_slug: string }> };

export default async function FlowsPage({ params }: Props) {
  const { workspace_slug } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const workspace = await getWorkspaceBySlug(workspace_slug);
  if (!workspace) notFound();

  const businesses = await listBusinesses(workspace.id);

  return (
    <main
      style={{
        maxWidth: 820,
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
          AI Flow Builder
        </h1>
        <p
          style={{
            color: "var(--app-fg-3)",
            fontSize: 13.5,
            margin: "6px 0 0",
            lineHeight: 1.55,
          }}
        >
          Beschrijf een automatisering in gewoon Nederlands. AI genereert een
          compleet plan met een agent, een schedule en herbruikbare skills.
          Bekijk het plan, pas aan waar nodig, en maak alles in één klik aan.
        </p>
      </header>

      <FlowBuilder
        workspaceSlug={workspace_slug}
        workspaceId={workspace.id}
        businesses={businesses}
      />
    </main>
  );
}
