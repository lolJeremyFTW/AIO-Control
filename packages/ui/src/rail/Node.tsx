// Circular node — the round chip used for businesses + actions in the rail.
// Direct port of the design bundle's rail.jsx, made type-safe.

import type { CSSProperties, ReactNode } from "react";

export type NodeVariant =
  | "outline"
  | "brand"
  | "orange"
  | "indigo"
  | "blue"
  | "violet"
  | "rose"
  | "amber"
  | "dashed";

type Props = {
  variant?: NodeVariant;
  size?: number;
  letter?: string;
  icon?: ReactNode;
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
  selected = false,
  badge = null,
  tooltip,
  onClick,
}: Props) {
  const cls = ["node", variant];
  if (selected) cls.push("selected");
  const style = { ["--size" as string]: `${size}px` } as CSSProperties;
  return (
    <div className={cls.join(" ")} style={style} onClick={onClick}>
      {icon ? icon : letter ? letter : null}
      {badge === "dot" && <span className="badge dot" />}
      {typeof badge === "number" && badge > 0 && (
        <span className="badge">{badge > 99 ? "99+" : badge}</span>
      )}
      {tooltip && <span className="tip">{tooltip}</span>}
    </div>
  );
}
