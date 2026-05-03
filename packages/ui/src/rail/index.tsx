// Compact rail with hover-expand AND drill-in support.
//
// Two states:
// 1. Top-level (drilledInto = null) — shows the user's profile + a list of
//    businesses + bottom actions (+ New, Settings).
// 2. Drilled-in (drilledInto = <business>) — the rail content fully swaps:
//    the profile slot becomes a "← All businesses" back button, the middle
//    section shows the business's topics (Wachtrij, Agents, Schedules,
//    Integrations), bottom actions stay the same.
//
// Hover-expand still works in both modes.

"use client";

import {
  useEffect,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";

import { PlusIcon, SettingsIcon } from "../icon";
import { Node, type NodeVariant } from "./Node";

export type ContextMenuOrigin =
  | { kind: "rail-bg" }
  | { kind: "business"; id: string }
  | { kind: "drilled-business"; id: string }
  | { kind: "topic"; id: string };

export type RailItem = {
  id: string;
  name: string;
  sub?: string;
  letter: string;
  variant: NodeVariant;
  badge?: number | "dot";
  icon?: ReactNode;
  /** Custom hex colour (overrides variant). */
  colorHex?: string | null;
  /** Uploaded logo URL (overrides letter/icon). */
  logoUrl?: string | null;
};

export type Topic = {
  id: string;
  label: string;
  /** Where clicking the topic should navigate, relative to the workspace. */
  path: string;
  /** Optional badge (count of open queue items, etc). */
  badge?: number | "dot";
  /** Optional preset variant (overrides default "dashed"). */
  variant?: NodeVariant;
  /** Optional emoji icon. */
  icon?: ReactNode;
  /** Optional custom hex (overrides preset). */
  colorHex?: string | null;
  /** Optional uploaded logo URL. */
  logoUrl?: string | null;
};

type Props = {
  profile: RailItem;
  businesses: RailItem[];
  selectedBusinessId?: string | null;
  expandOnHover?: boolean;
  /** When set, the rail shows this business's topics + a back row. */
  drilledInto?: RailItem | null;
  /** Optional breadcrumb chain of nav-nodes the user has drilled into,
   *  ordered shallow → deep. Rendered as clickable rows under the
   *  business header so the user can hop back to any level. The
   *  deepest item is highlighted as the current context. When this
   *  is empty, only the business header chip shows (i.e. user is at
   *  business root). */
  drillChain?: Array<RailItem & { onClick?: () => void }>;
  topics?: Topic[];
  /** Which topic id is currently active (highlights the row). */
  selectedTopicId?: string | null;
  /** Mobile drawer state — when true, the rail slides on-screen below 900px. */
  mobileOpen?: boolean;
  onMobileClose?: () => void;
  onSelectProfile?: () => void;
  onSelectBusiness?: (id: string) => void;
  onSelectTopic?: (topic: Topic) => void;
  /** Tap handler for the back row in drill-in mode. */
  onBack?: () => void;
  onCreateBusiness?: () => void;
  onOpenSettings?: () => void;
  /** Optional handler for the "Workspace agents" rail-bottom row.
   *  When omitted the row hides — used in early phases. */
  onOpenWorkspaceAgents?: () => void;
  page?: "dashboard" | "settings" | "profile" | "agents";
  /** Right-click handlers — surface a custom context menu in the shell. */
  onContextMenuRail?: (
    e: ReactMouseEvent,
    origin: ContextMenuOrigin,
  ) => void;
  /** Called when the user drops a topic onto another topic. The shell
   *  swaps their sort_orders. */
  onReorderTopic?: (sourceId: string, targetId: string) => void;
  /** Same idea for businesses in the top-level rail. */
  onReorderBusiness?: (sourceId: string, targetId: string) => void;
  /** "+ Topic" / "+ Subtopic" button at the bottom of the topic list
   *  when drilled in. Optional — when omitted the row hides. */
  onCreateTopic?: () => void;
  /** Empty-state copy shown in drilled mode when topics.length === 0.
   *  Defaults to a sensible NL string. */
  emptyTopicsLabel?: string;
  /** Localised labels — fall back to the NL/EN defaults baked in here.
   *  The shell passes the result of t() so the rail follows the user's
   *  language preference without the rail itself depending on the
   *  i18n module. */
  labels?: {
    allBusinesses?: string;
    emptyBusinesses?: string;
    newTopic?: string;
    newBusiness?: string;
    settings?: string;
    workspaceAgents?: string;
    emptyTopics?: string;
  };
};

export function Rail({
  profile,
  businesses,
  selectedBusinessId,
  expandOnHover = true,
  drilledInto = null,
  drillChain = [],
  topics = [],
  selectedTopicId = null,
  mobileOpen = false,
  onMobileClose,
  onSelectProfile,
  onSelectBusiness,
  onSelectTopic,
  onBack,
  onCreateBusiness,
  onOpenSettings,
  page = "dashboard",
  onContextMenuRail,
  onReorderTopic,
  onReorderBusiness,
  onCreateTopic,
  onOpenWorkspaceAgents,
  emptyTopicsLabel,
  labels,
}: Props) {
  const L = {
    allBusinesses: labels?.allBusinesses ?? "All businesses",
    emptyBusinesses: labels?.emptyBusinesses ?? "Geen businesses nog",
    newTopic: labels?.newTopic ?? "Nieuw topic",
    newBusiness: labels?.newBusiness ?? "New business",
    settings: labels?.settings ?? "Settings",
    workspaceAgents: labels?.workspaceAgents ?? "Workspace agents",
    emptyTopics:
      labels?.emptyTopics ??
      emptyTopicsLabel ??
      "Nog geen subtopics — maak er een aan ↓",
  };
  const [hover, setHover] = useState(false);

  // "Pin" toggle — when locked, the rail ignores hover so it stays
  // narrow. State persists in localStorage so each user keeps their
  // preference across reloads.
  const [hoverLocked, setHoverLocked] = useState(false);
  useEffect(() => {
    try {
      const v = localStorage.getItem("aio:rail-hover-locked");
      if (v === "1") setHoverLocked(true);
    } catch {
      /* SSR or no storage */
    }
  }, []);
  const toggleHoverLock = () => {
    setHoverLocked((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("aio:rail-hover-locked", next ? "1" : "0");
      } catch {
        /* ignore */
      }
      // Drop hover state immediately so the rail snaps shut on lock.
      if (next) setHover(false);
      return next;
    });
  };

  const expanded =
    (expandOnHover && !hoverLocked && hover) || mobileOpen;

  const topMode = !drilledInto;

  return (
    <div
      className={
        "rail " +
        (expanded ? "is-expanded " : "") +
        (hoverLocked ? "is-locked " : "") +
        (mobileOpen ? "is-open" : "")
      }
      onMouseEnter={() => expandOnHover && !hoverLocked && setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={() => {
        if (mobileOpen && onMobileClose) onMobileClose();
      }}
      onContextMenu={(e) => {
        // Background right-click — only fire if it bubbled up untouched
        // (rows stop propagation themselves).
        if (e.currentTarget === e.target && onContextMenuRail) {
          e.preventDefault();
          onContextMenuRail(e, { kind: "rail-bg" });
        }
      }}
    >
      {/* Pin / unpin chevron on the right edge. Click to lock the rail
          collapsed (no hover-expand), click again to release. */}
      <button
        type="button"
        className="rail-pin"
        aria-label={
          hoverLocked
            ? "Hover-expand inschakelen"
            : "Hover-expand uitschakelen"
        }
        aria-pressed={hoverLocked}
        title={
          hoverLocked
            ? "Hover-expand staat uit — klik om aan te zetten"
            : "Klik om de rail vast te zetten (hover-expand uit)"
        }
        onClick={(e) => {
          e.stopPropagation();
          toggleHoverLock();
        }}
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          // Chevron points right when locked (click to expand-on-hover
          // again), left when unlocked (click to lock collapsed).
          style={{
            transform: hoverLocked ? "rotate(0)" : "rotate(180deg)",
            transition: "transform 0.2s ease",
          }}
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </button>
      <div className="rail-top">
        {topMode ? (
          <NavRow
            item={profile}
            expanded={expanded}
            selected={page === "profile"}
            onClick={onSelectProfile}
          />
        ) : (
          /* Drilled in: top slot shows the BUSINESS as the primary
             label. Click → back to all businesses. Hover tooltip
             confirms the back-action. The drillChain (Instagram →
             Instagram post → …) lives below the divider in rail-mid. */
          <div title={`← ${L.allBusinesses}`}>
            <NavRow
              item={drilledInto!}
              expanded={expanded}
              /* Highlighted as the active context; clicking always
                 routes to the workspace root (see WorkspaceShell's
                 onBack handler — it pops to /dashboard when at
                 business root). */
              selected={drillChain.length === 0}
              onClick={onBack}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onContextMenuRail?.(e, {
                  kind: "drilled-business",
                  id: drilledInto!.id,
                });
              }}
            />
          </div>
        )}
      </div>
      <div className="rail-divider" />
      <div className="rail-mid">
        {topMode ? (
          businesses.length === 0 ? (
            <div style={{ padding: "8px 4px", opacity: 0.6, fontSize: 11 }}>
              {expanded ? L.emptyBusinesses : null}
            </div>
          ) : (
            businesses.map((b) => (
              <NavRow
                key={b.id}
                item={b}
                expanded={expanded}
                selected={selectedBusinessId === b.id}
                onClick={() => onSelectBusiness?.(b.id)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onContextMenuRail?.(e, { kind: "business", id: b.id });
                }}
                onDropOn={
                  onReorderBusiness
                    ? (sourceId) => onReorderBusiness(sourceId, b.id)
                    : undefined
                }
                dataType="business"
              />
            ))
          )
        ) : (
          /* Drilled-in: render the breadcrumb chain (topic →
             subtopic → …) as visually-nested rows. Each level is
             indented with a left guideline; the topics list shown
             below sits one level deeper than the deepest chain item
             — so e.g. "Instagram post" appears clearly indented as
             a child of "Instagram". The business header chip itself
             lives in rail-top above the divider. */
          (() => {
            const INDENT = 12;
            const baseDepth = drillChain.length;
            // Indent guides + per-row indent only make sense when the
            // rail is wide enough to show them. When it's collapsed
            // (icon-only width) the children would push their dots
            // off-center to the right; instead we just stack them
            // flush-left and rely on the selected-state ring to mark
            // the active row.
            const indentFor = (depth: number) =>
              expanded ? depth * INDENT : 0;
            return (
              <div
                className={
                  expanded && baseDepth > 0 ? "rail-drill-stack" : undefined
                }
              >
                {drillChain.map((node, i) => {
                  const isDeepest = i === drillChain.length - 1;
                  return (
                    <div
                      key={node.id}
                      style={{ paddingLeft: indentFor(i) }}
                      className="rail-drill-row"
                    >
                      <NavRow
                        item={node}
                        expanded={expanded}
                        selected={isDeepest}
                        onClick={node.onClick}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          onContextMenuRail?.(e, {
                            kind: "topic",
                            id: node.id,
                          });
                        }}
                      />
                    </div>
                  );
                })}
                {topics.length === 0
                  ? expanded && (
                      <div
                        className="rail-drill-row"
                        style={{ paddingLeft: indentFor(baseDepth) }}
                      >
                        <div
                          style={{
                            padding: "12px 8px",
                            fontSize: 11,
                            lineHeight: 1.4,
                            color: "var(--app-fg-3)",
                          }}
                        >
                          {L.emptyTopics}
                        </div>
                      </div>
                    )
                  : topics.map((t) => (
                      <div
                        key={t.id}
                        className="rail-drill-row"
                        style={{ paddingLeft: indentFor(baseDepth) }}
                      >
                        <TopicRow
                          topic={t}
                          expanded={expanded}
                          selected={selectedTopicId === t.id}
                          onClick={() => onSelectTopic?.(t)}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onContextMenuRail?.(e, {
                              kind: "topic",
                              id: t.id,
                            });
                          }}
                          onDropOn={
                            onReorderTopic
                              ? (sourceId) => onReorderTopic(sourceId, t.id)
                              : undefined
                          }
                        />
                      </div>
                    ))}
                {onCreateTopic && (
                  <div
                    className="rail-drill-row"
                    style={{ paddingLeft: indentFor(baseDepth) }}
                  >
                    <ActionRow
                      icon={<PlusIcon size={14} />}
                      label={L.newTopic}
                      expanded={expanded}
                      onClick={onCreateTopic}
                    />
                  </div>
                )}
              </div>
            );
          })()
        )}
      </div>
      <div className="rail-divider" />
      <div className="rail-bottom">
        <ActionRow
          icon={<PlusIcon />}
          label={L.newBusiness}
          expanded={expanded}
          onClick={onCreateBusiness}
        />
        {onOpenWorkspaceAgents && (
          <ActionRow
            icon={
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="4" y="7" width="16" height="13" rx="2" />
                <line x1="12" y1="2" x2="12" y2="7" />
                <circle cx="9" cy="13" r="1.2" />
                <circle cx="15" cy="13" r="1.2" />
                <line x1="9" y1="17" x2="15" y2="17" />
              </svg>
            }
            label={L.workspaceAgents}
            expanded={expanded}
            selected={page === "agents"}
            onClick={onOpenWorkspaceAgents}
          />
        )}
        <ActionRow
          icon={<SettingsIcon size={16} />}
          label={L.settings}
          expanded={expanded}
          selected={page === "settings"}
          onClick={onOpenSettings}
        />
      </div>
    </div>
  );
}

