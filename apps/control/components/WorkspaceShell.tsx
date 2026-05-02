// Client wrapper around the Rail + Header. The rail's drill-in state is
// derived from the URL: when we're on /[ws]/business/[bizId]/* the rail
// swaps to that business's topics + a back row.

"use client";

import { usePathname, useRouter } from "next/navigation";
import { useMemo, useState, type ReactNode } from "react";

import { ContextMenu, type ContextMenuItem } from "@aio/ui/context-menu";
import { Header } from "@aio/ui/header";
import {
  Rail,
  type ContextMenuOrigin,
  type RailItem,
  type Topic,
} from "@aio/ui/rail";

import type { WorkspaceListItem } from "../lib/auth/workspace";
import type { BusinessRow } from "../lib/queries/businesses";
import type { NavNode } from "../lib/queries/nav-nodes";
import { translate, type Locale, type T } from "../lib/i18n/dict";
import { signOutAction } from "../app/(auth)/actions";
import { archiveBusiness } from "../app/actions/businesses";
import { archiveNavNode } from "../app/actions/nav-nodes";
import { setLocale } from "../app/actions/locale";
import { EditNodeDialog, type EditTarget } from "./EditNodeDialog";
import { NewBusinessDialog } from "./NewBusinessDialog";
import { NewNavNodeDialog } from "./NewNavNodeDialog";
import { NotificationsBell } from "./NotificationsBell";
import { SearchModal } from "./SearchModal";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";

type Profile = {
  letter: string;
  variant: string;
  displayName: string;
  email?: string;
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
  /** Every nav_node in the workspace (across businesses). The shell
   *  filters per-business client-side as the user drills in. */
  navNodes: NavNode[];
  weather?: { city: string; date: string; temp: string };
  page?: "dashboard" | "settings" | "profile";
  /** Active UI locale — translates client-side via the dict module. */
  locale: Locale;
  children: ReactNode;
};

function makeTopics(t: T): Topic[] {
  return [
    { id: "queue", label: t("topic.queue"), path: "" },
    { id: "agents", label: t("topic.agents"), path: "/agents" },
    { id: "schedules", label: t("topic.schedules"), path: "/schedules" },
    {
      id: "integrations",
      label: t("topic.integrations"),
      path: "/integrations",
    },
  ];
}

