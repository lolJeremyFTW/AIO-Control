// Compact rail with hover-expand. Phase-0 version: client-side, takes
// businesses + actions as props. Phase-1 will wire it to Supabase data.

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

type Props = {
  profile: RailItem;
  businesses: RailItem[];
  selectedBusinessId?: string | null;
  expandOnHover?: boolean;
  /** Mobile drawer state — when true, the rail slides on-screen below 900px. */
  mobileOpen?: boolean;
  onMobileClose?: () => void;
  onSelectProfile?: () => void;
  onSelectBusiness?: (id: string) => void;
  onCreateBusiness?: () => void;
  onOpenSettings?: () => void;
  page?: "dashboard" | "settings" | "profile";
};

export function Rail({
  profile,
  businesses,
  selectedBusinessId,
  expandOnHover = true,
  mobileOpen = false,
  onMobileClose,
  onSelectProfile,
  onSelectBusiness,
  onCreateBusiness,
  onOpenSettings,
  page = "dashboard",
}: Props) {
  const [hover, setHover] = useState(false);
  // The desktop hover-expand and the mobile-open drawer both reveal labels;
  // we OR them together so the same DOM serves both.
  const expanded = (expandOnHover && hover) || mobileOpen;
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
        // Tap outside an interactive child closes the drawer on mobile.
        // The NavRow/ActionRow callbacks handle their own closing.
        if (mobileOpen && onMobileClose) onMobileClose();
      }}
    >
      <div className="rail-top">
        <NavRow
          item={profile}
          expanded={expanded}
          selected={page === "profile"}
          onClick={onSelectProfile}
        />
      </div>
      <div className="rail-divider" />
      <div className="rail-mid">
        {businesses.length === 0 ? (
          <div style={{ padding: "8px 4px", opacity: 0.6, fontSize: 11 }}>
            {expanded ? "Geen businesses nog" : null}
          </div>
        ) : (
          businesses.map((b) => (
            <NavRow
              key={b.id}
              item={b}
              expanded={expanded}
              selected={selectedBusinessId === b.id && page === "dashboard"}
              onClick={() => onSelectBusiness?.(b.id)}
            />
          ))
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
