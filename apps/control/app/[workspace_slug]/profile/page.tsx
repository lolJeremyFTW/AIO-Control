// Profile page — minimal phase-2 stub. Hero card with the user's avatar +
// stats placeholder; activity timeline lights up once we ship audit-log
// rendering.

import { redirect } from "next/navigation";

import {
  getCurrentUser,
  getProfile,
} from "../../../lib/auth/workspace";

export default async function ProfilePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const profile = await getProfile(user.id);
  if (!profile) redirect("/login");

  return (
    <div className="content">
      <div className="page-title-row">
        <h1>Profile</h1>
        <span className="sub">Operator</span>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "auto 1fr auto",
          gap: 22,
          alignItems: "center",
          background: "var(--app-card)",
          border: "1.5px solid var(--app-border)",
          borderRadius: 16,
          padding: 24,
          marginBottom: 18,
        }}
      >
        <div
          className={`node ${profile.avatar_variant ?? "orange"}`}
          style={{
            ["--size" as string]: "88px",
            fontSize: 34,
            boxShadow:
              "0 0 0 4px var(--app-bg), 0 0 0 6px var(--tt-green)",
          }}
        >
          {profile.avatar_letter ?? "U"}
        </div>
        <div>
          <h2
            style={{
              fontFamily: "var(--hand)",
              fontSize: 30,
              fontWeight: 700,
              margin: "0 0 4px",
              letterSpacing: "-0.3px",
            }}
          >
            {profile.display_name}
          </h2>
          <div style={{ color: "var(--app-fg-3)", fontSize: 13 }}>
            {profile.email}
          </div>
        </div>
        <div />
      </div>
    </div>
  );
}
