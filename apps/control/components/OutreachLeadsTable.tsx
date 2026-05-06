"use client";

// Tabel-render voor de outreach dashboard. Live realtime updates op
// outreach_leads zodat een nieuwe view direct binnenkomt zonder refresh.

import { useEffect, useState } from "react";

import { getSupabaseBrowserClient } from "../lib/supabase/client";

type Lead = {
  id: string;
  token: string | null;
  legacy_id: number | null;
  lead_name: string;
  lead_email: string | null;
  lead_website: string | null;
  lead_branche: string | null;
  lead_regio: string | null;
  status: string;
  score: number | null;
  view_count: number;
  last_viewed_at: string | null;
  responded_at: string | null;
  reply_subject: string | null;
  reply_body: string | null;
  reply_from: string | null;
  created_at: string;
};

const STATUS_LABEL: Record<string, string> = {
  new: "Nieuw",
  pitched: "Gepitcht",
  approved: "Goedgekeurd",
  sent: "Verzonden",
  freebie_ready: "Freebie klaar",
  pending_whatsapp: "WA wachtrij",
  responded: "Gereageerd",
  rejected: "Afgewezen",
  contactformulier_failed: "Form mislukt",
  handmatig: "Handmatig",
};
const STATUS_COLOR: Record<string, string> = {
  new: "#6a6c66",
  pitched: "#4171c4",
  approved: "#2ba0a0",
  sent: "#39b255",
  freebie_ready: "#39b255",
  pending_whatsapp: "#d4752a",
  responded: "#7c5cbf",
  rejected: "#c44d4d",
  contactformulier_failed: "#c44d4d",
  handmatig: "#8a8c84",
};

type Props = {
  leads: Lead[];
  reportOrigin: string;
};

