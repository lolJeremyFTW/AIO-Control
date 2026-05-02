// Generic right-click / context menu primitive. Positioned at viewport
// (clientX, clientY); auto-flips when it would overflow. Click-outside
// and Escape both dismiss.
//
// The component renders nothing if `position` is null — render it
// unconditionally inside the parent and toggle position to show/hide.

"use client";

import {
  Fragment,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

export type ContextMenuItem =
  | { kind: "separator" }
  | {
      kind?: "item";
      label: string;
      icon?: ReactNode;
      onClick: () => void | Promise<void>;
      danger?: boolean;
      disabled?: boolean;
      shortcut?: string;
    };

type Props = {
  /** Viewport coordinates of the right-click. null = hidden. */
  position: { x: number; y: number } | null;
  items: ContextMenuItem[];
  /** Called when user dismisses (click-outside, Escape, or after item run). */
  onClose: () => void;
};

export function ContextMenu({ position, items, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [adjusted, setAdjusted] = useState(position);

  // Re-measure on open: flip if it'd run off-screen.
  useLayoutEffect(() => {
    if (!position) {
      setAdjusted(null);
      return;
    }
    setAdjusted(position);
    requestAnimationFrame(() => {
      const el = ref.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      let { x, y } = position;
      if (x + r.width > vw - 8) x = Math.max(8, vw - r.width - 8);
      if (y + r.height > vh - 8) y = Math.max(8, vh - r.height - 8);
      setAdjusted({ x, y });
    });
  }, [position]);

  useEffect(() => {
    if (!position) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    // mousedown so the menu vanishes BEFORE the underlying element gets
    // the click — feels right for "click anywhere to dismiss".
    document.addEventListener("mousedown", onDoc, true);
    document.addEventListener("keydown", onKey);
    // Also dismiss on scroll — otherwise the menu floats next to where
    // the row USED to be.
    const onScroll = () => onClose();
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", onDoc, true);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [position, onClose]);

  if (!position || !adjusted) return null;

  const style: CSSProperties = {
    position: "fixed",
    left: adjusted.x,
    top: adjusted.y,
    zIndex: 1200,
  };

  return (
    <div ref={ref} className="ctx-menu" style={style} role="menu">
      {items.map((it, i) => {
        if (it.kind === "separator") {
          return <div key={`sep-${i}`} className="ctx-sep" />;
        }
        return (
          <Fragment key={i}>
            <button
              type="button"
              role="menuitem"
              disabled={it.disabled}
              className={
                "ctx-item " +
                (it.danger ? "is-danger " : "") +
                (it.disabled ? "is-disabled" : "")
              }
              onClick={() => {
                if (it.disabled) return;
                void it.onClick();
                onClose();
              }}
            >
              <span className="ctx-icon" aria-hidden>
                {it.icon ?? null}
              </span>
              <span className="ctx-label">{it.label}</span>
              {it.shortcut && (
                <span className="ctx-shortcut">{it.shortcut}</span>
              )}
            </button>
          </Fragment>
        );
      })}
    </div>
  );
}