type NavRowProps = {
  item: RailItem;
  selected?: boolean;
  expanded: boolean;
  onClick?: () => void;
  onContextMenu?: (e: ReactMouseEvent) => void;
  /** Drag-and-drop reorder hook. */
  onDropOn?: (sourceId: string) => void;
  /** Drag MIME type — must match between source and target rows so a
   *  business can't be dropped on a topic and vice versa. */
  dataType?: "business" | "topic";
};

function NavRow({
  item,
  selected,
  expanded,
  onClick,
  onContextMenu,
  onDropOn,
  dataType,
}: NavRowProps) {
  const [dropActive, setDropActive] = useState(false);
  const mimeType = dataType ? `text/aio-${dataType}` : null;
  return (
    <div
      className={
        "nav-row " +
        (selected ? "selected " : "") +
        (dropActive ? "drop-active" : "")
      }
      onClick={onClick}
      onContextMenu={onContextMenu}
      role="button"
      tabIndex={0}
      draggable={!!onDropOn && !!mimeType}
      onDragStart={(e) => {
        if (!mimeType) return;
        e.dataTransfer.setData(mimeType, item.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      onDragOver={(e) => {
        if (!onDropOn || !mimeType) return;
        if (!e.dataTransfer.types.includes(mimeType)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        setDropActive(true);
      }}
      onDragLeave={() => setDropActive(false)}
      onDrop={(e) => {
        if (!onDropOn || !mimeType) return;
        e.preventDefault();
        setDropActive(false);
        const sourceId = e.dataTransfer.getData(mimeType);
        if (sourceId && sourceId !== item.id) onDropOn(sourceId);
      }}
    >
      <div className="nav-row-circle">
        <Node
          variant={item.variant}
          letter={item.icon || item.logoUrl ? undefined : item.letter}
          icon={item.icon}
          colorHex={item.colorHex}
          logoUrl={item.logoUrl}
          badge={item.badge ?? null}
          selected={selected ?? false}
          tooltip={!expanded ? item.name : null}
        />
      </div>
      <div className="nav-row-text" aria-hidden={!expanded}>
        <div className="nav-row-name">{item.name}</div>
        {item.sub && <div className="nav-row-sub">{item.sub}</div>}
      </div>
      {typeof item.badge === "number" && item.badge > 0 && (
        <div className="nav-row-meta" aria-hidden={!expanded}>
          {item.badge}
        </div>
      )}
    </div>
  );
}

type TopicRowProps = {
  topic: Topic;
  selected: boolean;
  expanded: boolean;
  onClick?: () => void;
  onContextMenu?: (e: ReactMouseEvent) => void;
  /** Drag-and-drop reorder hook. The TopicRow becomes a drag source
   *  AND drop target; on drop the source's id is handed back. */
  onDropOn?: (sourceId: string) => void;
};

function TopicRow({
  topic,
  selected,
  expanded,
  onClick,
  onContextMenu,
  onDropOn,
}: TopicRowProps) {
  const [dropActive, setDropActive] = useState(false);
  // Topics use a simpler glyph — a small dashed circle with the first
  // letter — and the same selected ring as businesses, so the brand-green
  // glow consistently signals "currently active". When the user picks a
  // variant or a logo we honour that instead.
  const letter = topic.label.slice(0, 1).toUpperCase();
  const variant = topic.variant ?? "dashed";
  return (
    <div
      className={
        "nav-row " +
        (selected ? "selected " : "") +
        (dropActive ? "drop-active" : "")
      }
      onClick={onClick}
      onContextMenu={onContextMenu}
      role="button"
      tabIndex={0}
      draggable={!!onDropOn}
      onDragStart={(e) => {
        if (!onDropOn) return;
        e.dataTransfer.setData("text/aio-topic", topic.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      onDragOver={(e) => {
        if (!onDropOn) return;
        if (!e.dataTransfer.types.includes("text/aio-topic")) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        setDropActive(true);
      }}
      onDragLeave={() => setDropActive(false)}
      onDrop={(e) => {
        if (!onDropOn) return;
        e.preventDefault();
        setDropActive(false);
        const sourceId = e.dataTransfer.getData("text/aio-topic");
        if (sourceId && sourceId !== topic.id) onDropOn(sourceId);
      }}
      title="Sleep om volgorde te wijzigen"
    >
      <div className="nav-row-circle">
        <Node
          variant={variant}
          letter={topic.icon || topic.logoUrl ? undefined : letter}
          icon={topic.icon}
          colorHex={topic.colorHex}
          logoUrl={topic.logoUrl}
          selected={selected}
          tooltip={!expanded ? topic.label : null}
          badge={topic.badge ?? null}
        />
      </div>
      <div className="nav-row-text" aria-hidden={!expanded}>
        <div className="nav-row-name">{topic.label}</div>
      </div>
      {typeof topic.badge === "number" && topic.badge > 0 && (
        <div className="nav-row-meta" aria-hidden={!expanded}>
          {topic.badge}
        </div>
      )}
    </div>
  );
}

type BackRowProps = {
  label: string;
  expanded: boolean;
  onClick?: () => void;
};

function BackRow({ label, expanded, onClick }: BackRowProps) {
  return (
    <div className="nav-row" onClick={onClick} role="button" tabIndex={0}>
      <div className="nav-row-circle">
        <Node
          variant="dashed"
          tooltip={!expanded ? `← ${label}` : null}
          icon={
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="15 18 9 12 15 6" />
            </svg>
          }
          selected={false}
        />
      </div>
      <div className="nav-row-text">
        <div className="nav-row-name">← {label}</div>
      </div>
    </div>
  );
}

type ActionRowProps = {
  icon: ReactNode;
  label: string;
  expanded: boolean;
  selected?: boolean;
  onClick?: () => void;
};

function ActionRow({
  icon,
  label,
  expanded,
  selected,
  onClick,
}: ActionRowProps) {
  return (
    <div
      className={"nav-row " + (selected ? "selected" : "")}
      onClick={onClick}
      role="button"
      tabIndex={0}
    >
      <div className="nav-row-circle">
        <Node
          variant="dashed"
          icon={icon}
          selected={selected ?? false}
          tooltip={!expanded ? label : null}
        />
      </div>
      <div className="nav-row-text">
        <div className="nav-row-name">{label}</div>
      </div>
    </div>
  );
}
