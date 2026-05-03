// Two-row header (KPIs-first variant from the design). Phase 0 ships the
// "minimal" mode (row 1 only) so the placeholder dashboard renders without
// a selected business; the full per-business row 2 lands when fase-2 wires
// businesses + KPIs from the DB.

"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import {
  BellIcon,
  ChevronRightIcon,
  CloudIcon,
  MicIcon,
  SearchIcon,
} from "../icon";

export type Crumb = {
  workspaceName: string;
  workspaceLetter: string;
  pageTitle: string;
  pageSub?: string;
  showRunningDot?: boolean;
};

export type Lang = "NL" | "EN" | "DE";

type Props = {
  crumb: Crumb;
  /** Click-handler for the workspace name in the breadcrumb. When set
   *  the workspace half becomes a button; when omitted it stays a span. */
  onCrumbWorkspaceClick?: () => void;
  /** Click-handler for the page title (right side) in the breadcrumb.
   *  Used to jump back from a drilled business → all businesses. */
  onCrumbPageClick?: () => void;
  lang?: Lang;
  onLangChange?: (lang: Lang) => void;
  notifications?: number;
  weather?: { city: string; date: string; temp: string };
  avatarLetter?: string;
  /** Hamburger callback — only shown below 900px via CSS. */
  onToggleRail?: () => void;
  /** When provided, the avatar becomes a popover trigger that renders
   *  this node beneath itself. Click-outside dismisses. */
  userMenu?: ReactNode;
  /** Visible user identity in the avatar's dropdown header. */
  userDisplayName?: string;
  userEmail?: string;
  /** Replaces the static .search div + .ibtn bell when set. The host
   *  app injects functional widgets (SearchModal trigger,
   *  NotificationsBell with realtime badge). */
  searchSlot?: ReactNode;
  /** Translated placeholder for the static search bar (when searchSlot
   *  is not set). The host app passes this via the i18n dict so the
   *  copy flips with the language switcher. */
  searchPlaceholder?: string;
  bellSlot?: ReactNode;
  /** Tiny circle button next to the bell — light/dark theme flip. */
  themeToggle?: ReactNode;
  /** Replaces the static "Praat met AI" voice chip with a fully
   *  functional split-button: mic + agent dropdown + settings link.
   *  When omitted, the original static chip renders. */
  voiceSlot?: ReactNode;
  /** Replaces the static weather chip with a clickable variant that
   *  opens a 10-day forecast dropdown. When omitted, the original
   *  static chip renders. */
  weatherSlot?: ReactNode;
  children?: ReactNode; // optional row 2 content
};

export function Header({
  crumb,
  onCrumbWorkspaceClick,
  onCrumbPageClick,
  lang = "NL",
  onLangChange,
  notifications = 0,
  weather = { city: "Breda", date: "1 mei", temp: "14°" },
  avatarLetter = "J",
  onToggleRail,
  userMenu,
  userDisplayName,
  userEmail,
  searchSlot,
  searchPlaceholder,
  bellSlot,
  themeToggle,
  voiceSlot,
  weatherSlot,
  children,
}: Props) {
  const [activeAvatar, setActiveAvatar] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Click-outside dismisses. We attach on the next tick so the click that
  // OPENS the menu doesn't immediately count as an outside click.
  useEffect(() => {
    if (!activeAvatar) return;
    const t = setTimeout(() => {
      const onDoc = (e: MouseEvent) => {
        if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
          setActiveAvatar(false);
        }
      };
      document.addEventListener("mousedown", onDoc);
      return () => document.removeEventListener("mousedown", onDoc);
    }, 0);
    return () => clearTimeout(t);
  }, [activeAvatar]);
  return (
    <header className="hdr">
      <div className="row1">
        {onToggleRail && (
          <button
            type="button"
            className="rail-toggle"
            onClick={onToggleRail}
            aria-label="Open navigation"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
            >
              <line x1="4" y1="6" x2="20" y2="6" />
              <line x1="4" y1="12" x2="20" y2="12" />
              <line x1="4" y1="18" x2="20" y2="18" />
            </svg>
          </button>
        )}
        <div className="crumb">
          {onCrumbWorkspaceClick ? (
            <button
              type="button"
              className="biz biz-clickable"
              onClick={onCrumbWorkspaceClick}
              title="Terug naar workspace dashboard"
            >
              <span className="swatch">{crumb.workspaceLetter}</span>{" "}
              {crumb.workspaceName}
            </button>
          ) : (
            <span className="biz">
              <span className="swatch">{crumb.workspaceLetter}</span>{" "}
              {crumb.workspaceName}
            </span>
          )}
          <span className="sep">
            <ChevronRightIcon />
          </span>
          <span className="topic-with-status">
            {onCrumbPageClick ? (
              <button
                type="button"
                className="topic topic-clickable"
                onClick={onCrumbPageClick}
                title="Terug naar alle businesses"
              >
                {crumb.pageTitle}
              </button>
            ) : (
              <span className="topic">{crumb.pageTitle}</span>
            )}
            {crumb.showRunningDot && (
              <span className="running-dot" title="Automation running" />
            )}
          </span>
          {crumb.pageSub && (
            <span className="crumb-sub">· {crumb.pageSub}</span>
          )}
        </div>
        <div className="grow" />
        {searchSlot ?? (
          <div className="search">
            <SearchIcon />
            <span className="placeholder">
              {searchPlaceholder ??
                'Zoek of vraag aan AI: "hoeveel verdiende YouTube vandaag?"'}
            </span>
            <span className="kbd">Ctrl+K</span>
          </div>
        )}
        <div className="grow" />
        {voiceSlot ?? (
          <div className="voice">
            <span className="pulse">
              <MicIcon />
            </span>{" "}
            Praat met AI
          </div>
        )}
        {themeToggle}
        {bellSlot ?? (
          <button className="ibtn" aria-label="Notifications">
            <BellIcon />
            {notifications > 0 && (
              <span className="dot-badge">{notifications}</span>
            )}
          </button>
        )}
        {weatherSlot ?? (
          <div className="chip">
            <CloudIcon />
            <span>
              <strong>{weather.city}</strong> · {weather.date}
            </span>
            <span className="temp">{weather.temp}</span>
          </div>
        )}
        <div className="lang">
          {(["NL", "EN", "DE"] as const).map((l) => (
            <button
              key={l}
              className={lang === l ? "active" : ""}
              onClick={() => onLangChange?.(l)}
            >
              {l}
            </button>
          ))}
        </div>
        <div className="vrule" />
        <div ref={menuRef} style={{ position: "relative" }}>
          <button
            className={"avatar-btn " + (activeAvatar ? "is-active" : "")}
            onClick={() => setActiveAvatar((v) => !v)}
            aria-label="User menu"
            aria-expanded={activeAvatar}
          >
            {avatarLetter}
          </button>
          {activeAvatar && userMenu && (
            <div className="user-menu" role="menu">
              {(userDisplayName || userEmail) && (
                <div className="who">
                  {userDisplayName && <div className="n">{userDisplayName}</div>}
                  {userEmail && <div className="e">{userEmail}</div>}
                </div>
              )}
              {userMenu}
            </div>
          )}
        </div>
      </div>
      {children && <div className="row2">{children}</div>}
    </header>
  );
}