export function OutreachLeadsTable({ leads: initial, reportOrigin }: Props) {
  const [leads, setLeads] = useState<Lead[]>(initial);
  const [openLeadId, setOpenLeadId] = useState<string | null>(null);

  useEffect(() => {
    setLeads(initial);
  }, [initial]);

  // Realtime subscription — when a new view or reply lands, refetch
  // the changed row so the badges update without a page refresh.
  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    const channel = supabase
      .channel("outreach-leads-live")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "aio_control",
          table: "outreach_leads",
        },
        (payload) => {
          const updated = payload.new as Lead;
          setLeads((prev) =>
            prev.map((l) => (l.id === updated.id ? { ...l, ...updated } : l)),
          );
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);

  if (leads.length === 0) {
    return (
      <div
        style={{
          background: "var(--app-card)",
          border: "1.5px solid var(--app-border)",
          borderRadius: 12,
          padding: "32px 22px",
          textAlign: "center",
          color: "var(--app-fg-3)",
        }}
      >
        Nog geen freebies verzonden. Zodra de outreach cron loopt
        verschijnen leads hier vanzelf.
      </div>
    );
  }

  return (
    <div
      style={{
        background: "var(--app-card)",
        border: "1.5px solid var(--app-border)",
        borderRadius: 12,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.6fr 1fr 110px 80px 100px 120px 80px",
          padding: "10px 16px",
          background: "var(--app-card-2)",
          borderBottom: "1.5px solid var(--app-border)",
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: ".06em",
          textTransform: "uppercase",
          color: "var(--app-fg-3)",
        }}
      >
        <div>Lead</div>
        <div>Branche / regio</div>
        <div>Status</div>
        <div style={{ textAlign: "center" }}>Score</div>
        <div style={{ textAlign: "center" }}>Opens</div>
        <div>Reactie</div>
        <div style={{ textAlign: "right" }}>Link</div>
      </div>

      {leads.map((lead) => (
        <div key={lead.id}>
          <div
            onClick={() =>
              setOpenLeadId(openLeadId === lead.id ? null : lead.id)
            }
            style={{
              display: "grid",
              gridTemplateColumns: "1.6fr 1fr 110px 80px 100px 120px 80px",
              padding: "12px 16px",
              borderBottom: "1px solid var(--app-border-2, #e0ddd5)",
              fontSize: 13,
              alignItems: "center",
              cursor: lead.responded_at ? "pointer" : "default",
              gap: 10,
            }}
          >
            <div>
              <div style={{ fontWeight: 600 }}>{lead.lead_name}</div>
              {lead.lead_website && (
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--app-fg-3)",
                    marginTop: 2,
                  }}
                >
                  {lead.lead_website.replace(/^https?:\/\/(www\.)?/, "")}
                </div>
              )}
            </div>
            <div style={{ fontSize: 12, color: "var(--app-fg-2)" }}>
              {[lead.lead_branche, lead.lead_regio].filter(Boolean).join(" · ") ||
                "—"}
            </div>
            <div>
              <StatusBadge status={lead.status} />
            </div>
            <div style={{ textAlign: "center" }}>
              {lead.score != null ? (
                <ScoreBadge score={lead.score} />
              ) : (
                <span style={{ color: "var(--app-fg-3)" }}>—</span>
              )}
            </div>
            <div style={{ textAlign: "center" }}>
              {lead.view_count > 0 ? (
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                    background: "rgba(57,178,85,0.10)",
                    border: "1px solid rgba(57,178,85,0.3)",
                    color: "#2a8642",
                    padding: "3px 9px",
                    borderRadius: 99,
                    fontSize: 11,
                    fontWeight: 600,
                  }}
                  title={
                    lead.last_viewed_at
                      ? `Laatst geopend: ${new Date(lead.last_viewed_at).toLocaleString("nl-NL")}`
                      : ""
                  }
                >
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: 99,
                      background: "#39b255",
                    }}
                  />
                  {lead.view_count}×
                </span>
              ) : (
                <span style={{ color: "var(--app-fg-3)", fontSize: 11 }}>
                  niet geopend
                </span>
              )}
            </div>
            <div>
              {lead.responded_at ? (
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                    background: "rgba(124,92,191,0.10)",
                    border: "1px solid rgba(124,92,191,0.3)",
                    color: "#5c3fa3",
                    padding: "3px 9px",
                    borderRadius: 99,
                    fontSize: 11,
                    fontWeight: 600,
                  }}
                >
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: 99,
                      background: "#7c5cbf",
                    }}
                  />
                  {timeAgo(lead.responded_at)}
                </span>
              ) : (
                <span style={{ color: "var(--app-fg-3)", fontSize: 11 }}>
                  geen reactie
                </span>
              )}
            </div>
            <div style={{ textAlign: "right" }}>
              {lead.token ? (
                <a
                  href={`${reportOrigin}/r/${lead.token}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    fontSize: 11,
                    color: "var(--tt-green, #39b255)",
                    fontWeight: 600,
                    textDecoration: "none",
                  }}
                >
                  openen ↗
                </a>
              ) : (
                <span style={{ fontSize: 11, color: "var(--app-fg-3)" }}>—</span>
              )}
            </div>
          </div>
          {openLeadId === lead.id && lead.responded_at && (
            <div
              style={{
                padding: "12px 18px 16px",
                background: "rgba(124,92,191,0.04)",
                borderBottom: "1px solid var(--app-border-2, #e0ddd5)",
                fontSize: 12,
                color: "var(--app-fg-2)",
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: ".06em",
                  textTransform: "uppercase",
                  color: "#5c3fa3",
                  marginBottom: 6,
                }}
              >
                Reactie van {lead.reply_from ?? lead.lead_email ?? "?"}
              </div>
              {lead.reply_subject && (
                <div style={{ fontWeight: 600, marginBottom: 4 }}>
                  {lead.reply_subject}
                </div>
              )}
              <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.6 }}>
                {lead.reply_body ?? "(geen body)"}
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const c = STATUS_COLOR[status] ?? "#8a8c84";
  const label = STATUS_LABEL[status] ?? status;
  return (
    <span
      style={{
        display: "inline-block",
        background: c,
        color: "#fff",
        padding: "2px 8px",
        borderRadius: 99,
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: ".02em",
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
}

function ScoreBadge({ score }: { score: number }) {
  const color =
    score >= 75 ? "#39b255" : score >= 50 ? "#d4752a" : "#c44d4d";
  return (
    <span
      style={{
        display: "inline-block",
        background: "rgba(0,0,0,0.04)",
        border: `1px solid ${color}`,
        color,
        padding: "2px 9px",
        borderRadius: 6,
        fontSize: 11,
        fontWeight: 700,
        fontVariantNumeric: "tabular-nums",
      }}
    >
      {score}
    </span>
  );
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60_000);
  if (m < 1) return "net nu";
  if (m < 60) return `${m}m geleden`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}u geleden`;
  const d = Math.floor(h / 24);
  return `${d}d geleden`;
}
