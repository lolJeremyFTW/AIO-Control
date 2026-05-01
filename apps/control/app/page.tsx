// Phase-0 placeholder dashboard — proves the design CSS, fonts, and shared
// UI packages render. Phase 1 replaces this with auth-protected routes,
// real data from Supabase, and per-workspace state.

import { ChatIcon, PlusIcon } from "@aio/ui/icon";
import { Header } from "@aio/ui/header";
import { Rail, type RailItem } from "@aio/ui/rail";

const profile: RailItem = {
  id: "me",
  name: "Jeremy Tromp",
  sub: "Owner",
  letter: "J",
  variant: "orange",
};

// Empty array — phase 1 will populate from `select * from businesses where workspace_id = current`.
const businesses: RailItem[] = [];

export default function Home() {
  return (
    <div className="app-shell">
      <Rail profile={profile} businesses={businesses} page="dashboard" />

      <main className="app-main">
        <Header
          crumb={{
            workspaceName: "TrompTech",
            workspaceLetter: "T",
            pageTitle: "Dashboard",
            pageSub: "Mijn workspace",
          }}
          notifications={0}
          avatarLetter="J"
        />

        <div className="content">
          <div className="page-title-row">
            <h1>Welkom bij AIO Control</h1>
            <span className="sub">Phase 0 · skeleton</span>
          </div>

          <div className="empty-state">
            <h2>Maak je eerste business →</h2>
            <p>
              Hier verschijnen straks Faceless YouTube, Etsy, Blog Network en je
              andere automated mini-businesses. Voor nu is dit een lege canvas
              die bewijst dat de design tokens en fonts goed laden.
            </p>
            <button className="cta">
              <PlusIcon /> Nieuwe business
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
