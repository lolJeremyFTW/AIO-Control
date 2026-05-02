// Generic outbound HTTP integration manager. Workspace/business/topic
// scopes mirror the API key + Telegram pattern. Each row is a URL +
// method + headers (json) + body template (mustache placeholders).

"use client";

import { useState, useTransition } from "react";

import {
  createCustomIntegration,
  deleteCustomIntegration,
  testCustomIntegration,
} from "../app/actions/custom-integrations";
import type { BusinessRow } from "../lib/queries/businesses";
import type { NavNode } from "../lib/queries/nav-nodes";

export type CustomIntegrationRow = {
  id: string;
  scope: "workspace" | "business" | "navnode";
  scope_id: string;
  name: string;
  url: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  headers: Record<string, string>;
  body_template: string | null;
  on_run_done: boolean;
  on_run_fail: boolean;
  on_queue_review: boolean;
  enabled: boolean;
};

type Props = {
  workspaceSlug: string;
  workspaceId: string;
  initialItems: CustomIntegrationRow[];
  businesses: BusinessRow[];
  navNodes: NavNode[];
};

export function CustomIntegrationsPanel({
  workspaceSlug,
  workspaceId,
  initialItems,
  businesses,
  navNodes,
}: Props) {
  const [items, setItems] = useState(initialItems);
  const [adding, setAdding] = useState(false);
  const [scope, setScope] = useState<"workspace" | "business" | "navnode">(
    "workspace",
  );
  const [scopeId, setScopeId] = useState(workspaceId);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [method, setMethod] = useState<
    "GET" | "POST" | "PUT" | "PATCH" | "DELETE"
  >("POST");
  const [headersText, setHeadersText] = useState(
    `{\n  "Authorization": "Bearer YOUR_TOKEN"\n}`,
  );
  const [bodyTemplate, setBodyTemplate] = useState(
    `{\n  "agent": "{{run.agent}}",\n  "status": "{{run.status}}",\n  "output": "{{run.output}}",\n  "cost_cents": {{run.cost_cents}}\n}`,
  );
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = () => {
    setError(null);
    setInfo(null);

    let parsedHeaders: Record<string, string> = {};
    try {
      parsedHeaders = headersText.trim()
        ? (JSON.parse(headersText) as Record<string, string>)
        : {};
    } catch {
      setError("Headers moeten geldige JSON zijn.");
      return;
    }

    startTransition(async () => {
      const res = await createCustomIntegration({
        workspace_slug: workspaceSlug,
        workspace_id: workspaceId,
        scope,
        scope_id: scope === "workspace" ? workspaceId : scopeId,
        name,
        url,
        method,
        headers: parsedHeaders,
        body_template: bodyTemplate || null,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setItems((prev) => [
        ...prev,
        {
          id: res.data.id,
          scope,
          scope_id: scope === "workspace" ? workspaceId : scopeId,
          name,
          url,
          method,
          headers: parsedHeaders,
          body_template: bodyTemplate || null,
          on_run_done: true,
          on_run_fail: true,
          on_queue_review: false,
          enabled: true,
        },
      ]);
      setAdding(false);
      setName("");
      setUrl("");
    });
  };

  const remove = (id: string) =>
    startTransition(async () => {
      const res = await deleteCustomIntegration({
        workspace_slug: workspaceSlug,
        id,
      });
      if (res.ok) setItems((prev) => prev.filter((i) => i.id !== id));
    });

  const test = (id: string) =>
    startTransition(async () => {
      setInfo(null);
      setError(null);
      const res = await testCustomIntegration({ id });
      if (res.ok) setInfo(`Endpoint bereikt (HTTP ${res.data.status}).`);
      else setError(res.error);
    });

  const labelFor = (i: CustomIntegrationRow) => {
    if (i.scope === "workspace") return "Workspace";
    if (i.scope === "business")
      return `Business · ${businesses.find((b) => b.id === i.scope_id)?.name ?? "(verwijderd)"}`;
    return `Topic · ${navNodes.find((n) => n.id === i.scope_id)?.name ?? "(verwijderd)"}`;
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
        Definieer outbound HTTP webhooks. Body template ondersteunt
        mustache placeholders zoals <code>{`{{run.agent}}`}</code>,{" "}
        <code>{`{{run.status}}`}</code>, <code>{`{{run.output}}`}</code>,{" "}
        <code>{`{{run.cost_cents}}`}</code>.
      </p>

      {items.length === 0 ? (
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
          Geen integrations nog. Klik &quot;+ Integration toevoegen&quot;.
        </p>
      ) : (
        <div
          style={{
            border: "1px solid var(--app-border)",
            borderRadius: 10,
            overflow: "hidden",
          }}
        >
          {items.map((i) => (
            <div
              key={i.id}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 80px 80px 80px",
                gap: 8,
                alignItems: "center",
                padding: "10px 12px",
                borderBottom: "1px solid var(--app-border-2)",
                background: "var(--app-card-2)",
              }}
            >
              <div>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{i.name}</div>
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--app-fg-3)",
                    marginTop: 2,
                  }}
                >
                  {i.method} · {i.url}
                </div>
              </div>
              <div style={{ fontSize: 12, color: "var(--app-fg-2)" }}>
                {labelFor(i)}
              </div>
              <span
                style={{
                  fontSize: 10.5,
                  fontWeight: 700,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color: i.enabled ? "var(--tt-green)" : "var(--rose)",
                }}
              >
                {i.enabled ? "aan" : "uit"}
              </span>
              <button onClick={() => test(i.id)} disabled={pending} style={btnTertiary}>
                Test
              </button>
              <button onClick={() => remove(i.id)} disabled={pending} style={btnDanger}>
                Verwijder
              </button>
            </div>
          ))}
        </div>
      )}

      {info && (
        <p style={{ color: "var(--tt-green)", fontSize: 12, margin: 0 }}>
          {info}
        </p>
      )}
      {error && (
        <p style={{ color: "var(--rose)", fontSize: 12, margin: 0 }}>
          {error}
        </p>
      )}

      {!adding && (
        <button onClick={() => setAdding(true)} style={btnAdd}>
          + Integration toevoegen
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
            <Field label="Naam">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="bv. Slack ops"
                style={inp}
              />
            </Field>
            <Field label="Scope">
              <select
                value={scope}
                onChange={(e) => {
                  const s = e.target.value as typeof scope;
                  setScope(s);
                  setScopeId(
                    s === "workspace"
                      ? workspaceId
                      : s === "business"
                        ? businesses[0]?.id ?? ""
                        : navNodes[0]?.id ?? "",
                  );
                }}
                style={inp}
              >
                <option value="workspace">Workspace default</option>
                <option value="business" disabled={businesses.length === 0}>
                  Business
                </option>
                <option value="navnode" disabled={navNodes.length === 0}>
                  Topic
                </option>
              </select>
            </Field>
          </div>

          {scope === "business" && (
            <Field label="Business">
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
            <Field label="Topic">
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

          <div style={{ display: "grid", gridTemplateColumns: "100px 1fr", gap: 10 }}>
            <Field label="Method">
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value as typeof method)}
                style={inp}
              >
                <option>POST</option>
                <option>GET</option>
                <option>PUT</option>
                <option>PATCH</option>
                <option>DELETE</option>
              </select>
            </Field>
            <Field label="URL">
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://hooks.slack.com/services/..."
                style={inp}
              />
            </Field>
          </div>

          <Field label="Headers (JSON)">
            <textarea
              value={headersText}
              onChange={(e) => setHeadersText(e.target.value)}
              rows={4}
              style={{ ...inp, fontFamily: "monospace", fontSize: 12 }}
            />
          </Field>

          <Field label="Body template (mustache placeholders)">
            <textarea
              value={bodyTemplate}
              onChange={(e) => setBodyTemplate(e.target.value)}
              rows={6}
              style={{ ...inp, fontFamily: "monospace", fontSize: 12 }}
            />
          </Field>

          <div
            style={{
              display: "flex",
              gap: 8,
              justifyContent: "flex-end",
              marginTop: 4,
            }}
          >
            <button onClick={() => setAdding(false)} style={btnSecondary} disabled={pending}>
              Annuleer
            </button>
            <button
              onClick={submit}
              disabled={pending || !name.trim() || !url.trim()}
              style={btnPrimary(pending)}
            >
              {pending ? "Bezig…" : "Opslaan"}
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
const btnAdd: React.CSSProperties = {
  padding: "9px 14px",
  border: "1.5px dashed var(--app-border)",
  background: "transparent",
  color: "var(--app-fg-2)",
  borderRadius: 10,
  fontWeight: 700,
  fontSize: 12.5,
  cursor: "pointer",
  alignSelf: "flex-start",
};
const btnTertiary: React.CSSProperties = {
  padding: "5px 8px",
  border: "1px solid var(--app-border)",
  background: "transparent",
  color: "var(--app-fg-2)",
  borderRadius: 6,
  fontSize: 11,
  cursor: "pointer",
};
const btnDanger: React.CSSProperties = {
  padding: "5px 8px",
  border: "1px solid var(--app-border)",
  background: "transparent",
  color: "var(--rose)",
  borderRadius: 6,
  fontSize: 11,
  cursor: "pointer",
};

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
