// Reusable appearance picker for businesses + nav-nodes.
//
// Layout:
//   - Live preview node (round, exactly as it'll show in the rail)
//   - 14 preset palette swatches
//   - <input type="color"> + matching #hex text field
//   - File upload → Supabase Storage 'node-logos' → returns public URL
//   - Emoji picker + free-text icon
//
// State is fully controlled by the parent — this component just emits
// onChange whenever any of the four fields changes.

"use client";

import { useEffect, useRef, useState } from "react";

import { ALL_VARIANTS, Node } from "@aio/ui/rail/Node";

import { getSupabaseBrowserClient } from "../lib/supabase/client";

const QUICK_EMOJIS = [
  "🎬", "🎙️", "📺", "🛍️", "📈", "💬", "🤖", "🧠", "✏️", "🎨",
  "🛠️", "📱", "🌍", "📦", "💼", "🚀", "🪙", "📚", "📰", "🧩",
  "🎯", "📊", "🧪", "🎵", "📁", "🔍",
];

const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

export type AppearanceValue = {
  variant: string;
  icon: string;
  colorHex: string | null;
  logoUrl: string | null;
};

type Props = {
  value: AppearanceValue;
  onChange: (v: AppearanceValue) => void;
  /** The node's display name — used for the live-preview letter when
   *  no icon/logo is set. */
  displayName: string;
  /** Workspace id → file uploads land at <workspace_id>/<filename>. */
  workspaceId: string;
};

