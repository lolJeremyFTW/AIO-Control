// Hand-drawn-feel icons. Lifted from the design bundle's icons.jsx; we keep
// only the glyphs we use across the app and convert each to a typed React FC.

import type { ReactElement } from "react";

type Props = { size?: number; className?: string };

const stroke =
  "stroke-current stroke-[2] [stroke-linecap:round] [stroke-linejoin:round]";

export const PlusIcon = ({ size = 18 }: Props) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

export const SettingsIcon = ({ size = 18 }: Props) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.9"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1A2 2 0 1 1 4.4 17l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1A2 2 0 1 1 7 4.4l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z" />
  </svg>
);

export const SearchIcon = ({ size = 16 }: Props) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="11" cy="11" r="7" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);

export const BellIcon = ({ size = 16 }: Props) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M18 16v-5a6 6 0 0 0-12 0v5l-2 2v1h16v-1l-2-2z" />
    <path d="M10 21a2 2 0 0 0 4 0" />
  </svg>
);

export const MicIcon = ({ size = 13 }: Props) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="9" y="3" width="6" height="12" rx="3" />
    <path d="M5 11a7 7 0 0 0 14 0M12 18v3M8 21h8" />
  </svg>
);

export const CloudIcon = ({ size = 14 }: Props) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M17.5 19a4.5 4.5 0 0 0 0-9 6 6 0 0 0-11.5 1.7A4 4 0 0 0 7 19h10.5z" />
  </svg>
);

export const ChevronRightIcon = ({ size = 13 }: Props) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polyline points="9 18 15 12 9 6" />
  </svg>
);

export const ChevronDownIcon = ({ size = 12 }: Props) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.4"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

export const ChatIcon = ({ size = 22 }: Props) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
);

export const HandIcon = ({ size = 14 }: Props) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M9 11V6a2 2 0 1 1 4 0v5" />
    <path d="M13 11V4a2 2 0 1 1 4 0v9" />
    <path d="M17 11V7a2 2 0 1 1 4 0v9a6 6 0 0 1-6 6h-3a6 6 0 0 1-6-6v-3a2 2 0 1 1 4 0" />
  </svg>
);

export const SunIcon = ({ size = 16 }: Props) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="12" cy="12" r="4" />
    <line x1="12" y1="2" x2="12" y2="5" />
    <line x1="12" y1="19" x2="12" y2="22" />
    <line x1="2" y1="12" x2="5" y2="12" />
    <line x1="19" y1="12" x2="22" y2="12" />
    <line x1="4.93" y1="4.93" x2="7.05" y2="7.05" />
    <line x1="16.95" y1="16.95" x2="19.07" y2="19.07" />
    <line x1="4.93" y1="19.07" x2="7.05" y2="16.95" />
    <line x1="16.95" y1="7.05" x2="19.07" y2="4.93" />
  </svg>
);

export const MoonIcon = ({ size = 16 }: Props) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
  </svg>
);

export const RefreshIcon = ({ size = 16 }: Props) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polyline points="23 4 23 10 17 10" />
    <polyline points="1 20 1 14 7 14" />
    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
  </svg>
);

export const GridIcon = ({ size = 16 }: Props) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="3" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" />
    <rect x="14" y="14" width="7" height="7" rx="1" />
  </svg>
);

export const InboxIcon = ({ size = 16 }: Props) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
    <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
  </svg>
);

export const ListIcon = ({ size = 16 }: Props) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <line x1="8" y1="6" x2="21" y2="6" />
    <line x1="8" y1="12" x2="21" y2="12" />
    <line x1="8" y1="18" x2="21" y2="18" />
    <line x1="3" y1="6" x2="3.01" y2="6" />
    <line x1="3" y1="12" x2="3.01" y2="12" />
    <line x1="3" y1="18" x2="3.01" y2="18" />
  </svg>
);

export const CoinIcon = ({ size = 16 }: Props) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <line x1="12" y1="1" x2="12" y2="23" />
    <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
  </svg>
);

