// Multi-step setup wizard for new businesses. Replaces the single
// NewBusinessDialog with a guided flow:
//
//   Step 1  Identity      name + sub + appearance (variant + icon + logo)
//   Step 2  Intent        description + mission + first targets
//   Step 3  Topics        seed initial nav-nodes ("Content / Marketing /…")
//   Step 4  Isolation     standalone vs inherits-from-workspace
//   Step 5  Confirm       summary + create
//
// All work happens in step 5 — earlier steps are local state. After
// create we router.refresh and close.

"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { createBusiness } from "../app/actions/businesses";
import { createNavNode } from "../app/actions/nav-nodes";
import { AppearancePicker, type AppearanceValue } from "./AppearancePicker";
import { TargetsEditor, type Target } from "./TargetsEditor";

type Props = {
  workspaceSlug: string;
  workspaceId: string;
  onClose: () => void;
};

const STEPS = [
  { id: 1, label: "Identiteit" },
  { id: 2, label: "Doel" },
  { id: 3, label: "Topics" },
  { id: 4, label: "Isolatie" },
  { id: 5, label: "Bevestig" },
];

// Topic preset bundles. Plain names — the user picks an SVG icon for
// each topic later in the topic-edit dialog. NEVER use emojis here.
const TOPIC_PRESETS = [
  ["Content", "Marketing", "Sales", "Analytics"],
  ["Video", "Thumbnails", "Scripts", "Publishing"],
  ["Listings", "Customer service", "Fulfillment"],
  ["Agents", "Schedules", "Integrations"],
];

