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

import { useState, type ReactNode } from "react";

import { PlusIcon, SettingsIcon } from "../icon";
import { Node, type NodeVariant } from "./Node";

export type RailItem = {
  id: string;
  name: string;
  sub?: string;
  letter: string;
  variant: NodeVariant;
  badge?: number | "dot";
  icon?: ReactNode;
};

export type Topic = {
  id: string;
  label: string;
  /** Where clicking the topic should navigate, relative to the workspace. */
  path: string;
  /** Optional badge (count of open queue items, etc). */
  badge?: number | "dot";
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
}: Props) {
  const [hover, setHover] = useState(false);
  const expanded = (expandOnHover && hover) || mobileOpen;

  const topMode = !drilledInto;

  return (
    <div
      className={
        "rail " +
        (expanded ? "is-expanded " : "") +
        (mobileOpen ? "is-open" : "")
      }
      onMouseEnter={() => expandOnHover && setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={() => {
        if (mobileOpen && onMobileClose) onMobileClose();
      }}
    >
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
              />
            ))
          )
        ) : (
          <>
            {/* Drilled-in: show the business itself as a header chip, then
                the topics list. The header chip uses the business's
                colour so the user always sees which context they're in. */}
            <div style={{ marginBottom: 8 }}>
              <NavRow item={drilledInto!} expanded={expanded} selected />
            </div>
            {topics.map((t) => (
              <TopicRow
                key={t.id}
                topic={t}
                expanded={expanded}
                selected={selectedTopicId === t.id}
                onClick={() => onSelectTopic?.(t)}
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
};

function NavRow({ item, selected, expanded, onClick }: NavRowProps) {
  return (
    <div
      className={"nav-row " + (selected ? "selected" : "")}
      onClick={onClick}
      role="button"
      tabIndex={0}
    >
      <div className="nav-row-circle">
        <Node
          variant={item.variant}
          letter={item.icon ? undefined : item.letter}
          icon={item.icon}
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
};

function TopicRow({ topic, selected, expanded, onClick }: TopicRowProps) {
  // Topics use a simpler glyph — a small dashed circle with the first
  // letter — and the same selected ring as businesses, so the brand-green
  // glow consistently signals "currently active".
  const letter = topic.label.slice(0, 1).toUpperCase();
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
          letter={letter}
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
