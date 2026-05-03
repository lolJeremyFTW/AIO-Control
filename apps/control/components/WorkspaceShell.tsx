// Client wrapper around the Rail + Header. The rail's drill-in state is
// derived from the URL: when we're on /[ws]/business/[bizId]/* the rail
// swaps to that business's topics + a back row.

"use client";

import { usePathname, useRouter } from "next/navigation";
import { useMemo, useState, useTransition, type ReactNode } from "react";

import { ContextMenu, type ContextMenuItem } from "@aio/ui/context-menu";
import { Header } from "@aio/ui/header";
import { getAppIcon } from "@aio/ui/icon";
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
import {
  archiveBusiness,
  duplicateBusiness,
  swapBusinessOrder,
} from "../app/actions/businesses";
import {
  archiveNavNode,
  duplicateNavNode,
  moveNavNode,
  reorderNavNode,
  swapNavNodeOrder,
} from "../app/actions/nav-nodes";
import { setLocale } from "../app/actions/locale";
import { AppContextMenu } from "./AppContextMenu";
import { ThemeToggle } from "./ThemeToggle";
import { EditNodeDialog, type EditTarget } from "./EditNodeDialog";
import { BusinessSetupWizard } from "./BusinessSetupWizard";
import { NewNavNodeDialog } from "./NewNavNodeDialog";
import { NotificationsBell } from "./NotificationsBell";
import { SearchModal } from "./SearchModal";
import { TalkModule, type TalkAgent } from "./TalkModule";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";

type Profile = {
  letter: string;
  variant: string;
  displayName: string;
  email?: string;
  avatarUrl?: string | null;
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
  /** Workspace agents — used by the header's TalkModule to populate
   *  the dropdown. The chat-panel uses the same list. */
  agents?: Array<{
    id: string;
    name: string;
    business_id: string | null;
    provider: string;
    /** Optional — when omitted the TalkModule falls back to "—". */
    model?: string | null;
  }>;
  weather?: { city: string; date: string; temp: string };
  page?: "dashboard" | "settings" | "profile" | "agents";
  /** Active UI locale — translates client-side via the dict module. */
  locale: Locale;
  children: ReactNode;
};

// (Note: the built-in topic palette — queue/agents/schedules/integrations
// — used to be auto-injected when a business had no nav nodes. We
// removed that fallback so the rail shows only what the user explicitly
// created. The translation keys are kept around for the right-click
// "Agents" / "Schedules" menu items elsewhere in the app.)

/** Resolve a stored icon value to a ReactNode usable by Rail's Node.
 *  - null/empty → undefined (Node falls back to the letter glyph)
 *  - registered name (e.g. "video") → the SVG component
 *  - anything else (legacy emoji rows from before the picker switch)
 *    → kept as a small text span so existing data still renders. */
function renderNodeIcon(
  value: string | null | undefined,
  size: number,
): ReactNode | undefined {
  if (!value) return undefined;
  const svg = getAppIcon(value, size);
  if (svg) return svg;
  // Legacy emoji or stray text — render with the right line-height so
  // it sits centered in the circular node.
  return <span style={{ fontSize: size }}>{value}</span>;
}