export function WorkspaceShell({
  profile,
  workspace,
  workspaces,
  businesses,
  navNodes,
  weather,
  page: pageProp = "dashboard",
  locale,
  children,
}: Props) {
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const [newBusinessOpen, setNewBusinessOpen] = useState(false);
  const [railOpen, setRailOpen] = useState(false);
  const closeRail = () => setRailOpen(false);

  // Right-click context menu state. `menu` carries the cursor coords +
  // which kind of row was clicked. `editing` opens the EditNodeDialog
  // and `creatingChildOf` opens NewNavNodeDialog with a parent_id.
  const [menu, setMenu] = useState<
    | { x: number; y: number; origin: ContextMenuOrigin }
    | null
  >(null);
  const [editing, setEditing] = useState<EditTarget | null>(null);
  const [creatingChildOf, setCreatingChildOf] = useState<{
    businessId: string;
    parentId: string | null;
    title: string;
  } | null>(null);

  // Build a translator from the locale + the shared dict module. Memo so
  // the function reference is stable for child components that take T.
  const t: T = useMemo(
    () => (key, vars) => translate(locale, key, vars),
    [locale],
  );
  const TOPICS = useMemo(() => makeTopics(t), [t]);

  // Derive drilled state from the URL. Two flavours:
  //  /[ws]/business/<id>            → drilled into a business, no node path
  //  /[ws]/business/<id>/n/<...ids> → drilled into a nav-node tree under a
  //                                   business; the rail breadcrumb walks
  //                                   that path
  //  /[ws]/business/<id>/<tab>      → drilled into a business with a built-
  //                                   in tab selected (queue/agents/...)
  const drilledBiz = useMemo(() => {
    const m = pathname.match(
      new RegExp(`^/${workspace.slug}/business/([^/]+)(?:/(.*))?$`),
    );
    if (!m) return null;
    const biz = businesses.find((b) => b.id === m[1]);
    if (!biz) return null;
    const rest = m[2] ?? "";
    const navMatch = rest.match(/^n\/(.+)$/);
    const navPath = navMatch
      ? (navMatch[1] ?? "").split("/").filter(Boolean)
      : [];
    const tab = navMatch ? null : rest.split("/")[0] || "queue";
    return { biz, tab, navPath };
  }, [pathname, workspace.slug, businesses]);

  // Walk the nav path → resolved node objects (for breadcrumb) + the
  // children of the deepest node (for the rail mid-section).
  const navContext = useMemo(() => {
    if (!drilledBiz) return null;
    const inBiz = navNodes.filter((n) => n.business_id === drilledBiz.biz.id);
    const byId = new Map(inBiz.map((n) => [n.id, n]));
    const chain = drilledBiz.navPath
      .map((id) => byId.get(id))
      .filter((n): n is NavNode => !!n);
    const parentId = chain[chain.length - 1]?.id ?? null;
    const childrenOfParent = inBiz
      .filter((n) => n.parent_id === parentId)
      .sort((a, b) => a.sort_order - b.sort_order);
    return { chain, children: childrenOfParent };
  }, [drilledBiz, navNodes]);

  // The Topic[] the Rail renders in drilled mode is now the user-created
  // children of the deepest active node, falling back to the built-in
  // tabs (Wachtrij / Agents / Schedules / Integrations) only when the
  // user hasn't created any nav nodes yet for this business.
  const railTopics: Topic[] = useMemo(() => {
    if (!drilledBiz) return [];
    const userTopics: Topic[] = (navContext?.children ?? []).map((n) => ({
      id: n.id,
      label: `${n.icon ? n.icon + " " : ""}${n.name}`,
      // Path appended to /[ws]/business/<bizId>: nav drill always goes
      // under /n/, with all currently-selected ids preserved.
      path: `/n/${[...drilledBiz.navPath, n.id].join("/")}`,
    }));
    if (userTopics.length > 0) return userTopics;
    // Fall back to the built-in tabs as a starter set so empty
    // businesses still feel navigable.
    return TOPICS;
  }, [drilledBiz, navContext, TOPICS]);

  const selectedTopicId = useMemo(() => {
    if (!drilledBiz) return null;
    if (drilledBiz.navPath.length > 0)
      return drilledBiz.navPath[drilledBiz.navPath.length - 1] ?? null;
    return drilledBiz.tab;
  }, [drilledBiz]);

  // The page prop only matters for the top-level rail (settings vs profile vs
  // dashboard). When drilled in, we don't apply the prop styling.
  const page = drilledBiz ? "dashboard" : pageProp;

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
    // Emoji rides as the rail node's icon when set; the Node falls back to
    // letter when icon is null/undefined.
    icon: b.icon ? <span style={{ fontSize: 18 }}>{b.icon}</span> : undefined,
    variant: b.variant as RailItem["variant"],
  }));

  const drilledRailItem: RailItem | null = drilledBiz
    ? {
        id: drilledBiz.biz.id,
        name: drilledBiz.biz.name,
        sub: drilledBiz.biz.sub ?? undefined,
        letter: drilledBiz.biz.letter,
        icon: drilledBiz.biz.icon ? (
          <span style={{ fontSize: 18 }}>{drilledBiz.biz.icon}</span>
        ) : undefined,
        variant: drilledBiz.biz.variant as RailItem["variant"],
      }
    : null;

  // Build the right-click menu items based on which row the user
  // clicked. The Rail surfaces (x, y) + a typed origin descriptor; we
  // turn that into a list of actions specific to that row.
  const buildMenuItems = (origin: ContextMenuOrigin): ContextMenuItem[] => {
    if (origin.kind === "rail-bg") {
      return [
        {
          label: "Nieuwe business",
          icon: <span style={{ fontWeight: 700 }}>+</span>,
          onClick: () => setNewBusinessOpen(true),
        },
      ];
    }
    if (origin.kind === "business" || origin.kind === "drilled-business") {
      const biz = businesses.find((b) => b.id === origin.id);
      if (!biz) return [];
      return [
        {
          label: "Open",
          onClick: () =>
            router.push(`/${workspace.slug}/business/${biz.id}`),
        },
        {
          label: "Nieuw topic",
          onClick: () =>
            setCreatingChildOf({
              businessId: biz.id,
              parentId: null,
              title: `Nieuw topic in ${biz.name}`,
            }),
        },
        { kind: "separator" },
        {
          label: "Instellingen…",
          onClick: () =>
            setEditing({
              kind: "business",
              id: biz.id,
              name: biz.name,
              sub: biz.sub,
              variant: biz.variant,
              icon: biz.icon,
            }),
        },
        { kind: "separator" },
        {
          label: "Archiveer",
          danger: true,
          onClick: async () => {
            if (
              !confirm(
                `Weet je zeker dat je "${biz.name}" wilt archiveren?`,
              )
            )
              return;
            const res = await archiveBusiness({
              workspace_slug: workspace.slug,
              id: biz.id,
            });
            if (res.ok) {
              router.refresh();
              if (drilledBiz?.biz.id === biz.id) {
                router.push(`/${workspace.slug}/dashboard`);
              }
            } else {
              alert(res.error);
            }
          },
        },
      ];
    }
    if (origin.kind === "topic") {
      // Topics that are nav_nodes are editable; the built-in fallback
      // tabs (queue/agents/...) are not — we filter those out.
      const node = navNodes.find((n) => n.id === origin.id);
      if (!node || !drilledBiz) {
        return [
          {
            label: "Open",
            onClick: () => {
              const t = railTopics.find((x) => x.id === origin.id);
              if (t && drilledBiz) {
                router.push(
                  `/${workspace.slug}/business/${drilledBiz.biz.id}${t.path}`,
                );
              }
            },
          },
        ];
      }
      // Build the path to this node so "Open" navigates correctly.
      const idx = drilledBiz.navPath.indexOf(node.id);
      const pathSegments =
        idx >= 0
          ? drilledBiz.navPath.slice(0, idx + 1)
          : [...drilledBiz.navPath, node.id];
      return [
        {
          label: "Open",
          onClick: () =>
            router.push(
              `/${workspace.slug}/business/${drilledBiz.biz.id}/n/${pathSegments.join("/")}`,
            ),
        },
        {
          label: "Nieuw subtopic",
          onClick: () =>
            setCreatingChildOf({
              businessId: drilledBiz.biz.id,
              parentId: node.id,
              title: `Nieuw subtopic in ${node.name}`,
            }),
        },
        { kind: "separator" },
        {
          label: "Instellingen…",
          onClick: () =>
            setEditing({
              kind: "navnode",
              id: node.id,
              business_id: drilledBiz.biz.id,
              name: node.name,
              variant: node.variant ?? "slate",
              icon: node.icon,
              href: node.href,
            }),
        },
        { kind: "separator" },
        {
          label: "Archiveer",
          danger: true,
          onClick: async () => {
            if (!confirm(`Topic "${node.name}" archiveren?`)) return;
            const res = await archiveNavNode({
              workspace_slug: workspace.slug,
              business_id: drilledBiz.biz.id,
              id: node.id,
            });
            if (res.ok) {
              router.refresh();
            } else {
              alert(res.error);
            }
          },
        },
      ];
    }
    return [];
  };

  return (
    <div className="app-shell">
      <Rail
        profile={profileItem}
        businesses={railBusinesses}
        selectedBusinessId={drilledBiz?.biz.id ?? null}
        page={page}
        drilledInto={drilledRailItem}
        topics={drilledBiz ? railTopics : []}
        selectedTopicId={selectedTopicId}
        onBack={() => {
          if (!drilledBiz) return;
          closeRail();
          // Walk one level up the drill: pop the deepest navPath segment
          // first, then exit to the workspace dashboard.
          if (drilledBiz.navPath.length > 0) {
            const next = drilledBiz.navPath.slice(0, -1);
            const path =
              next.length === 0
                ? `/${workspace.slug}/business/${drilledBiz.biz.id}`
                : `/${workspace.slug}/business/${drilledBiz.biz.id}/n/${next.join("/")}`;
            router.push(path);
          } else {
            router.push(`/${workspace.slug}/dashboard`);
          }
        }}
        onSelectTopic={(t) => {
          if (!drilledBiz) return;
          closeRail();
          router.push(
            `/${workspace.slug}/business/${drilledBiz.biz.id}${t.path}`,
          );
        }}
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
        onContextMenuRail={(e, origin) => {
          setMenu({ x: e.clientX, y: e.clientY, origin });
        }}
      />

      {/* Backdrop only renders below 800px (CSS gates it via display) but we
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
            pageTitle: drilledBiz
              ? drilledBiz.biz.name
              : page === "settings"
                ? "Settings"
                : page === "profile"
                  ? "Profile"
                  : "Dashboard",
            pageSub: drilledBiz?.biz.sub ?? undefined,
          }}
          notifications={0}
          avatarLetter={profile.letter}
          weather={weather}
          onToggleRail={() => setRailOpen(!railOpen)}
          userDisplayName={profile.displayName}
          userEmail={profile.email}
          bellSlot={
            <NotificationsBell
              workspaceSlug={workspace.slug}
              workspaceId={workspace.id}
            />
          }
          lang={locale.toUpperCase() as "NL" | "EN" | "DE"}
          onLangChange={(next) => {
            // Server action persists in cookie + revalidates; the page
            // re-renders with the new dict. router.refresh forces a soft
            // re-render on top of the action's revalidatePath.
            void setLocale(next.toLowerCase()).then(() => router.refresh());
          }}
          userMenu={
            <>
              <button
                role="menuitem"
                onClick={() => router.push(`/${workspace.slug}/profile`)}
              >
                {t("nav.profile")}
              </button>
              <button
                role="menuitem"
                onClick={() => router.push(`/${workspace.slug}/settings`)}
              >
                {t("nav.settings")}
              </button>
              <button
                role="menuitem"
                onClick={() => router.push(`/${workspace.slug}/marketplace`)}
              >
                Marketplace
              </button>
              <div className="sep" />
              <form action={signOutAction}>
                <button type="submit" role="menuitem">
                  {t("nav.signOut")}
                </button>
              </form>
            </>
          }
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

      {editing && (
        <EditNodeDialog
          workspaceSlug={workspace.slug}
          target={editing}
          onClose={() => setEditing(null)}
        />
      )}

      {creatingChildOf && (
        <NewNavNodeDialog
          workspaceSlug={workspace.slug}
          workspaceId={workspace.id}
          businessId={creatingChildOf.businessId}
          parentId={creatingChildOf.parentId}
          title={creatingChildOf.title}
          onClose={() => setCreatingChildOf(null)}
        />
      )}

      <ContextMenu
        position={menu ? { x: menu.x, y: menu.y } : null}
        items={menu ? buildMenuItems(menu.origin) : []}
        onClose={() => setMenu(null)}
      />

      {/* Mounted once at the shell level — listens for ⌘/Ctrl+K and clicks
          on the header's .search element to open the cross-table search. */}
      <SearchModal workspaceSlug={workspace.slug} />
    </div>
  );
}
