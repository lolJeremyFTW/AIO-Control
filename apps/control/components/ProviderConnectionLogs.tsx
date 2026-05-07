import type { ProviderConnectionLog } from "../lib/provider-connection-logs";

type Props = {
  logs: ProviderConnectionLog[];
  providerLabel: string;
  emptyText?: string;
};

export function ProviderConnectionLogs({
  logs,
  providerLabel,
  emptyText,
}: Props) {
  return (
    <div
      style={{
        borderTop: "1px solid var(--app-border-2)",
        paddingTop: 12,
        display: "grid",
        gap: 10,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          alignItems: "center",
        }}
      >
        <strong style={{ fontSize: 12.5, color: "var(--app-fg-2)" }}>
          {providerLabel} logboek
        </strong>
        {logs.length > 0 && (
          <span style={{ fontSize: 11, color: "var(--app-fg-3)" }}>
            laatste {logs.length}
          </span>
        )}
      </div>

      {logs.length === 0 ? (
        <p
          style={{
            margin: 0,
            fontSize: 12,
            color: "var(--app-fg-3)",
            fontStyle: "italic",
          }}
        >
          {emptyText ?? "Nog geen tests of wijzigingen gelogd."}
        </p>
      ) : (
        <div
          style={{
            border: "1px solid var(--app-border-2)",
            borderRadius: 10,
            overflow: "hidden",
          }}
        >
          {logs.map((log, index) => (
            <div
              key={log.id}
              style={{
                display: "grid",
                gap: 4,
                padding: "9px 11px",
                borderTop:
                  index === 0 ? undefined : "1px solid var(--app-border-2)",
                background:
                  log.status === "error"
                    ? "rgba(230,82,107,0.05)"
                    : "transparent",
              }}
            >
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  alignItems: "center",
                  flexWrap: "wrap",
                }}
              >
                <span
                  style={{
                    ...statusPillStyle(log.status),
                    fontSize: 10.5,
                    fontWeight: 800,
                    borderRadius: 999,
                    padding: "2px 7px",
                    textTransform: "uppercase",
                  }}
                >
                  {statusLabel(log.status)}
                </span>
                <span style={{ fontSize: 12.5, fontWeight: 700 }}>
                  {eventLabel(log.event_type)}
                </span>
                <span style={{ fontSize: 11, color: "var(--app-fg-3)" }}>
                  {formatDate(log.created_at)}
                </span>
                {typeof log.latency_ms === "number" && (
                  <span style={{ fontSize: 11, color: "var(--app-fg-3)" }}>
                    {log.latency_ms}ms
                  </span>
                )}
              </div>

              {log.message && (
                <p
                  style={{
                    margin: 0,
                    fontSize: 12,
                    color:
                      log.status === "error"
                        ? "var(--rose)"
                        : "var(--app-fg-3)",
                    lineHeight: 1.45,
                  }}
                >
                  {log.message}
                </p>
              )}

              {metadataItems(log).length > 0 && (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {metadataItems(log).map(([key, value]) => (
                    <code
                      key={key}
                      style={{
                        fontSize: 10.5,
                        color: "var(--app-fg-3)",
                        background: "var(--app-card-2)",
                        border: "1px solid var(--app-border-2)",
                        borderRadius: 6,
                        padding: "2px 5px",
                      }}
                    >
                      {key}: {String(value)}
                    </code>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function statusLabel(status: ProviderConnectionLog["status"]) {
  if (status === "success") return "ok";
  if (status === "error") return "fout";
  return "info";
}

function eventLabel(eventType: string) {
  switch (eventType) {
    case "scan":
      return "Modelscan";
    case "save":
      return "Opgeslagen";
    case "test":
      return "Connectietest";
    default:
      return eventType;
  }
}

function statusPillStyle(status: ProviderConnectionLog["status"]) {
  if (status === "success") {
    return {
      color: "var(--tt-green)",
      background: "rgba(57,178,85,0.12)",
      border: "1px solid rgba(57,178,85,0.45)",
    };
  }
  if (status === "error") {
    return {
      color: "var(--rose)",
      background: "rgba(230,82,107,0.1)",
      border: "1px solid rgba(230,82,107,0.35)",
    };
  }
  return {
    color: "var(--app-fg-3)",
    background: "var(--app-card-2)",
    border: "1px solid var(--app-border-2)",
  };
}

function metadataItems(log: ProviderConnectionLog) {
  const priority = [
    "endpoint",
    "host_set",
    "port",
    "model_count",
    "status_code",
    "api_url",
    "test_url",
  ];
  const items = Object.entries(log.metadata).filter(([, value]) =>
    ["string", "number", "boolean"].includes(typeof value),
  );
  return items
    .sort(([a], [b]) => {
      const ai = priority.indexOf(a);
      const bi = priority.indexOf(b);
      if (ai === -1 && bi === -1) return a.localeCompare(b);
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    })
    .slice(0, 4);
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("nl-NL", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
