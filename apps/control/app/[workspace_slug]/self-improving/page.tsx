import { notFound, redirect } from "next/navigation";

import {
  getCurrentUser,
  getWorkspaceBySlug,
} from "../../../lib/auth/workspace";
import { ImprovementsDashboard } from "../../../components/ImprovementsDashboard";
import { listImprovements } from "../../../lib/queries/improvements";
import { listReviewLearnings } from "../../../lib/queries/review-learnings";

type Props = { params: Promise<{ workspace_slug: string }> };

export default async function SelfImprovingPage({ params }: Props) {
  const { workspace_slug } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const workspace = await getWorkspaceBySlug(workspace_slug);
  if (!workspace) notFound();

  const [improvements, reviewLearnings] = await Promise.all([
    listImprovements(workspace.id),
    listReviewLearnings(workspace.id, 15),
  ]);

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

      <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <h2
          style={{
            fontFamily: "var(--hand)",
            fontSize: 22,
            fontWeight: 700,
            margin: 0,
          }}
        >
          HITL Learnings
        </h2>
        {reviewLearnings.length === 0 ? (
          <p
            style={{
              color: "var(--app-fg-3)",
              fontSize: 13,
              margin: 0,
            }}
          >
            Nog geen review-lessons. Zodra een agent iets in HITL zet of jij
            approve/reject klikt, verschijnt het hier.
          </p>
        ) : (
          <ul
            style={{
              listStyle: "none",
              padding: 0,
              margin: 0,
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            {reviewLearnings.map((lesson) => (
              <li
                key={lesson.id}
                style={{
                  border: "1.5px solid var(--app-border)",
                  borderRadius: 12,
                  padding: "12px 14px",
                  background: "var(--app-card)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    alignItems: "center",
                    flexWrap: "wrap",
                    marginBottom: 5,
                  }}
                >
                  <span style={{ fontWeight: 750, fontSize: 13.5 }}>
                    {lesson.title}
                  </span>
                  <span
                    style={{
                      fontSize: 11,
                      color:
                        lesson.outcome === "approved"
                          ? "var(--tt-green)"
                          : lesson.outcome === "rejected"
                            ? "var(--rose)"
                            : "var(--app-fg-3)",
                      border: "1px solid var(--app-border)",
                      borderRadius: 999,
                      padding: "2px 7px",
                    }}
                  >
                    {lesson.outcome ?? lesson.lesson_type}
                  </span>
                </div>
                <div
                  style={{
                    color: "var(--app-fg-3)",
                    fontSize: 12.5,
                    lineHeight: 1.5,
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {lesson.body}
                </div>
                <div
                  style={{
                    color: "var(--app-fg-3)",
                    fontSize: 11,
                    marginTop: 7,
                  }}
                >
                  {new Date(lesson.created_at).toLocaleString("nl-NL")}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