export function AppearancePicker({
  value,
  onChange,
  displayName,
  workspaceId,
}: Props) {
  const [hexDraft, setHexDraft] = useState(value.colorHex ?? "");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Keep the hex text field in sync if the parent resets the value.
  useEffect(() => {
    setHexDraft(value.colorHex ?? "");
  }, [value.colorHex]);

  const set = (patch: Partial<AppearanceValue>) =>
    onChange({ ...value, ...patch });

  const onPickFile = async (file: File) => {
    setUploadError(null);
    if (file.size > 524288) {
      setUploadError("Bestand te groot (max 512 KiB).");
      return;
    }
    if (!file.type.startsWith("image/")) {
      setUploadError("Alleen afbeeldingen.");
      return;
    }
    setUploading(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const ext = (file.name.split(".").pop() ?? "png").toLowerCase();
      const safeExt = /^[a-z0-9]+$/.test(ext) ? ext : "png";
      const path = `${workspaceId}/${Date.now()}-${crypto.randomUUID()}.${safeExt}`;
      const { error } = await supabase.storage
        .from("node-logos")
        .upload(path, file, {
          contentType: file.type,
          upsert: false,
          cacheControl: "3600",
        });
      if (error) {
        setUploadError(error.message);
        return;
      }
      const { data } = supabase.storage.from("node-logos").getPublicUrl(path);
      set({ logoUrl: data.publicUrl });
    } catch (e) {
      setUploadError(
        e instanceof Error ? e.message : "Upload mislukt onbekend.",
      );
    } finally {
      setUploading(false);
    }
  };

  const letter = (displayName || "X").slice(0, 1).toUpperCase();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* ── Live preview ──────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: 10,
          border: "1px solid var(--app-border-2)",
          borderRadius: 10,
          background: "var(--app-card-2)",
        }}
      >
        <Node
          variant={value.variant as Parameters<typeof Node>[0]["variant"]}
          colorHex={value.colorHex}
          logoUrl={value.logoUrl}
          icon={
            value.icon ? (
              <span style={{ fontSize: 18 }}>{value.icon}</span>
            ) : undefined
          }
          letter={value.icon || value.logoUrl ? undefined : letter}
          size={48}
          selected
        />
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>
            {displayName || "Onbenoemd"}
          </div>
          <div style={{ fontSize: 10.5, color: "var(--app-fg-3)" }}>
            Live preview
          </div>
        </div>
      </div>

      {/* ── Variant swatches ──────────────────────────────────── */}
      <div>
        <FieldLabel>Kleur (preset)</FieldLabel>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {ALL_VARIANTS.map((v) => (
            <button
              type="button"
              key={v}
              aria-label={v}
              aria-pressed={value.variant === v && !value.colorHex}
              onClick={() => set({ variant: v, colorHex: null })}
              className={`node ${v}`}
              style={{
                width: 30,
                height: 30,
                fontSize: 11,
                outline:
                  value.variant === v && !value.colorHex
                    ? "2.5px solid var(--tt-green)"
                    : "0",
                outlineOffset: 2,
                cursor: "pointer",
                ["--size" as string]: "30px",
              }}
            >
              {value.icon || letter}
            </button>
          ))}
        </div>
      </div>

      {/* ── Custom hex ────────────────────────────────────────── */}
      <div>
        <FieldLabel>Custom hex (overschrijft preset)</FieldLabel>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            type="color"
            value={
              value.colorHex && HEX_RE.test(value.colorHex)
                ? expandHex(value.colorHex)
                : "#39b255"
            }
            onChange={(e) => {
              const hex = e.target.value;
              setHexDraft(hex);
              set({ colorHex: hex });
            }}
            style={{
              width: 38,
              height: 32,
              padding: 0,
              border: "1.5px solid var(--app-border)",
              borderRadius: 6,
              background: "var(--app-card-2)",
              cursor: "pointer",
            }}
            aria-label="Kies hex-kleur"
          />
          <input
            value={hexDraft}
            onChange={(e) => setHexDraft(e.target.value)}
            onBlur={() => {
              if (!hexDraft) {
                set({ colorHex: null });
                return;
              }
              if (HEX_RE.test(hexDraft)) {
                set({ colorHex: hexDraft.toLowerCase() });
              } else {
                setHexDraft(value.colorHex ?? "");
              }
            }}
            placeholder="#7e3af2"
            style={{
              flex: 1,
              background: "var(--app-card-2)",
              border: "1.5px solid var(--app-border)",
              color: "var(--app-fg)",
              padding: "7px 10px",
              borderRadius: 8,
              fontFamily: "var(--type)",
              fontSize: 13,
              fontVariantNumeric: "tabular-nums",
            }}
          />
          {value.colorHex && (
            <button
              type="button"
              onClick={() => {
                setHexDraft("");
                set({ colorHex: null });
              }}
              style={btnGhost}
            >
              ✕ wissen
            </button>
          )}
        </div>
      </div>

      {/* ── Logo upload ───────────────────────────────────────── */}
      <div>
        <FieldLabel>Logo / icoon (optioneel)</FieldLabel>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif"
            style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onPickFile(f);
              if (fileRef.current) fileRef.current.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            style={{
              padding: "8px 12px",
              border: "1.5px solid var(--app-border)",
              background: "var(--app-card-2)",
              color: "var(--app-fg)",
              borderRadius: 8,
              fontWeight: 700,
              fontSize: 12,
              cursor: uploading ? "wait" : "pointer",
            }}
          >
            {uploading
              ? "Uploaden…"
              : value.logoUrl
                ? "Vervang logo"
                : "Upload logo"}
          </button>
          {value.logoUrl && (
            <button
              type="button"
              onClick={() => set({ logoUrl: null })}
              style={btnGhost}
            >
              ✕ verwijder
            </button>
          )}
          <span style={{ fontSize: 10.5, color: "var(--app-fg-3)" }}>
            ≤512 KiB · png/jpg/webp/svg/gif
          </span>
        </div>
        {uploadError && (
          <p
            role="alert"
            style={{
              color: "var(--rose)",
              fontSize: 11.5,
              margin: "6px 0 0",
            }}
          >
            {uploadError}
          </p>
        )}
      </div>

      {/* ── Emoji + text icon ─────────────────────────────────── */}
      <div>
        <FieldLabel>Emoji of letter (alternatief voor logo)</FieldLabel>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input
            value={value.icon}
            onChange={(e) => set({ icon: e.target.value.slice(0, 4) })}
            placeholder="🎬"
            style={{
              width: 90,
              background: "var(--app-card-2)",
              border: "1.5px solid var(--app-border)",
              color: "var(--app-fg)",
              padding: "7px 10px",
              borderRadius: 8,
              fontFamily: "var(--type)",
              fontSize: 14,
            }}
          />
          {value.icon && (
            <button
              type="button"
              onClick={() => set({ icon: "" })}
              style={btnGhost}
            >
              ✕
            </button>
          )}
        </div>
        <div
          style={{
            display: "flex",
            gap: 6,
            marginTop: 8,
            flexWrap: "wrap",
          }}
        >
          {QUICK_EMOJIS.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => set({ icon: e })}
              style={{
                width: 28,
                height: 28,
                border: `1.5px solid ${
                  value.icon === e ? "var(--tt-green)" : "var(--app-border)"
                }`,
                background: "var(--app-card-2)",
                borderRadius: 8,
                cursor: "pointer",
                fontSize: 15,
                lineHeight: 1,
                padding: 0,
              }}
            >
              {e}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 11.5,
        fontWeight: 600,
        color: "var(--app-fg-2)",
        marginBottom: 6,
      }}
    >
      {children}
    </div>
  );
}

const btnGhost: React.CSSProperties = {
  padding: "7px 10px",
  border: "1.5px solid var(--app-border)",
  background: "transparent",
  color: "var(--app-fg-3)",
  borderRadius: 8,
  fontSize: 11,
  cursor: "pointer",
};

// Pad #abc → #aabbcc so <input type="color"> accepts it.
function expandHex(hex: string): string {
  const m = hex.replace("#", "");
  if (m.length === 3) {
    return (
      "#" +
      m
        .split("")
        .map((c) => c + c)
        .join("")
    );
  }
  if (m.length === 8) return "#" + m.slice(0, 6); // strip alpha for the picker
  return "#" + m;
}
