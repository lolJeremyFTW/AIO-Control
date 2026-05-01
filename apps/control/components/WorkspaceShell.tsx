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
  selectedBusinessId,
  page = "dashboard",
  pageTitle,
  pageSub,
  children,
}: Props) {
  const router = useRouter();
  const [newBusinessOpen, setNewBusinessOpen] = useState(false);

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
        onSelectProfile={() => router.push(`/${workspace.slug}/profile`)}
        onOpenSettings={() => router.push(`/${workspace.slug}/settings`)}
        onCreateBusiness={() => setNewBusinessOpen(true)}
        onSelectBusiness={(id) =>
          router.push(`/${workspace.slug}/business/${id}`)
        }
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