export const ChartIcon = ({ size = 16 }: Props) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <line x1="18" y1="20" x2="18" y2="10" />
    <line x1="12" y1="20" x2="12" y2="4" />
    <line x1="6" y1="20" x2="6" y2="14" />
    <line x1="3" y1="20" x2="21" y2="20" />
  </svg>
);

export const VideoIcon = ({ size = 18 }: Props) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="23 7 16 12 23 17 23 7" />
    <rect x="1" y="5" width="15" height="14" rx="2" />
  </svg>
);

export const TvIcon = ({ size = 18 }: Props) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="7" width="20" height="15" rx="2" />
    <polyline points="17 2 12 7 7 2" />
  </svg>
);

export const ShoppingIcon = ({ size = 18 }: Props) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
    <line x1="3" y1="6" x2="21" y2="6" />
    <path d="M16 10a4 4 0 0 1-8 0" />
  </svg>
);

export const TrendUpIcon = ({ size = 18 }: Props) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
    <polyline points="17 6 23 6 23 12" />
  </svg>
);

export const RobotIcon = ({ size = 18 }: Props) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="4" y="7" width="16" height="13" rx="2" />
    <line x1="12" y1="2" x2="12" y2="7" />
    <circle cx="9" cy="13" r="1.2" />
    <circle cx="15" cy="13" r="1.2" />
    <line x1="9" y1="17" x2="15" y2="17" />
  </svg>
);

export const BrainIcon = ({ size = 18 }: Props) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9.5 3a3.5 3.5 0 0 0-3.5 3.5v.5a3 3 0 0 0-2 5.5v0a3 3 0 0 0 2 5.5V19a3 3 0 0 0 6 0V3.5A3.5 3.5 0 0 0 9.5 3z" />
    <path d="M14.5 3a3.5 3.5 0 0 1 3.5 3.5v.5a3 3 0 0 1 2 5.5v0a3 3 0 0 1-2 5.5V19a3 3 0 0 1-6 0V3.5A3.5 3.5 0 0 1 14.5 3z" />
  </svg>
);

export const EditPenIcon = ({ size = 18 }: Props) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
  </svg>
);

export const PaletteIcon = ({ size = 18 }: Props) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2a10 10 0 0 0 0 20c1.7 0 2-1.3 2-2s-.3-2 1-2h2a5 5 0 0 0 5-5c0-6-5-11-10-11z" />
    <circle cx="6.5" cy="11.5" r="1.5" />
    <circle cx="9.5" cy="7.5" r="1.5" />
    <circle cx="14.5" cy="7.5" r="1.5" />
    <circle cx="17.5" cy="11.5" r="1.5" />
  </svg>
);

export const ToolsIcon = ({ size = 18 }: Props) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94L9 17a3 3 0 0 1-4.24-4.24L11.07 6.5a6 6 0 0 1 7.94-7.94L15.24 2.34a1 1 0 0 0 0 1.4z" />
  </svg>
);

export const PhoneIcon = ({ size = 18 }: Props) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="5" y="2" width="14" height="20" rx="2" />
    <line x1="12" y1="18" x2="12" y2="18" />
  </svg>
);

export const GlobeIcon = ({ size = 18 }: Props) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <line x1="2" y1="12" x2="22" y2="12" />
    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
  </svg>
);

export const PackageIcon = ({ size = 18 }: Props) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M16.5 9.4 7.55 4.24" />
    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
    <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
    <line x1="12" y1="22.08" x2="12" y2="12" />
  </svg>
);

export const BriefcaseIcon = ({ size = 18 }: Props) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="7" width="20" height="14" rx="2" />
    <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
  </svg>
);

export const RocketIcon = ({ size = 18 }: Props) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" />
    <path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" />
    <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" />
    <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
  </svg>
);

export const BookIcon = ({ size = 18 }: Props) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
  </svg>
);

export const NewsIcon = ({ size = 18 }: Props) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2" />
    <path d="M18 14h-8" />
    <path d="M15 18h-5" />
    <path d="M10 6h8v4h-8z" />
  </svg>
);

