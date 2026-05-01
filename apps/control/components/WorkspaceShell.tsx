// Client wrapper around the Rail + Header. We keep this as a single client
// component so both the rail and the header share the same navigation
// callbacks (workspace switch, page jump) without prop-drilling.

"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";

import { Header } from "@aio/ui/header";
import { Rail, type RailItem } from "@aio/ui/rail";

import type { WorkspaceListItem } from "../lib/auth/workspace";
import type { BusinessRow } from "../lib/queries/businesses";
import { NewBusinessDialog } from "./NewBusinessDialog";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";

type Profile = {
  letter: string;
  variant: string;
  displayName: string;
};

type Workspace = {
  id: string;
  slug: string;
  name: string;
};

type Props = {
  profile: Profile;
  workspace: Workspace;
  workspaces: WorkspaceListItem[];
  businesses: BusinessRow[];
  weather?: { city: string; date: string; temp: string };
  selectedBusinessId?: string | null;
  page?: "dashboard" | "settings" | "profile";
  pageTitle?: string;
  pageSub?: string;
  children: ReactNode;
};

export function WorkspaceShell({
  profile,
  workspace,
  workspaces,
  businesses,
  weather,
  selectedBusinessId,
  page = "dashboard",
  pageTitle,
  pageSub,
  children,
}: Props) {
  const router = useRouter();
  const [newBusinessOpen, setNewBusinessOpen] = useState(false);
  const [railOpen, setRailOpen] = useState(false);
  const closeRail = () => setRailOpen(false);

  const profileItem: RailItem = {
    id: "me",
    name: profile.displayName,
    sub: "Owner",
    letter: profile.letter,
    variant: (profile.variant ?? "orange") as RailItem["variant"],
  };

  const railBusinesses: RailItem[] = businesses.map((b) => ({
    id: b.id,
    name: b.name,
    sub: b.sub ?? undefined,
    letter: b.letter,
    variant: b.variant as RailItem["variant"],
  }));

  const headerTitle = pageTitle ??
    (page === "settings"
      ? "Settings"
      : page === "profile"
        ? "Profile"
        : "Dashboard");

  return (
    <div className="app-shell">
      <Rail
        profile={profileItem}
        businesses={railBusinesses}
        selectedBusinessId={selectedBusinessId ?? null}
        page={page}
        mobileOpen={railOpen}
        onMobileClose={closeRail}
        onSelectProfile={() => {
          closeRail();
          router.push(`/${workspace.slug}/profile`);
        }}
        onOpenSettings={() => {
          closeRail();
          router.push(`/${workspace.slug}/settings`);
        }}
        onCreateBusiness={() => {
          closeRail();
          setNewBusinessOpen(true);
        }}
        onSelectBusiness={(id) => {
          closeRail();
          router.push(`/${workspace.slug}/business/${id}`);
        }}
      />

      {/* Backdrop only renders below 900px (CSS gates it via display) but we
          render the node unconditionally so the show/hide animation can run. */}
      <div
        className={"rail-backdrop " + (railOpen ? "is-open" : "")}
        onClick={closeRail}
        aria-hidden={!railOpen}
      />

      <main className="app-main">
        <Header
          crumb={{
            workspaceName: workspace.name,
            workspaceLetter: workspace.name.slice(0, 1).toUpperCase(),
            pageTitle: headerTitle,
            pageSub,
          }}
          notifications={0}
          avatarLetter={profile.letter}
          weather={weather}
          onToggleRail={() => setRailOpen((v) => !v)}
        />

        {workspaces.length > 1 && (
          <div style={{ padding: "16px 22px 0" }}>
            <WorkspaceSwitcher
              current={{ slug: workspace.slug, name: workspace.name }}
              workspaces={workspaces}
            />
          </div>
        )}

        {children}
      </main>

      {newBusinessOpen && (
        <NewBusinessDialog
          workspaceSlug={workspace.slug}
          workspaceId={workspace.id}
          onClose={() => setNewBusinessOpen(false)}
        />
      )}
    </div>
  );
}
