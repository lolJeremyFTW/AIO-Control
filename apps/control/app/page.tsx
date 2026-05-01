// Root redirect.
//   - No Supabase env yet → render a setup hint so dev preview works without
//     credentials.
//   - No session → /login
//   - Signed in   → /<first-workspace-slug>/dashboard
//   - Signed in but no workspaces (rare) → /login

import { redirect } from "next/navigation";

import { ChatIcon, PlusIcon } from "@aio/ui/icon";
import { Header } from "@aio/ui/header";
import { Rail } from "@aio/ui/rail";

import {
  getCurrentUser,
  getUserWorkspaces,
} from "../lib/auth/workspace";

const SUPABASE_CONFIGURED =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
  !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export default async function RootPage() {
  if (!SUPABASE_CONFIGURED) return <SetupHint />;

  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const workspaces = await getUserWorkspaces();
  if (workspaces.length === 0) redirect("/login");

  redirect(`/${workspaces[0]!.slug}/dashboard`);
}

function SetupHint() {
  return (
    <div className="app-shell">
      <Rail
        profile={{
          id: "me",
          name: "Setup",
          sub: "configure Supabase",
          letter: "?",
          variant: "orange",
        }}
        businesses={[]}
        page="dashboard"
      />
      <main className="app-main">
        <Header
          crumb={{
            workspaceName: "AIO Control",
            workspaceLetter: "A",
            pageTitle: "Setup",
            pageSub: "phase 1 · waiting for Supabase env",
          }}
        />
        <div className="content">
          <div className="page-title-row">
            <h1>Bijna daar →</h1>
            <span className="sub">Phase 1 · setup</span>
          </div>
          <div className="empty-state">
            <h2>Configureer Supabase</h2>
            <p>
              Kopieer <code>.env.local.example</code> naar{" "}
              <code>.env.local</code> en vul{" "}
              <code>NEXT_PUBLIC_SUPABASE_URL</code> +{" "}
              <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> in (zelf-gehoste
              Supabase op de VPS, of een lokale Supabase container). Daarna run
              je migration <code>001_init.sql</code> en kun je inloggen.
            </p>
            <button className="cta" disabled style={{ opacity: 0.6 }}>
              <PlusIcon /> Wacht op env
            </button>
          </div>
        </div>
        <div className="chatbox" title="Chat met AI">
          <ChatIcon />
        </div>
      </main>
    </div>
  );
}
