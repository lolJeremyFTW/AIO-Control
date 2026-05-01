// Two-row header (KPIs-first variant from the design). Phase 0 ships the
// "minimal" mode (row 1 only) so the placeholder dashboard renders without
// a selected business; the full per-business row 2 lands when fase-2 wires
// businesses + KPIs from the DB.

"use client";

import { useState, type ReactNode } from "react";

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

type Props = {
  crumb: Crumb;
  lang?: "NL" | "EN";
  onLangChange?: (lang: "NL" | "EN") => void;
  notifications?: number;
  weather?: { city: string; date: string; temp: string };
  avatarLetter?: string;
  /** Hamburger callback — only shown below 900px via CSS. */
  onToggleRail?: () => void;
  children?: ReactNode; // optional row 2 content
};

export function Header({
  crumb,
  lang = "NL",
  onLangChange,
  notifications = 0,
  weather = { city: "Breda", date: "1 mei", temp: "14°" },
  avatarLetter = "J",
  onToggleRail,
  children,
}: Props) {
  const [activeAvatar, setActiveAvatar] = useState(false);
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
          <span className="biz">
            <span className="swatch">{crumb.workspaceLetter}</span>{" "}
            {crumb.workspaceName}
          </span>
          <span className="sep">
            <ChevronRightIcon />
          </span>
          <span className="topic-with-status">
            <span className="topic">{crumb.pageTitle}</span>
            {crumb.showRunningDot && (
              <span className="running-dot" title="Automation running" />
            )}
          </span>
          {crumb.pageSub && (
            <span className="crumb-sub">· {crumb.pageSub}</span>
          )}
        </div>
        <div className="grow" />
        <div className="search">
          <SearchIcon />
          <span className="placeholder">
            Zoek of vraag aan AI: &quot;hoeveel verdiende YouTube vandaag?&quot;
          </span>
          <span className="kbd">⌘K</span>
        </div>
        <div className="grow" />
        <div className="voice">
          <span className="pulse">
            <MicIcon />
          </span>{" "}
          Praat met AI
        </div>
        <button className="ibtn" aria-label="Notifications">
          <BellIcon />
          {notifications > 0 && (
            <span className="dot-badge">{notifications}</span>
          )}
        </button>
        <div className="chip">
          <CloudIcon />
          <span>
            <strong>{weather.city}</strong> · {weather.date}
          </span>
          <span className="temp">{weather.temp}</span>
        </div>
        <div className="lang">
          <button
            className={lang === "NL" ? "active" : ""}
            onClick={() => onLangChange?.("NL")}
          >
            NL
          </button>
          <button
            className={lang === "EN" ? "active" : ""}
            onClick={() => onLangChange?.("EN")}
          >
            EN
          </button>
        </div>
        <div className="vrule" />
        <button
          className={"avatar-btn " + (activeAvatar ? "is-active" : "")}
          onClick={() => setActiveAvatar((v) => !v)}
          aria-label="User menu"
        >
          {avatarLetter}
        </button>
      </div>
      {children && <div className="row2">{children}</div>}
    </header>
  );
}
