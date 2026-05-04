// Workspace-wide skills page. Lists all skills + lets editors
// create / edit / archive. Pattern lifted from OpenClaw's SKILL.md
// design — each skill is a markdown snippet with a name and a
// "when to use" description. The system-prompt builder injects a
// skill's body into an agent's preamble when the agent has the
// skill in its allowed_skills array.

import { notFound, redirect } from "next/navigation";

import {
  getCurrentUser,
  getWorkspaceBySlug,
} from "../../../lib/auth/workspace";
import { listSkillsForWorkspace } from "../../../lib/queries/skills";
import { SkillsManager } from "../../../components/SkillsManager";

type Props = { params: Promise<{ workspace_slug: string }> };

export default async function SkillsPage({ params }: Props) {
  const { workspace_slug } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const workspace = await getWorkspaceBySlug(workspace_slug);
  if (!workspace) notFound();

  const skills = await listSkillsForWorkspace(workspace.id);

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
          Skills
        </h1>
        <p
          style={{
            color: "var(--app-fg-3)",
            fontSize: 13.5,
            margin: "6px 0 0",
            lineHeight: 1.55,
          }}
        >
          Herbruikbare procedurele kennis voor agents. Een skill is een
          markdown-snippet met een naam, een korte beschrijving (wanneer
          gebruik je 'm) en een body (de instructies). Per agent kies je
          welke skills die mag laden — alleen die worden in de system-
          prompt geïnjecteerd. Patroon overgenomen van OpenClaw's SKILL.md.
        </p>
      </header>

      <SkillsManager
        workspaceSlug={workspace_slug}
        workspaceId={workspace.id}
        initialSkills={skills}
      />
    </main>
  );
}