export function BusinessSetupWizard({
  workspaceSlug,
  workspaceId,
  onClose,
}: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  useEffect(() => {
    ref.current?.showModal();
  }, []);

  const [step, setStep] = useState(1);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Step 1: Identity ──
  const [name, setName] = useState("");
  const [sub, setSub] = useState("");
  const [appearance, setAppearance] = useState<AppearanceValue>({
    variant: "brand",
    icon: "",
    colorHex: null,
    logoUrl: null,
  });

  // ── Step 2: Intent ──
  const [description, setDescription] = useState("");
  const [mission, setMission] = useState("");
  const [targets, setTargets] = useState<Target[]>([]);

  // ── Step 3: Topics ──
  const [topicNames, setTopicNames] = useState<string[]>([]);
  const [topicInput, setTopicInput] = useState("");
  const addTopic = () => {
    const t = topicInput.trim();
    if (!t) return;
    if (!topicNames.includes(t)) setTopicNames([...topicNames, t]);
    setTopicInput("");
  };

  // ── Step 4: Isolation ──
  const [isolated, setIsolated] = useState(false);

  const canNext = step === 1 ? name.trim().length > 0 : true;

  const submit = async () => {
    setError(null);
    setCreating(true);
    try {
      const res = await createBusiness({
        workspace_slug: workspaceSlug,
        workspace_id: workspaceId,
        name,
        sub: sub || undefined,
        variant: appearance.variant,
        icon: appearance.icon || undefined,
        color_hex: appearance.colorHex,
        logo_url: appearance.logoUrl,
        description: description || undefined,
        mission: mission || undefined,
        isolated,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      // Topics — best-effort, sequentially. We no longer parse out a
      // leading emoji from the input; the appearance picker on the
      // topic-edit dialog is the right place to choose an SVG icon.
      for (const t of topicNames) {
        await createNavNode({
          workspace_slug: workspaceSlug,
          workspace_id: workspaceId,
          business_id: res.data.id,
          parent_id: null,
          name: t,
        });
      }
      // Targets aren't on createBusiness — push them via updateBusiness
      // immediately if any were entered.
      if (targets.length > 0) {
        const { updateBusiness } = await import(
          "../app/actions/businesses"
        );
        await updateBusiness({
          workspace_slug: workspaceSlug,
          id: res.data.id,
          patch: { targets },
        });
      }
      onClose();
      router.push(`/${workspaceSlug}/business/${res.data.id}`);
    } finally {
      setCreating(false);
    }
  };

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      style={{
        background: "var(--app-card)",
        border: "1.5px solid var(--app-border)",
        borderRadius: 16,
        color: "var(--app-fg)",
        padding: 0,
        maxWidth: 640,
        width: "calc(100% - 32px)",
        boxShadow: "0 24px 60px -12px rgba(0,0,0,0.55)",
      }}
    >
      <div style={{ padding: "20px 24px 24px", maxHeight: "85vh", overflow: "auto" }}>
        {/* ── Stepper ─────────────────────────────────────── */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <h2
            style={{
              fontFamily: "var(--hand)",
              fontSize: 26,
              fontWeight: 700,
              margin: 0,
              letterSpacing: "-0.3px",
            }}
          >
            Nieuwe business · stap {step} / 5
          </h2>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "5px 9px",
              border: "1.5px solid var(--app-border)",
              background: "transparent",
              color: "var(--app-fg-2)",
              borderRadius: 8,
              fontSize: 11,
              cursor: "pointer",
            }}
          >
            ✕
          </button>
        </div>
        <div style={{ display: "flex", gap: 6, marginBottom: 18 }}>
          {STEPS.map((s) => (
            <div
              key={s.id}
              style={{
                flex: 1,
                height: 4,
                background:
                  step >= s.id ? "var(--tt-green)" : "var(--app-border-2)",
                borderRadius: 2,
              }}
              title={s.label}
            />
          ))}
        </div>

        {/* ── Step 1 ──────────────────────────────────────── */}
        {step === 1 && (
          <>
            <p style={hint}>
              Geef je business een naam en uiterlijk. Sub is optioneel —
              handig voor varianten zoals &quot;NL Tech kanaal&quot;.
            </p>
            <Field label="Naam">
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Faceless YouTube"
                style={inp}
                required
              />
            </Field>
            <Field label="Sub (optioneel)">
              <input
                value={sub}
                onChange={(e) => setSub(e.target.value)}
                placeholder="NL Tech kanaal"
                style={inp}
              />
            </Field>
            <AppearancePicker
              value={appearance}
              onChange={setAppearance}
              displayName={name || "B"}
              workspaceId={workspaceId}
            />
          </>
        )}

        {/* ── Step 2 ──────────────────────────────────────── */}
        {step === 2 && (
          <>
            <p style={hint}>
              Beschrijf het waarom + de regels. Agents lezen dit elke run
              zodat ze weten waar ze naartoe moeten werken.
            </p>
            <Field label="Beschrijving (wat is deze business?)">
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="Bijv. Faceless YouTube kanaal over NL tech. Doel: educatieve content + affiliate revenue."
                style={{ ...inp, resize: "vertical" }}
              />
            </Field>
            <Field label="Mission / agent rules of engagement">
              <textarea
                value={mission}
                onChange={(e) => setMission(e.target.value)}
                rows={4}
                placeholder={`Bijv.\n• Schrijf in NL u-vorm, geen jargon\n• Geen click-bait, focus op insights\n• Bij twijfel: HITL review`}
                style={{ ...inp, resize: "vertical" }}
              />
            </Field>
            <Field label="Eerste targets / KPIs (kunnen later worden aangepast)">
              <TargetsEditor value={targets} onChange={setTargets} />
            </Field>
          </>
        )}

        {/* ── Step 3 ──────────────────────────────────────── */}
        {step === 3 && (
          <>
            <p style={hint}>
              Zaai meteen wat <strong>topics</strong> in de rail (Content /
              Marketing / Sales / …). Je kunt later altijd subtopics binnen
              elk topic aanmaken via right-click of de + knop.
            </p>
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <input
                value={topicInput}
                onChange={(e) => setTopicInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addTopic();
                  }
                }}
                placeholder="Bijv. Content / Marketing / Sales"
                style={inp}
              />
              <button type="button" onClick={addTopic} style={btnSec}>
                + Toevoegen
              </button>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
              {topicNames.map((t) => (
                <span
                  key={t}
                  style={{
                    padding: "5px 10px",
                    borderRadius: 999,
                    fontSize: 12,
                    background: "var(--app-card-2)",
                    border: "1px solid var(--app-border)",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  {t}
                  <button
                    type="button"
                    onClick={() =>
                      setTopicNames(topicNames.filter((x) => x !== t))
                    }
                    style={{
                      border: "none",
                      background: "transparent",
                      color: "var(--rose)",
                      cursor: "pointer",
                      fontSize: 12,
                      padding: 0,
                    }}
                  >
                    ✕
                  </button>
                </span>
              ))}
            </div>
            <div style={{ fontSize: 11, color: "var(--app-fg-3)", marginBottom: 6 }}>
              Of pak een preset:
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {TOPIC_PRESETS.map((preset, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() =>
                    setTopicNames([
                      ...new Set([...topicNames, ...preset]),
                    ])
                  }
                  style={btnGhost}
                >
                  {preset.join(" · ")}
                </button>
              ))}
            </div>
          </>
        )}

        {/* ── Step 4 ──────────────────────────────────────── */}
        {step === 4 && (
          <>
            <p style={hint}>
              <strong>Isolatie</strong> bepaalt of deze business gebruikt
              wat in <em>Settings → API Keys / Telegram / Email</em> staat
              op workspace-niveau, of dat 'ie volledig op zichzelf draait.
            </p>
            <label
              style={{
                display: "flex",
                gap: 12,
                alignItems: "flex-start",
                padding: 14,
                border: `1.5px solid ${isolated ? "var(--app-border)" : "var(--tt-green)"}`,
                borderRadius: 10,
                background: isolated ? "transparent" : "rgba(57,178,85,0.06)",
                cursor: "pointer",
                marginBottom: 8,
              }}
            >
              <input
                type="radio"
                name="isolated"
                checked={!isolated}
                onChange={() => setIsolated(false)}
                style={{ marginTop: 4, accentColor: "var(--tt-green)" }}
              />
              <div>
                <div style={{ fontWeight: 700 }}>
                  Inherits — gebruik workspace defaults
                </div>
                <div style={{ fontSize: 11.5, color: "var(--app-fg-3)", marginTop: 2 }}>
                  Default. Als deze business geen eigen API key / Telegram
                  channel / SMTP creds heeft, valt 'ie terug op wat in
                  Settings staat.
                </div>
              </div>
            </label>
            <label
              style={{
                display: "flex",
                gap: 12,
                alignItems: "flex-start",
                padding: 14,
                border: `1.5px solid ${isolated ? "var(--rose)" : "var(--app-border)"}`,
                borderRadius: 10,
                background: isolated ? "rgba(230,82,107,0.06)" : "transparent",
                cursor: "pointer",
              }}
            >
              <input
                type="radio"
                name="isolated"
                checked={isolated}
                onChange={() => setIsolated(true)}
                style={{ marginTop: 4, accentColor: "var(--rose)" }}
              />
              <div>
                <div style={{ fontWeight: 700, color: "var(--rose)" }}>
                  🔒 Isolated — niets uit globals
                </div>
                <div style={{ fontSize: 11.5, color: "var(--app-fg-3)", marginTop: 2 }}>
                  Deze business gebruikt UITSLUITEND eigen credentials. Ze
                  krijgen GEEN workspace API keys, GEEN workspace Telegram
                  bot, GEEN workspace SMTP. Per ongeluk een client-account
                  een mail vanaf jouw TrompTech adres laten sturen?
                  Onmogelijk.
                </div>
              </div>
            </label>
          </>
        )}

        {/* ── Step 5 — Confirm ────────────────────────────── */}
        {step === 5 && (
          <>
            <p style={hint}>
              Klaar voor lancering. Check de samenvatting en klik
              <strong> Aanmaken</strong>.
            </p>
            <Summary label="Naam" value={name} />
            {sub && <Summary label="Sub" value={sub} />}
            {description && (
              <Summary label="Beschrijving" value={description} multi />
            )}
            {mission && (
              <Summary label="Mission" value={mission} multi />
            )}
            {targets.length > 0 && (
              <Summary
                label="Targets"
                value={targets.map((t) => `• ${t.name} → ${t.target}`).join("\n")}
                multi
              />
            )}
            {topicNames.length > 0 && (
              <Summary
                label={`Topics (${topicNames.length})`}
                value={topicNames.join(" · ")}
              />
            )}
            <Summary
              label="Isolatie"
              value={
                isolated
                  ? "🔒 Isolated — eigen credentials, geen fallback"
                  : "Inherits van workspace"
              }
            />
            {error && (
              <p
                role="alert"
                style={{
                  color: "var(--rose)",
                  background: "rgba(230,82,107,0.08)",
                  border: "1px solid rgba(230,82,107,0.4)",
                  borderRadius: 10,
                  padding: "8px 10px",
                  marginTop: 10,
                  fontSize: 12.5,
                }}
              >
                {error}
              </p>
            )}
          </>
        )}

        {/* ── Footer / nav ───────────────────────────────── */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginTop: 18,
            gap: 8,
          }}
        >
          <button
            type="button"
            onClick={() => setStep((s) => Math.max(1, s - 1))}
            disabled={step === 1 || creating}
            style={btnSec}
          >
            ← Terug
          </button>
          {step < 5 ? (
            <button
              type="button"
              onClick={() => setStep((s) => Math.min(5, s + 1))}
              disabled={!canNext}
              style={btnPrimary(false)}
            >
              Volgende →
            </button>
          ) : (
            <button
              type="button"
              onClick={submit}
              disabled={creating}
              style={btnPrimary(creating)}
            >
              {creating ? "Aanmaken…" : "✓ Aanmaken"}
            </button>
          )}
        </div>
      </div>
    </dialog>
  );
}

