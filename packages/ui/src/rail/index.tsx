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
  page?: "dashboard" | "settings" | "profile";
  /** Right-click handlers — surface a custom context menu in the shell. */
  onContextMenuRail?: (
    e: ReactMouseEvent,
    origin: ContextMenuOrigin,
  ) => void;
};

export function Rail({
  profile,
  businesses,
  selectedBusinessId,
  expandOnHover = true,
  drilledInto = null,
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
}: Props) {
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
          <BackRow
            label="All businesses"
            expanded={expanded}
            onClick={onBack}
          />
        )}
      </div>
      <div className="rail-divider" />
      <div className="rail-mid">
        {topMode ? (
          businesses.length === 0 ? (
            <div style={{ padding: "8px 4px", opacity: 0.6, fontSize: 11 }}>
              {expanded ? "Geen businesses nog" : null}
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
              />
            ))
          )
        ) : (
          <>
            {/* Drilled-in: show the business itself as a header chip, then
                the topics list. The header chip uses the business's
                colour so the user always sees which context they're in. */}
            <div style={{ marginBottom: 8 }}>
              <NavRow
                item={drilledInto!}
                expanded={expanded}
                selected
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
            {topics.map((t) => (
              <TopicRow
                key={t.id}
                topic={t}
                expanded={expanded}
                selected={selectedTopicId === t.id}
                onClick={() => onSelectTopic?.(t)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onContextMenuRail?.(e, { kind: "topic", id: t.id });
                }}
              />
            ))}
          </>
        )}
      </div>
      <div className="rail-divider" />
      <div className="rail-bottom">
        <ActionRow
          icon={<PlusIcon />}
          label="New business"
          expanded={expanded}
          onClick={onCreateBusiness}
        />
        <ActionRow
          icon={<SettingsIcon size={16} />}
          label="Settings"
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
};

function NavRow({
  item,
  selected,
  expanded,
  onClick,
  onContextMenu,
}: NavRowProps) {
  return (
    <div
      className={"nav-row " + (selected ? "selected" : "")}
      onClick={onClick}
      onContextMenu={onContextMenu}
      role="button"
      tabIndex={0}
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
};

function TopicRow({
  topic,
  selected,
  expanded,
  onClick,
  onContextMenu,
}: TopicRowProps) {
  // Topics use a simpler glyph — a small dashed circle with the first
  // letter — and the same selected ring as businesses, so the brand-green
  // glow consistently signals "currently active". When the user picks a
  // variant or a logo we honour that instead.
  const letter = topic.label.slice(0, 1).toUpperCase();
  const variant = topic.variant ?? "dashed";
  return (
    <div
      className={"nav-row " + (selected ? "selected" : "")}
      onClick={onClick}
      onContextMenu={onContextMenu}
      role="button"
      tabIndex={0}
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
