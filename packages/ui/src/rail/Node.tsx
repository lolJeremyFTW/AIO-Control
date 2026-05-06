// Circular node — the round chip used for businesses + actions in the rail.
// Direct port of the design bundle's rail.jsx, made type-safe.
//
// Customisation precedence:
//   1. logoUrl   → render <img>, ignore letter/icon/colour
//   2. icon      → render the supplied node (emoji <span>, svg, …)
//   3. letter    → render plain letter
//
// colorHex (any CSS hex) overrides the variant's preset palette and
// flows into both the background and the selected ring via inline
// styles. variant stays the structural baseline ("dashed" still draws
// the dashed border ring, etc).

import type { CSSProperties, ReactNode } from "react";

// 14 colour swatches + the structural "outline" / "dashed" variants.
// All swatches are also defined as CSS classes in globals.css.
export type NodeVariant =
  | "outline"
  | "brand"
  | "orange"
  | "indigo"
  | "blue"
  | "violet"
  | "rose"
  | "amber"
  | "teal"
  | "lime"
  | "magenta"
  | "sky"
  | "coral"
  | "slate"
  | "gold"
  | "dashed";

export const ALL_VARIANTS: Exclude<NodeVariant, "outline" | "dashed">[] = [
  "brand",
  "orange",
  "indigo",
  "blue",
  "violet",
  "rose",
  "amber",
  "teal",
  "lime",
  "magenta",
  "sky",
  "coral",
  "slate",
  "gold",
];

type Props = {
  variant?: NodeVariant;
  size?: number;
  letter?: string;
  icon?: ReactNode;
  /** Optional CSS hex (e.g. "#7e3af2"). Overrides the variant's preset
   *  palette inline. Kept null/undefined to fall back to the variant. */
  colorHex?: string | null;
  /** Optional uploaded logo URL. When set, replaces the letter/icon
   *  with an <img> rendered to the node's circular shape. */
  logoUrl?: string | null;
  selected?: boolean;
  badge?: number | "dot" | null;
  tooltip?: string | null;
  onClick?: () => void;
};

export function Node({
  variant = "outline",
  size = 44,
  letter,
  icon,
  colorHex,
  logoUrl,
  selected = false,
  badge = null,
  tooltip,
  onClick,
}: Props) {
  const cls = ["node", variant];
  if (selected) cls.push("selected");
  if (logoUrl) cls.push("has-logo");

  // Build inline styles. We only override colour-related properties
  // when colorHex is supplied; otherwise the variant CSS class wins.
  const style: CSSProperties = { ["--size" as string]: `${size}px` };
  if (colorHex) {
    style.background = colorHex;
    style.borderColor = colorHex;
    // Pick a foreground that stays readable on the chosen hue.
    style.color = readableTextColor(colorHex);
  }

  return (
    <div className={cls.join(" ")} style={style} onClick={onClick}>
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logoUrl}
          alt=""
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            borderRadius: "50%",
            display: "block",
          }}
        />
      ) : icon ? (
        icon
      ) : letter ? (
        letter
      ) : null}
      {badge === "dot" && <span className="badge dot" />}
      {typeof badge === "number" && badge > 0 && (
        <span className="badge">{badge > 99 ? "99+" : badge}</span>
      )}
      {tooltip && <span className="tip">{tooltip}</span>}
    </div>
  );
}

// Return "#fff" or "#1a1c1a" depending on the YIQ luminance of the
// supplied hex. Keeps user-chosen colours legible without forcing
// every node to be dark-on-light. Accepts #rgb, #rrggbb, #rrggbbaa.
function readableTextColor(hex: string): string {
  const m = hex.replace("#", "").trim();
  const expanded =
    m.length === 3
      ? m
          .split("")
          .map((c) => c + c)
          .join("")
      : m;
  const r = parseInt(expanded.slice(0, 2), 16);
  const g = parseInt(expanded.slice(2, 4), 16);
  const b = parseInt(expanded.slice(4, 6), 16);
  if ([r, g, b].some((n) => Number.isNaN(n))) return "#fff";
  // YIQ luminance — a rough perceived-brightness shortcut.
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 180 ? "#1a1c1a" : "#fff";
}
