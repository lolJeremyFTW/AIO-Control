// Client wrapper around the Rail + Header. The rail's drill-in state is
// derived from the URL: when we're on /[ws]/business/[bizId]/* the rail
// swaps to that business's topics + a back row.

"use client";

import { usePathname, useRouter } from "next/navigation";
import { useMemo, useState, type ReactNode } from "react";

import { Header } from "@aio/ui/header";
import { Rail, type RailItem, type Topic } from "@aio/ui/rail";

import type { WorkspaceListItem } from "../lib/auth/workspace";
import type { BusinessRow } from "../lib/queries/businesses";
import { translate, type Locale, type T } from "../lib/i18n/dict";
import { signOutAction } from "../app/(auth)/actions";
import { setLocale } from "../app/actions/locale";
import { NewBusinessDialog } from "./NewBusinessDialog";
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

  // Build a translator from the locale + the shared dict module. Memo so
  // the function reference is stable for child components that take T.
  const t: T = useMemo(
    () => (key, vars) => translate(locale, key, vars),
    [locale],
  );
  const TOPICS = useMemo(() => makeTopics(t), [t]);

  // Derive whether we're drilled into a specific business from the URL —
  // /[ws]/business/<id>/<topic?>. This is more reliable than threading
  // page-prop state through every page.tsx in the tree.
  const drilledBiz = useMemo(() => {
    const m = pathname.match(
      new RegExp(`^/${workspace.slug}/business/([^/]+)(?:/([^/]+))?`),
    );
    if (!m) return null;
    const biz = businesses.find((b) => b.id === m[1]);
    if (!biz) return null;
    const topicSlug = m[2] ?? "queue";
    const topicId =
      TOPICS.find((t) => t.id === topicSlug)?.id ??
      (topicSlug === "" ? "queue" : "queue");
    return { biz, topicId };
  }, [pathname, workspace.slug, businesses]);

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
    variant: b.variant as RailItem["variant"],
  }));

  const drilledRailItem: RailItem | null = drilledBiz
    ? {
        id: drilledBiz.biz.id,
        name: drilledBiz.biz.name,
        sub: drilledBiz.biz.sub ?? undefined,
        letter: drilledBiz.biz.letter,
        variant: drilledBiz.biz.variant as RailItem["variant"],
      }
    : null;

  return (
    <div className="app-shell">
      <Rail
        profile={profileItem}
        businesses={railBusinesses}
        selectedBusinessId={drilledBiz?.biz.id ?? null}
        page={page}
        drilledInto={drilledRailItem}
        topics={drilledBiz ? TOPICS : []}
        selectedTopicId={drilledBiz?.topicId ?? null}
        onBack={() => {
          closeRail();
          router.push(`/${workspace.slug}/dashboard`);
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
    </div>
  );
}
