// Theme switcher — flips body[data-theme] between "dark" (default)
// and "light" (TrompTech off-white + green). Persists to localStorage
// so the choice sticks across reloads. Render it anywhere; the click
// just touches the body attribute.
//
// Light theme is already wired in globals.css through the
// body[data-theme="light"] selector cascade.

"use client";

import { useEffect, useState } from "react";

export function ThemeToggle() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  // Hydrate from localStorage / system preference on first render.
  useEffect(() => {
    let saved: "dark" | "light" | null = null;
    try {
      saved = (localStorage.getItem("aio-theme") as "dark" | "light") ?? null;
    } catch {
      /* SSR / private mode */
    }
    const initial =
      saved ??
      (window.matchMedia("(prefers-color-scheme: light)").matches
        ? "light"
        : "dark");
    apply(initial);
    setTheme(initial);
  }, []);

  const apply = (t: "dark" | "light") => {
    document.body.setAttribute("data-theme", t);
    document.documentElement.style.colorScheme = t;
  };

  const flip = () => {
    const next = theme === "dark" ? "light" : "dark";
    apply(next);
    setTheme(next);
    try {
      localStorage.setItem("aio-theme", next);
    } catch {
      /* ignore */
    }
  };

  return (
    <button
      type="button"
      onClick={flip}
      className="theme-toggle"
      title={theme === "dark" ? "Switch to light" : "Switch to dark"}
      aria-label={theme === "dark" ? "Switch to light" : "Switch to dark"}
    >
      {theme === "dark" ? "🌙" : "☀️"}
    </button>
  );
}