export const PuzzleIcon = ({ size = 18 }: Props) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M19 11h2a2 2 0 0 1 0 4h-2v3a2 2 0 0 1-2 2h-3v-2a2 2 0 0 0-4 0v2H7a2 2 0 0 1-2-2v-3H3a2 2 0 0 1 0-4h2V8a2 2 0 0 1 2-2h3V4a2 2 0 0 1 4 0v2h3a2 2 0 0 1 2 2z" />
  </svg>
);

export const TargetIcon = ({ size = 18 }: Props) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <circle cx="12" cy="12" r="6" />
    <circle cx="12" cy="12" r="2" />
  </svg>
);

export const FlaskIcon = ({ size = 18 }: Props) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 3h6" />
    <path d="M10 3v6L4 20a2 2 0 0 0 1.7 3h12.6A2 2 0 0 0 20 20l-6-11V3" />
  </svg>
);

export const MusicIcon = ({ size = 18 }: Props) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 18V5l12-2v13" />
    <circle cx="6" cy="18" r="3" />
    <circle cx="18" cy="16" r="3" />
  </svg>
);

export const FolderIcon = ({ size = 18 }: Props) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
  </svg>
);

// ─── Weather glyphs (used by the header forecast dropdown) ──────────
// Friendly handcrafted SVGs that match the design system's stroke
// weight + cap style. They sit in the icon registry like any other
// AppIcon so renderers can call getAppIcon("weather-sun", 18).
export const WeatherSunIcon = ({ size = 18 }: Props) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="4" />
    <line x1="12" y1="2" x2="12" y2="5" />
    <line x1="12" y1="19" x2="12" y2="22" />
    <line x1="2" y1="12" x2="5" y2="12" />
    <line x1="19" y1="12" x2="22" y2="12" />
    <line x1="4.93" y1="4.93" x2="7.05" y2="7.05" />
    <line x1="16.95" y1="16.95" x2="19.07" y2="19.07" />
  </svg>
);
export const WeatherPartlyIcon = ({ size = 18 }: Props) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="8" cy="9" r="3.2" />
    <line x1="8" y1="3" x2="8" y2="4.5" />
    <line x1="3" y1="9" x2="4.5" y2="9" />
    <line x1="4" y1="5" x2="5.2" y2="6.2" />
    <path d="M16.5 19a4 4 0 0 0 0-8 5.5 5.5 0 0 0-10.4 1.5A3.5 3.5 0 0 0 7 19h9.5z" />
  </svg>
);
export const WeatherCloudIcon = ({ size = 18 }: Props) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17.5 19a4.5 4.5 0 0 0 0-9 6 6 0 0 0-11.5 1.7A4 4 0 0 0 7 19h10.5z" />
  </svg>
);
export const WeatherRainIcon = ({ size = 18 }: Props) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17.5 14a4.5 4.5 0 0 0 0-9 6 6 0 0 0-11.5 1.7A4 4 0 0 0 7 14h10.5z" />
    <line x1="8" y1="17" x2="7" y2="21" />
    <line x1="12" y1="17" x2="11" y2="21" />
    <line x1="16" y1="17" x2="15" y2="21" />
  </svg>
);
export const WeatherSnowIcon = ({ size = 18 }: Props) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17.5 14a4.5 4.5 0 0 0 0-9 6 6 0 0 0-11.5 1.7A4 4 0 0 0 7 14h10.5z" />
    <circle cx="8" cy="19" r="0.6" fill="currentColor" />
    <circle cx="12" cy="20" r="0.6" fill="currentColor" />
    <circle cx="16" cy="19" r="0.6" fill="currentColor" />
    <circle cx="10" cy="22" r="0.6" fill="currentColor" />
    <circle cx="14" cy="22" r="0.6" fill="currentColor" />
  </svg>
);
export const WeatherFogIcon = ({ size = 18 }: Props) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="3" y1="9" x2="21" y2="9" />
    <line x1="5" y1="13" x2="19" y2="13" />
    <line x1="3" y1="17" x2="17" y2="17" />
    <line x1="6" y1="21" x2="20" y2="21" />
  </svg>
);
export const WeatherStormIcon = ({ size = 18 }: Props) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17.5 13a4.5 4.5 0 0 0 0-9 6 6 0 0 0-11.5 1.7A4 4 0 0 0 7 13h10.5z" />
    <polyline points="11 15 8 20 12 20 9 23" />
  </svg>
);