export function WorkspaceShell({
  profile,
  workspace,
  workspaces,
  businesses,
  navNodes,
  agents = [],
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

  // Transition for the language switcher in the header. We await the
  // setLocale server action BEFORE calling router.refresh() — the
  // earlier `void setLocale(…).then(…)` ran refresh too eagerly, the
  // cookie wasn't always live yet so the new locale never got picked
  // up on the next render. The Profile editor uses the same await
  // pattern and works.
  const [, startLangTransition] = useTransition();

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

  // The Topic[] the Rail renders in drilled mode is the user-created
  // children of the deepest active node. We INTENTIONALLY do NOT fall
  // back to the built-in Wachtrij/Agents/Schedules/Integrations chips
  // anymore — Jeremy wants the rail to reflect only what the user
  // explicitly created during the business-setup flow. Clean slate
  // when no topics exist; the "+ Nieuw topic" affordance handles
  // discovery.
  const railTopics: Topic[] = useMemo(() => {
    if (!drilledBiz) return [];
    return (navContext?.children ?? []).map((n) => ({
      id: n.id,
      // Drop the emoji from the label — we render it as the node icon
      // separately so the row-text doesn't double up.
      label: n.name,
      // Path appended to /[ws]/business/<bizId>: nav drill always goes
      // under /n/, with all currently-selected ids preserved.
      path: `/n/${[...drilledBiz.navPath, n.id].join("/")}`,
      variant: (n.variant as Topic["variant"]) ?? "dashed",
      // Prefer a registered SVG icon (icon name like "video"). Old
      // emoji rows still render via the legacy span fallback so we
      // don't break existing data.
      icon: renderNodeIcon(n.icon, 16),
      colorHex: n.color_hex ?? null,
      logoUrl: n.logo_url ?? null,
    }));
  }, [drilledBiz, navContext]);

  const selectedTopicId = useMemo(() => {
    if (!drilledBiz) return null;
    if (drilledBiz.navPath.length > 0)
      return drilledBiz.navPath[drilledBiz.navPath.length - 1] ?? null;
    return drilledBiz.tab;
  }, [drilledBiz]);

  // Derive the active rail-item from the URL when drilled in we always
  // show "dashboard" highlight. When NOT drilled in, prefer the prop
  // (in case a page wants to force a specific section) but fall back
  // to deducing from the pathname so /agents / /settings / /profile
  // automatically light up the right rail row without the page having
  // to explicitly pass `page=`.
  const page: "dashboard" | "settings" | "profile" | "agents" = drilledBiz
    ? "dashboard"
    : pageProp !== "dashboard"
      ? pageProp
      : pathname.startsWith(`/${workspace.slug}/agents`)
        ? "agents"
        : pathname.startsWith(`/${workspace.slug}/settings`)
          ? "settings"
          : pathname.startsWith(`/${workspace.slug}/profile`)
            ? "profile"
            : "dashboard";

  const profileItem: RailItem = {
    id: "me",
    name: profile.displayName,
    sub: "Owner",
    letter: profile.letter,
    variant: (profile.variant ?? "orange") as RailItem["variant"],
    logoUrl: profile.avatarUrl ?? null,
  };

  // Map workspace agents to the TalkModule's display shape. Pulls
  // colour from the agent's business (when scoped) or "brand" for
  // workspace-global agents. Status is a static "online" for now —
  // wiring real status (last-run, paused, etc.) lands when the
  // notify-dispatch grows a heartbeat.
  const talkAgents: TalkAgent[] = useMemo(() => {
    const VARIANTS: TalkAgent["variant"][] = [
      "brand",
      "rose",
      "amber",
      "violet",
      "indigo",
      "orange",
    ];
    return agents.map((a, i) => {
      const biz = a.business_id
        ? businesses.find((b) => b.id === a.business_id)
        : null;
      // Pick a stable colour: business's variant when valid, else
      // round-robin over the palette so the dropdown looks varied.
      const bizVariant = biz?.variant as TalkAgent["variant"] | undefined;
      const variant: TalkAgent["variant"] =
        bizVariant && VARIANTS.includes(bizVariant)
          ? bizVariant
          : VARIANTS[i % VARIANTS.length]!;
      return {
        id: a.id,
        name: a.name,
        biz: biz?.name ?? "Workspace",
        letter: (a.name.trim().charAt(0) || "A").toUpperCase(),
        variant,
        status: "online" as const,
        voice: a.model ? `${a.provider} · ${a.model}` : a.provider,
        desc: biz?.sub ?? "Workspace-global",
      };
    });
  }, [agents, businesses]);

  const railBusinesses: RailItem[] = businesses.map((b) => ({
    id: b.id,
    name: b.name,
    sub: b.sub ?? undefined,
    letter: b.letter,
    // Resolved via renderNodeIcon: SVG when icon is a known registry
    // name, legacy emoji span when it isn't, undefined when empty.
    icon: renderNodeIcon(b.icon, 18),
    variant: b.variant as RailItem["variant"],
    colorHex: b.color_hex ?? null,
    logoUrl: b.logo_url ?? null,
  }));

  const drilledRailItem: RailItem | null = drilledBiz
    ? {
        id: drilledBiz.biz.id,
        name: drilledBiz.biz.name,
        sub: drilledBiz.biz.sub ?? undefined,
        letter: drilledBiz.biz.letter,
        icon: renderNodeIcon(drilledBiz.biz.icon, 18),
        variant: drilledBiz.biz.variant as RailItem["variant"],
        colorHex: drilledBiz.biz.color_hex ?? null,
        logoUrl: drilledBiz.biz.logo_url ?? null,
      }
    : null;

  // Breadcrumb chain of nav nodes the user has drilled into
  // (Tromptech → Instagram → Reels → ...). Each item carries its own
  // click handler that navigates back to that level. The deepest item
  // gets the "selected" highlight in the rail.
  const drillChainRail = useMemo(() => {
    if (!drilledBiz || !navContext) return [];
    return navContext.chain.map((node, i) => {
      const navPathToHere = drilledBiz.navPath.slice(0, i + 1);
      return {
        id: node.id,
        name: node.name,
        sub: node.sub ?? undefined,
        letter: node.letter,
        icon: renderNodeIcon(node.icon, 16),
        variant: (node.variant as RailItem["variant"]) ?? "dashed",
        colorHex: node.color_hex ?? null,
        logoUrl: node.logo_url ?? null,
        onClick: () => {
          closeRail();
          router.push(
            `/${workspace.slug}/business/${drilledBiz.biz.id}/n/${navPathToHere.join("/")}`,
          );
        },
      };
    });
  }, [drilledBiz, navContext, router, workspace.slug]);

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
      const path = `/${workspace.slug}/business/${biz.id}`;
      return [
        { label: "Open", onClick: () => router.push(path) },
        {
          label: "Open in nieuw tabblad",
          onClick: () => window.open(path, "_blank", "noopener"),
        },
        { kind: "separator" },
        {
          label: "Nieuw topic",
          onClick: () =>
            setCreatingChildOf({
              businessId: biz.id,
              parentId: null,
              title: `Nieuw topic in ${biz.name}`,
            }),
        },
        {
          label: "Agents",
          onClick: () => router.push(`${path}/agents`),
        },
        {
          label: "Schedules",
          onClick: () => router.push(`${path}/schedules`),
        },
        { kind: "separator" },
        {
          label: "Instellingen…",
          onClick: () =>
            setEditing({
              kind: "business",
              id: biz.id,
              workspace_id: workspace.id,
              name: biz.name,
              sub: biz.sub,
              variant: biz.variant,
              icon: biz.icon,
              color_hex: biz.color_hex,
              logo_url: biz.logo_url,
              status: biz.status,
              daily_spend_limit_cents: biz.daily_spend_limit_cents,
              monthly_spend_limit_cents: biz.monthly_spend_limit_cents,
              description: biz.description,
              mission: biz.mission,
              targets: biz.targets,
              isolated: biz.isolated,
            }),
        },
        {
          label: "Dupliceer",
          onClick: async () => {
            const res = await duplicateBusiness({
              workspace_slug: workspace.slug,
              workspace_id: workspace.id,
              source_id: biz.id,
            });
            if (res.ok) router.refresh();
            else alert(res.error);
          },
        },
        {
          label: "Kopieer link",
          onClick: () =>
            navigator.clipboard.writeText(
              `${window.location.origin}${path}`,
            ),
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
      const fullPath = `/${workspace.slug}/business/${drilledBiz.biz.id}/n/${pathSegments.join("/")}`;
      // Possible move targets: every other node in the same business +
      // a "(business root)" option. We cap depth at 5 to keep menu sane.
      const moveTargets = navNodes
        .filter(
          (n) =>
            n.business_id === drilledBiz.biz.id &&
            n.id !== node.id &&
            n.parent_id !== node.id, // skip immediate children
        )
        .slice(0, 12);
      return [
        { label: "Open", onClick: () => router.push(fullPath) },
        {
          label: "Open in nieuw tabblad",
          onClick: () => window.open(fullPath, "_blank", "noopener"),
        },
        { kind: "separator" },
        {
          label: "Nieuw subtopic",
          onClick: () =>
            setCreatingChildOf({
              businessId: drilledBiz.biz.id,
              parentId: node.id,
              title: `Nieuw subtopic in ${node.name}`,
            }),
        },
        {
          label: "Instellingen…",
          onClick: () =>
            setEditing({
              kind: "navnode",
              id: node.id,
              workspace_id: workspace.id,
              business_id: drilledBiz.biz.id,
              name: node.name,
              variant: node.variant ?? "slate",
              icon: node.icon,
              color_hex: node.color_hex,
              logo_url: node.logo_url,
              href: node.href,
            }),
        },
        {
          label: "Dupliceer",
          onClick: async () => {
            const res = await duplicateNavNode({
              workspace_slug: workspace.slug,
              workspace_id: workspace.id,
              business_id: drilledBiz.biz.id,
              source_id: node.id,
            });
            if (res.ok) router.refresh();
            else alert(res.error);
          },
        },
        { kind: "separator" },
        {
          label: "↑ Naar boven",
          onClick: async () => {
            const res = await reorderNavNode({
              workspace_slug: workspace.slug,
              business_id: drilledBiz.biz.id,
              id: node.id,
              direction: "up",
            });
            if (res.ok) router.refresh();
            else alert(res.error);
          },
        },
        {
          label: "↓ Naar beneden",
          onClick: async () => {
            const res = await reorderNavNode({
              workspace_slug: workspace.slug,
              business_id: drilledBiz.biz.id,
              id: node.id,
              direction: "down",
            });
            if (res.ok) router.refresh();
            else alert(res.error);
          },
        },
        { kind: "separator" },
        {
          label: "Verplaats naar root",
          onClick: async () => {
            const res = await moveNavNode({
              workspace_slug: workspace.slug,
              business_id: drilledBiz.biz.id,
              id: node.id,
              new_parent_id: null,
            });
            if (res.ok) router.refresh();
            else alert(res.error);
          },
        },
        ...moveTargets.slice(0, 6).map(
          (target): ContextMenuItem => ({
            label: `Verplaats onder ${target.icon ?? ""}${target.name}`,
            onClick: async () => {
              const res = await moveNavNode({
                workspace_slug: workspace.slug,
                business_id: drilledBiz.biz.id,
                id: node.id,
                new_parent_id: target.id,
              });
              if (res.ok) router.refresh();
              else alert(res.error);
            },
          }),
        ),
        { kind: "separator" },
        {
          label: "Kopieer link",
          onClick: () =>
            navigator.clipboard.writeText(
              `${window.location.origin}${fullPath}`,
            ),
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
        drillChain={drillChainRail}
        topics={drilledBiz ? railTopics : []}
        selectedTopicId={selectedTopicId}
        labels={{
          allBusinesses: t("nav.allBusinesses"),
          emptyBusinesses: t("rail.empty"),
          newTopic:
            drilledBiz && drilledBiz.navPath.length > 0
              ? t("nav.newSubtopic")
              : t("nav.newTopic"),
          newBusiness: t("nav.newBusiness"),
          settings: t("nav.settings"),
          workspaceAgents: t("nav.workspaceAgents"),
          emptyTopics: t("rail.emptyTopics"),
        }}
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
        onOpenWorkspaceAgents={() => {
          closeRail();
          router.push(`/${workspace.slug}/agents`);
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
        onReorderTopic={async (sourceId, targetId) => {
          if (!drilledBiz) return;
          const res = await swapNavNodeOrder({
            workspace_slug: workspace.slug,
            business_id: drilledBiz.biz.id,
            source_id: sourceId,
            target_id: targetId,
          });
          if (res.ok) router.refresh();
          else alert(res.error);
        }}
        onReorderBusiness={async (sourceId, targetId) => {
          const res = await swapBusinessOrder({
            workspace_slug: workspace.slug,
            source_id: sourceId,
            target_id: targetId,
          });
          if (res.ok) router.refresh();
          else alert(res.error);
        }}
        onCreateTopic={
          drilledBiz
            ? () => {
                // Drop the new topic under the deepest currently-active
                // node — so "+ Topic" while you're inside an existing
                // topic creates a SUB-topic of it. At the business root
                // it creates a top-level topic.
                const parentId =
                  drilledBiz.navPath.length > 0
                    ? (drilledBiz.navPath[drilledBiz.navPath.length - 1] ??
                      null)
                    : null;
                const parentName = parentId
                  ? navNodes.find((n) => n.id === parentId)?.name
                  : null;
                setCreatingChildOf({
                  businessId: drilledBiz.biz.id,
                  parentId,
                  title: parentName
                    ? `Nieuw subtopic in ${parentName}`
                    : `Nieuw topic in ${drilledBiz.biz.name}`,
                });
              }
            : undefined
        }
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
            // Run inside a transition so we can AWAIT the server action
            // before refreshing the page. Without the await the cookie
            // might not be live yet when revalidatePath kicks in →
            // page re-renders with the OLD locale and the click looks
            // like a no-op.
            startLangTransition(async () => {
              const target = next.toLowerCase() as Locale;
              const res = await setLocale(target);
              if (res.ok) router.refresh();
            });
          }}
          themeToggle={<ThemeToggle />}
          voiceSlot={
            <TalkModule
              agents={talkAgents}
              workspaceSlug={workspace.slug}
            />
          }
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
                onClick={() => router.push(`/${workspace.slug}/queue`)}
              >
                Wachtrij
              </button>
              <button
                role="menuitem"
                onClick={() => router.push(`/${workspace.slug}/runs`)}
              >
                Runs
              </button>
              <button
                role="menuitem"
                onClick={() => router.push(`/${workspace.slug}/activity`)}
              >
                Activity
              </button>
              <button
                role="menuitem"
                onClick={() => router.push(`/${workspace.slug}/cost`)}
              >
                Cost & spend
              </button>
              <button
                role="menuitem"
                onClick={() => router.push(`/${workspace.slug}/marketplace`)}
              >
                Marketplace
              </button>
              <button
                role="menuitem"
                onClick={() => router.push(`/admin/marketplace`)}
              >
                Marketplace admin
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
        <BusinessSetupWizard
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

      {/* Global right-click handler — blocks Chrome's native menu
          everywhere except inputs/text-selection, and falls back to
          our own when no other onContextMenu has stopPropagation'd. */}
      <AppContextMenu workspaceSlug={workspace.slug} />
    </div>
  );
}