const inp: React.CSSProperties = {
  width: "100%",
  background: "var(--app-card-2)",
  border: "1.5px solid var(--app-border)",
  color: "var(--app-fg)",
  padding: "9px 11px",
  borderRadius: 9,
  fontFamily: "var(--type)",
  fontSize: 13.5,
};
const hint: React.CSSProperties = {
  color: "var(--app-fg-3)",
  fontSize: 12.5,
  margin: "0 0 14px",
  lineHeight: 1.5,
};
const btnSec: React.CSSProperties = {
  padding: "9px 14px",
  border: "1.5px solid var(--app-border)",
  background: "var(--app-card-2)",
  color: "var(--app-fg)",
  borderRadius: 10,
  fontWeight: 700,
  fontSize: 12.5,
  cursor: "pointer",
};
const btnGhost: React.CSSProperties = {
  padding: "7px 10px",
  border: "1px dashed var(--app-border)",
  background: "transparent",
  color: "var(--app-fg-2)",
  borderRadius: 8,
  fontSize: 11.5,
  cursor: "pointer",
  textAlign: "left",
};
const btnPrimary = (pending: boolean): React.CSSProperties => ({
  padding: "9px 16px",
  border: "1.5px solid var(--tt-green)",
  background: "var(--tt-green)",
  color: "#fff",
  borderRadius: 10,
  fontWeight: 700,
  fontSize: 12.5,
  cursor: pending ? "wait" : "pointer",
  opacity: pending ? 0.8 : 1,
});

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label
      style={{
        display: "block",
        marginBottom: 12,
        fontSize: 12,
        fontWeight: 600,
        color: "var(--app-fg-2)",
      }}
    >
      <span style={{ display: "block", marginBottom: 4 }}>{label}</span>
      {children}
    </label>
  );
}

function Summary({
  label,
  value,
  multi,
}: {
  label: string;
  value: string;
  multi?: boolean;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "120px 1fr",
        gap: 12,
        padding: "8px 0",
        borderTop: "1px solid var(--app-border-2)",
        fontSize: 13,
      }}
    >
      <div style={{ fontWeight: 700, color: "var(--app-fg-2)" }}>{label}</div>
      <div
        style={{
          color: "var(--app-fg)",
          whiteSpace: multi ? "pre-wrap" : "normal",
        }}
      >
        {value}
      </div>
    </div>
  );
}
