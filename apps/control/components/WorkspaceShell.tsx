// Client wrapper around the Rail + Header. We keep this as a single client
// component so both the rail and the header share the same navigation
// callbacks (workspace switch, page jump) without prop-drilling.

"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

import { Header } from "@aio/ui/header";
import { Rail, type RailItem } from "@aio/ui/rail";

import type { WorkspaceListItem } from "../lib/auth/workspace";
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
  children: ReactNode;
};

export function WorkspaceShell({
  profile,
  workspace,
  workspaces,
  children,
}: Props) {
  const router = useRouter();

  const profileItem: RailItem = {
    id: "me",
    name: profile.displayName,
    sub: "Owner",
    letter: profile.letter,
    // narrow runtime variant -> RailItem variant. We trust the DB column.
    variant: (profile.variant ?? "orange") as RailItem["variant"],
  };

  // Phase 2 will replace this empty array with `select * from businesses
  // where workspace_id = workspace.id`. For now the rail is intentionally
  // empty so the empty-state CTA does the talking.
  const businesses: RailItem[] = [];

  return (
    <div className="app-shell">
      <Rail
        profile={profileItem}
        businesses={businesses}
        page="dashboard"
        onSelectProfile={() =>
          router.push(`/${workspace.slug}/profile`)
        }
        onOpenSettings={() =>
          router.push(`/${workspace.slug}/settings`)
        }
        onCreateBusiness={() =>
          router.push(`/${workspace.slug}/dashboard?new=1`)
        }
      />

      <main className="app-main">
        <Header
          crumb={{
            workspaceName: workspace.name,
            workspaceLetter: workspace.name.slice(0, 1).toUpperCase(),
            pageTitle: "Dashboard",
          }}
          notifications={0}
          avatarLetter={profile.letter}
        />

        <div style={{ padding: "16px 22px 0" }}>
          <WorkspaceSwitcher
            current={{ slug: workspace.slug, name: workspace.name }}
            workspaces={workspaces}
          />
        </div>

        {children}
      </main>
    </div>
  );
}
