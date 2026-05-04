// Tiered API key manager — workspace defaults + per-business overrides
// + per-nav-node overrides. Lives inside the Settings page; reads
// existing keys from /api/api-keys (or via server-rendered prop) and
// edits via setApiKey / deleteApiKey server actions.
//
// Resolution order at call time (most specific wins):
//   navnode (and ancestors) → business → workspace → env-var fallback
//
// We never display the key itself — only "set" / "not set" + a label.

"use client";

import { useState, useTransition } from "react";

import { deleteApiKey, setApiKey } from "../app/actions/api-keys";
import {
  CUSTOM_KEY_NAME_RE,
  type ApiKeyKind,
  type ApiKeyMetadata,
  type ApiKeyScope,
} from "../lib/api-keys/consts";
import type { BusinessRow } from "../lib/queries/businesses";
import type { NavNode } from "../lib/queries/nav-nodes";
import { translate } from "../lib/i18n/dict";
import { useLocale } from "../lib/i18n/client";

const PROVIDERS = [
  { id: "anthropic", label: "Anthropic / Claude" },
  { id: "minimax", label: "MiniMax (Coder Plan)" },
  { id: "openrouter", label: "OpenRouter" },
  { id: "openai", label: "OpenAI" },
  // ElevenLabs is wired into the TalkModule (TTS playback) — without
  // this entry there's no UI path to set the key, which is why the
  // Talk Settings page's "Beheer →" link landed nowhere useful.
  { id: "elevenlabs", label: "ElevenLabs (TTS)" },
  { id: "telegram", label: "Telegram bot token" },
  { id: "custom_webhook", label: "Custom webhook secret" },
  // SMTP creds zijn een speciale set; meestal config je ze via de
  // Email Settings panel maar je kunt 'm hier handmatig overschrijven.
  { id: "smtp_host", label: "SMTP host (auto via Email panel)" },
  { id: "smtp_user", label: "SMTP user" },
  { id: "smtp_pass", label: "SMTP password" },
];

type Props = {
  workspaceSlug: string;
  workspaceId: string;
  initialKeys: ApiKeyMetadata[];
  businesses: BusinessRow[];
  navNodes: NavNode[];
};