// ─── Icon registry ───────────────────────────────────────────────────
//
// Persisted business / topic icons reference these names (e.g. "video",
// "rocket"). The picker shows the full set; renderers use getAppIcon()
// to look up the SVG component. New icons can be added freely — old
// records that reference an unknown name fall back to the letter glyph
// in the Node component.
//
// We deliberately keep the catalogue small + curated. Everything is
// hand-tuned to match the design system's stroke weight + cap style;
// dropping in a third-party icon font would clash visually.

export type AppIconName =
  | "video"
  | "mic"
  | "tv"
  | "shopping"
  | "trend-up"
  | "chat"
  | "robot"
  | "brain"
  | "edit"
  | "palette"
  | "tools"
  | "phone"
  | "globe"
  | "package"
  | "briefcase"
  | "rocket"
  | "coin"
  | "book"
  | "news"
  | "puzzle"
  | "target"
  | "chart"
  | "flask"
  | "music"
  | "folder"
  | "search"
  | "list"
  | "inbox"
  | "grid"
  | "settings"
  | "bell"
  | "weather-sun"
  | "weather-partly"
  | "weather-cloud"
  | "weather-rain"
  | "weather-snow"
  | "weather-fog"
  | "weather-storm";

const REGISTRY: Record<AppIconName, (props: Props) => ReactElement> = {
  video: VideoIcon,
  mic: MicIcon,
  tv: TvIcon,
  shopping: ShoppingIcon,
  "trend-up": TrendUpIcon,
  chat: ChatIcon,
  robot: RobotIcon,
  brain: BrainIcon,
  edit: EditPenIcon,
  palette: PaletteIcon,
  tools: ToolsIcon,
  phone: PhoneIcon,
  globe: GlobeIcon,
  package: PackageIcon,
  briefcase: BriefcaseIcon,
  rocket: RocketIcon,
  coin: CoinIcon,
  book: BookIcon,
  news: NewsIcon,
  puzzle: PuzzleIcon,
  target: TargetIcon,
  chart: ChartIcon,
  flask: FlaskIcon,
  music: MusicIcon,
  folder: FolderIcon,
  search: SearchIcon,
  list: ListIcon,
  inbox: InboxIcon,
  grid: GridIcon,
  settings: SettingsIcon,
  bell: BellIcon,
  "weather-sun": WeatherSunIcon,
  "weather-partly": WeatherPartlyIcon,
  "weather-cloud": WeatherCloudIcon,
  "weather-rain": WeatherRainIcon,
  "weather-snow": WeatherSnowIcon,
  "weather-fog": WeatherFogIcon,
  "weather-storm": WeatherStormIcon,
};

/** Set of names exposed in the appearance picker. Order = display order. */
export const APP_ICON_PICKER_NAMES: AppIconName[] = [
  "video",
  "tv",
  "mic",
  "shopping",
  "trend-up",
  "chart",
  "coin",
  "chat",
  "robot",
  "brain",
  "edit",
  "palette",
  "tools",
  "phone",
  "globe",
  "package",
  "briefcase",
  "rocket",
  "book",
  "news",
  "puzzle",
  "target",
  "flask",
  "music",
  "folder",
  "list",
];

export function isAppIconName(s: string | null | undefined): s is AppIconName {
  return !!s && Object.prototype.hasOwnProperty.call(REGISTRY, s);
}

/** Render a registered icon by name, or null when the name isn't known.
 *  Use this in places that previously rendered an emoji span:
 *    {getAppIcon(node.icon, 18) ?? (node.icon ? <span>{node.icon}</span> : null)}
 *  The fallback span is what keeps old emoji-based rows rendering. */
export function getAppIcon(
  name: string | null | undefined,
  size = 18,
): ReactElement | null {
  if (!isAppIconName(name)) return null;
  const Cmp = REGISTRY[name];
  return <Cmp size={size} />;
}

// Avoid an "unused export" warning if a consumer imports a named ref.
void stroke;
