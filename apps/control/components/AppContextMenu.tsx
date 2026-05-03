// Global right-click handler that prevents the native browser menu
// EVERYWHERE inside the workspace shell. Surfaces that already wire
// their own custom menu (business cards, topic rows, agent cards,
// queue items) opt-out by calling e.stopPropagation() in their own
// onContextMenu handler — so the bubble never reaches us.
//
// We render a fallback menu on the bare canvas (clicks on plain
// content) with sensible workspace-wide actions: Reload, Open chat,
// Search, etc.

"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { ContextMenu, type ContextMenuItem } from "@aio/ui/context-menu";
import {
  ChatIcon,
  CoinIcon,
  GridIcon,
  InboxIcon,
  ListIcon,
  RefreshIcon,
  SearchIcon,
  SettingsIcon,
} from "@aio/ui/icon";

type Props = {
  workspaceSlug: string;
};

export function AppContextMenu({ workspaceSlug }: Props) {
  const router = useRouter();
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const lastTarget = useRef<EventTarget | null>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      // Defense-in-depth: any per-row contextmenu handler that already
      // called preventDefault() is signalling "I've handled this".
      // Even if it forgot to also stopPropagation(), bail here so the
      // global menu doesn't open ON TOP of the row-specific menu.
      if (e.defaultPrevented) return;

      // Honour text selection — the user usually wants the native
      // copy/paste menu when they right-click on selected text.
      const sel = window.getSelection();
      if (sel && sel.toString().length > 0) return;

      // Honour form controls — let the user paste / copy via native
      // menu inside inputs, textareas, contenteditable.
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.isContentEditable ||
          t.closest("input, textarea, [contenteditable=true]"))
      ) {
        return;
      }

      // Honour explicit opt-outs (data-allow-native-context). Use this
      // to whitelist e.g. embedded iframes.
      if (t?.closest("[data-allow-native-context]")) return;

      // Anything else: block the native menu and show our fallback.
      e.preventDefault();
      lastTarget.current = e.target;
      setPos({ x: e.clientX, y: e.clientY });
    };
    document.addEventListener("contextmenu", handler);
    return () => document.removeEventListener("contextmenu", handler);
  }, []);

  const items: ContextMenuItem[] = [
    {
      label: "Zoeken",
      icon: <SearchIcon size={14} />,
      shortcut: "Ctrl+K",
      onClick: () => {
        const el = document.querySelector(".search") as HTMLElement | null;
        if (el) el.click();
      },
    },
    {
      label: "Open chat",
      icon: <ChatIcon size={14} />,
      onClick: () => {
        const ev = new CustomEvent("aio:open-chat");
        window.dispatchEvent(ev);
      },
    },
    { kind: "separator" },
    {
      label: "Dashboard",
      icon: <GridIcon size={14} />,
      onClick: () => router.push(`/${workspaceSlug}/dashboard`),
    },
    {
      label: "Wachtrij",
      icon: <InboxIcon size={14} />,
      onClick: () => router.push(`/${workspaceSlug}/queue`),
    },
    {
      label: "Runs",
      icon: <ListIcon size={14} />,
      onClick: () => router.push(`/${workspaceSlug}/runs`),
    },
    {
      label: "Cost & spend",
      icon: <CoinIcon size={14} />,
      onClick: () => router.push(`/${workspaceSlug}/cost`),
    },
    { kind: "separator" },
    {
      label: "Settings",
      icon: <SettingsIcon size={14} />,
      onClick: () => router.push(`/${workspaceSlug}/settings`),
    },
    {
      label: "Pagina herladen",
      icon: <RefreshIcon size={14} />,
      onClick: () => router.refresh(),
    },
  ];

  return (
    <ContextMenu
      position={pos}
      items={items}
      onClose={() => setPos(null)}
    />
  );
}