export function ApiKeysPanel({
  workspaceSlug,
  workspaceId,
  initialKeys,
  businesses,
  navNodes,
}: Props) {
  const locale = useLocale();
  const t = (key: string, vars?: Record<string, string | number>) =>
    translate(locale, key, vars);
  const [keys, setKeys] = useState<ApiKeyMetadata[]>(initialKeys);
  const [adding, setAdding] = useState(false);
  const [scope, setScope] = useState<ApiKeyScope>("workspace");
  const [scopeId, setScopeId] = useState(workspaceId);
  // The provider <select> uses "__custom__" as a sentinel — selecting
  // it reveals a free-text input where the operator types the secret
  // name (AIRTABLE_API_KEY etc.). The actual value sent to the server
  // is `customName`; `kind` becomes "custom" instead of "provider".
  const [provider, setProvider] = useState<string>("anthropic");
  const [customName, setCustomName] = useState("");
  const isCustom = provider === "__custom__";
  const [value, setValue] = useState("");
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = () => {
    setError(null);
    const kind: ApiKeyKind = isCustom ? "custom" : "provider";
    const effectiveProvider = isCustom ? customName.trim() : provider;
    if (isCustom && !CUSTOM_KEY_NAME_RE.test(effectiveProvider)) {
      setError(
        "Custom secret-naam mag alleen UPPERCASE letters, cijfers en underscore bevatten en moet met een letter beginnen (bv. AIRTABLE_API_KEY).",
      );
      return;
    }
    startTransition(async () => {
      const res = await setApiKey({
        workspace_slug: workspaceSlug,
        workspace_id: workspaceId,
        scope,
        scope_id:
          scope === "workspace"
            ? workspaceId
            : scopeId,
        provider: effectiveProvider,
        value,
        label: label || undefined,
        kind,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      // Optimistically add to the list. The next page-load will refresh
      // from the server-rendered metadata anyway.
      setKeys((prev) => [
        ...prev.filter(
          (k) =>
            !(
              k.workspace_id === workspaceId &&
              k.scope === scope &&
              k.scope_id === (scope === "workspace" ? workspaceId : scopeId) &&
              k.provider === effectiveProvider
            ),
        ),
        {
          id: res.data.id,
          workspace_id: workspaceId,
          scope,
          scope_id: scope === "workspace" ? workspaceId : scopeId,
          provider: effectiveProvider,
          label: label || null,
          has_value: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          kind,
        },
      ]);
      setAdding(false);
      setValue("");
      setLabel("");
      setCustomName("");
    });
  };

  const remove = (id: string) =>
    startTransition(async () => {
      const res = await deleteApiKey({ workspace_slug: workspaceSlug, id });
      if (res.ok) setKeys((prev) => prev.filter((k) => k.id !== id));
    });

  const labelFor = (k: ApiKeyMetadata) => {
    if (k.scope === "workspace") return t("keys.scope.workspace");
    if (k.scope === "business") {
      const b = businesses.find((bb) => bb.id === k.scope_id);
      return t("keys.scope.business", {
        name: b?.name ?? t("keys.scope.businessDeleted"),
      });
    }
    const n = navNodes.find((nn) => nn.id === k.scope_id);
    return t("keys.scope.topic", {
      name: n?.name ?? t("keys.scope.businessDeleted"),
    });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <p
        style={{
          fontSize: 12.5,
          color: "var(--app-fg-3)",
          margin: 0,
          lineHeight: 1.5,
        }}
      >
        {t("keys.intro")}
      </p>

      {keys.length === 0 ? (
        <p
          style={{
            fontSize: 12.5,
            color: "var(--app-fg-3)",
            padding: 16,
            border: "1px dashed var(--app-border)",
            borderRadius: 10,
            margin: 0,
          }}
        >
          {t("keys.empty")}
        </p>
      ) : (
        <KeyList
          keys={keys}
          t={t}
          labelFor={labelFor}
          onRemove={remove}
          pending={pending}
        />
      )}

      {!adding && (
        <button
          onClick={() => setAdding(true)}
          style={{
            padding: "9px 14px",
            border: "1.5px dashed var(--app-border)",
            background: "transparent",
            color: "var(--app-fg-2)",
            borderRadius: 10,
            fontWeight: 700,
            fontSize: 12.5,
            cursor: "pointer",
            alignSelf: "flex-start",
          }}
        >
          {t("keys.add")}
        </button>
      )}

      {adding && (
        <div
          style={{
            border: "1.5px solid var(--app-border)",
            background: "var(--app-card-2)",
            borderRadius: 12,
            padding: 14,
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Field label={t("keys.field.provider")}>
              <select
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
                style={inp}
              >
                {PROVIDERS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
                <option disabled>──────────</option>
                <option value="__custom__">
                  {t("keys.field.customSecret")}
                </option>
              </select>
            </Field>
            <Field label={t("keys.field.scope")}>
              <select
                value={scope}
                onChange={(e) => {
                  const s = e.target.value as ApiKeyScope;
                  setScope(s);
                  if (s === "workspace") setScopeId(workspaceId);
                  else if (s === "business")
                    setScopeId(businesses[0]?.id ?? "");
                  else setScopeId(navNodes[0]?.id ?? "");
                }}
                style={inp}
              >
                <option value="workspace">{t("keys.scope.workspace")}</option>
                <option value="business" disabled={businesses.length === 0}>
                  {t("keys.scope.businessOverride")}{" "}
                  {businesses.length === 0 ? t("keys.scope.none") : ""}
                </option>
                <option value="navnode" disabled={navNodes.length === 0}>
                  {t("keys.scope.topicOverride")}{" "}
                  {navNodes.length === 0 ? t("keys.scope.none") : ""}
                </option>
              </select>
            </Field>
          </div>

          {isCustom && (
            <Field label={t("keys.field.customName")}>
              <input
                value={customName}
                onChange={(e) =>
                  setCustomName(
                    e.target.value
                      .toUpperCase()
                      .replace(/[^A-Z0-9_]/g, "_"),
                  )
                }
                placeholder="AIRTABLE_API_KEY"
                style={{ ...inp, fontFamily: "ui-monospace, Menlo, monospace" }}
                autoComplete="off"
              />
              <p
                style={{
                  fontSize: 11,
                  color: "var(--app-fg-3)",
                  margin: "4px 0 0",
                }}
              >
                {t("keys.field.customName.hint")}
              </p>
            </Field>
          )}

          {scope === "business" && (
            <Field label={t("keys.field.business")}>
              <select
                value={scopeId}
                onChange={(e) => setScopeId(e.target.value)}
                style={inp}
              >
                {businesses.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </Field>
          )}

          {scope === "navnode" && (
            <Field label={t("keys.field.topic")}>
              <select
                value={scopeId}
                onChange={(e) => setScopeId(e.target.value)}
                style={inp}
              >
                {navNodes.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.name}
                  </option>
                ))}
              </select>
            </Field>
          )}

          <Field label={t("keys.field.value")}>
            <input
              type="password"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="sk-…"
              autoComplete="off"
              style={inp}
            />
          </Field>

          <Field label={t("keys.field.label")}>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Anthropic prod"
              style={inp}
            />
          </Field>

          {error && (
            <p style={{ color: "var(--rose)", fontSize: 12, margin: 0 }}>
              {error}
            </p>
          )}

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button
              onClick={() => setAdding(false)}
              style={btnSecondary}
              disabled={pending}
            >
              {t("common.cancel")}
            </button>
            <button
              onClick={submit}
              disabled={pending || !value.trim()}
              style={btnPrimary(pending)}
            >
              {pending ? t("common.busy") : t("common.save")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const inp: React.CSSProperties = {
  width: "100%",
  background: "var(--app-card)",
  border: "1.5px solid var(--app-border)",
  color: "var(--app-fg)",
  padding: "8px 10px",
  borderRadius: 8,
  fontFamily: "var(--type)",
  fontSize: 13,
};

const btnSecondary: React.CSSProperties = {
  padding: "8px 14px",
  border: "1.5px solid var(--app-border)",
  background: "transparent",
  color: "var(--app-fg)",
  borderRadius: 10,
  fontWeight: 700,
  fontSize: 12.5,
  cursor: "pointer",
};

const btnPrimary = (pending: boolean): React.CSSProperties => ({
  padding: "8px 14px",
  border: "1.5px solid var(--tt-green)",
  background: "var(--tt-green)",
  color: "#fff",
  borderRadius: 10,
  fontWeight: 700,
  fontSize: 12.5,
  cursor: pending ? "wait" : "pointer",
  opacity: pending ? 0.7 : 1,
});

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label style={{ display: "block", fontSize: 11, fontWeight: 600 }}>
      <span
        style={{
          display: "block",
          marginBottom: 4,
          color: "var(--app-fg-2)",
        }}
      >
        {label}
      </span>
      {children}
    </label>
  );
}

/** Renders the api_keys list grouped by kind — provider keys first
 *  (canonical providers like anthropic/openai), then a separate
 *  "Custom secrets" section for user-defined secrets read by agent
 *  tools / modules / integrations. */
function KeyList({
  keys,
  t,
  labelFor,
  onRemove,
  pending,
}: {
  keys: ApiKeyMetadata[];
  t: (k: string, vars?: Record<string, string | number>) => string;
  labelFor: (k: ApiKeyMetadata) => string;
  onRemove: (id: string) => void;
  pending: boolean;
}) {
  // 'kind' was added in migration 041; rows from before default to
  // 'provider' on the DB side, but be defensive for any edge case.
  const providerKeys = keys.filter((k) => (k.kind ?? "provider") === "provider");
  const customKeys = keys.filter((k) => k.kind === "custom");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {providerKeys.length > 0 && (
        <KeyGroup
          title={t("keys.group.providers")}
          rows={providerKeys}
          t={t}
          labelFor={labelFor}
          onRemove={onRemove}
          pending={pending}
        />
      )}
      {customKeys.length > 0 && (
        <KeyGroup
          title={t("keys.group.custom")}
          rows={customKeys}
          t={t}
          labelFor={labelFor}
          onRemove={onRemove}
          pending={pending}
        />
      )}
    </div>
  );
}

function KeyGroup({
  title,
  rows,
  t,
  labelFor,
  onRemove,
  pending,
}: {
  title: string;
  rows: ApiKeyMetadata[];
  t: (k: string, vars?: Record<string, string | number>) => string;
  labelFor: (k: ApiKeyMetadata) => string;
  onRemove: (id: string) => void;
  pending: boolean;
}) {
  return (
    <div>
      <div
        style={{
          fontSize: 10.5,
          fontWeight: 700,
          letterSpacing: 0.5,
          textTransform: "uppercase",
          color: "var(--app-fg-3)",
          margin: "0 4px 6px",
        }}
      >
        {title}
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 6,
          border: "1px solid var(--app-border)",
          borderRadius: 10,
          overflow: "hidden",
        }}
      >
        {rows.map((k) => (
          <div
            key={k.id}
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 80px 80px",
              gap: 8,
              alignItems: "center",
              padding: "10px 12px",
              borderBottom: "1px solid var(--app-border-2)",
              background: "var(--app-card-2)",
            }}
          >
            <div>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  fontFamily:
                    k.kind === "custom"
                      ? "ui-monospace, Menlo, monospace"
                      : undefined,
                }}
              >
                {PROVIDERS.find((p) => p.id === k.provider)?.label ??
                  k.provider}
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: "var(--app-fg-3)",
                  marginTop: 2,
                }}
              >
                {k.label ?? "—"}
              </div>
            </div>
            <div style={{ fontSize: 12, color: "var(--app-fg-2)" }}>
              {labelFor(k)}
            </div>
            <span
              style={{
                fontSize: 10.5,
                fontWeight: 700,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: k.has_value ? "var(--tt-green)" : "var(--rose)",
              }}
            >
              {k.has_value ? t("keys.row.set") : t("keys.row.empty")}
            </span>
            <button
              onClick={() => onRemove(k.id)}
              disabled={pending}
              style={{
                padding: "5px 8px",
                border: "1px solid var(--app-border)",
                background: "transparent",
                color: "var(--rose)",
                borderRadius: 6,
                fontSize: 11,
                cursor: "pointer",
              }}
            >
              {t("keys.row.delete")}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
