// Outreach dashboard for one business — full lead pipeline view, not
// just freebies. Source of truth = aio_control.outreach_leads (after
// migration 051 + import 2026-05-06).
//
// Status tabs: alle / new / pitched / approved / sent / freebie_ready /
//              pending_whatsapp / responded / rejected
// Each lead row shows: name, branche/regio, status, score, opens, reply.

import { notFound, redirect } from "next/navigation";

import {
  getCurrentUser,
  getWorkspaceBySlug,
} from "../../../../../lib/auth/workspace";
import { listBusinesses } from "../../../../../lib/queries/businesses";
import { OutreachLeadsTable } from "../../../../../components/OutreachLeadsTable";
import { getServiceRoleSupabase } from "../../../../../lib/supabase/service";

type Props = {
  params: Promise<{ workspace_slug: string; bizId: string }>;
  searchParams: Promise<{ status?: string }>;
};

export const dynamic = "force-dynamic";

export default async function OutreachPage({ params, searchParams }: Props) {
  const { workspace_slug, bizId } = await params;
  const { status: filterStatus } = await searchParams;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const workspace = await getWorkspaceBySlug(workspace_slug);
  if (!workspace) notFound();

  const businesses = await listBusinesses(workspace.id);
  const biz = businesses.find((b) => b.id === bizId);
  if (!biz) notFound();

  const supabase = getServiceRoleSupabase();

  // Per-status counts in one round-trip via parallel queries.
  const STATUSES = [
    "new", "pitched", "approved", "sent", "freebie_ready",
    "pending_whatsapp", "responded", "rejected", "contactformulier_failed",
    "handmatig",
  ] as const;
  const counts: Record<string, number> = {};
  await Promise.all(
    STATUSES.map(async (s) => {
      const { count } = await supabase
        .from("outreach_leads")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", workspace.id)
        .eq("business_id", bizId)
        .eq("status", s);
      counts[s] = count ?? 0;
    }),
  );
  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  // Open + reply stats (independent of status — opened could be in any state)
  const { count: openedCount } = await supabase
    .from("outreach_leads")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspace.id)
    .eq("business_id", bizId)
    .gt("view_count", 0);
  const { count: repliedCount } = await supabase
    .from("outreach_leads")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspace.id)
    .eq("business_id", bizId)
    .not("responded_at", "is", null);

  // Active filter (default: freebie_ready, since that's the most useful
  // tab for tracking which leads the prospect actually saw).
  const activeStatus = filterStatus && STATUSES.includes(filterStatus as typeof STATUSES[number])
    ? filterStatus
    : null;

  let leadsQuery = supabase
    .from("outreach_leads")
    .select(
      "id, token, legacy_id, lead_name, lead_email, lead_website, lead_branche, lead_regio, status, score, view_count, last_viewed_at, responded_at, reply_subject, reply_body, reply_from, created_at",
    )
    .eq("workspace_id", workspace.id)
    .eq("business_id", bizId)
    .order("created_at", { ascending: false })
    .limit(500);
  if (activeStatus) {
    leadsQuery = leadsQuery.eq("status", activeStatus);
  }
  const { data: leads } = await leadsQuery;

  const origin =
    process.env.NEXT_PUBLIC_TRIGGER_ORIGIN ?? "https://aio.tromptech.life";

  const baseHref = `/${workspace.slug}/business/${bizId}/outreach`;

  return (
    <div className="content">
      <div className="page-title-row">
        <h1>Outreach &mdash; {biz.name}</h1>
        <span className="sub">
          {total} leads in pipeline. {openedCount ?? 0} freebies geopend, {repliedCount ?? 0} reacties.
        </span>
      </div>

      {/* Top stats */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 12,
          marginBottom: 18,
        }}
      >
        <SummaryCard label="Totaal" value={total} />
        <SummaryCard
          label="Freebies geopend"
          value={openedCount ?? 0}
          accent="#39b255"
          sub={
            counts.freebie_ready
              ? `${Math.round(((openedCount ?? 0) / counts.freebie_ready) * 100)}% open rate`
              : undefined
          }
        />
        <SummaryCard
          label="Reacties"
          value={repliedCount ?? 0}
          accent="#7c5cbf"
          sub={
            (openedCount ?? 0)
              ? `${Math.round(((repliedCount ?? 0) / (openedCount ?? 1)) * 100)}% reply rate`
              : undefined
          }
        />
        <SummaryCard label="Sent / WA klaar" value={(counts.sent ?? 0) + (counts.pending_whatsapp ?? 0)} />
      </div>

      {/* Status filter tabs */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 6,
          marginBottom: 14,
          padding: "10px 12px",
          background: "var(--app-card)",
          border: "1.5px solid var(--app-border)",
          borderRadius: 10,
        }}
      >
        <FilterChip href={baseHref} active={!activeStatus}>
          Alle ({total})
        </FilterChip>
        {STATUSES.filter((s) => counts[s] > 0).map((s) => (
          <FilterChip
            key={s}
            href={`${baseHref}?status=${s}`}
            active={activeStatus === s}
            color={STATUS_COLORS[s]}
          >
            {STATUS_LABELS[s]} ({counts[s]})
          </FilterChip>
        ))}
      </div>

      <OutreachLeadsTable leads={leads ?? []} reportOrigin={origin} />
    </div>
  );
}

const STATUS_LABELS: Record<string, string> = {
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

const STATUS_COLORS: Record<string, string> = {
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

function FilterChip({
  href,
  active,
  children,
  color,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
  color?: string;
}) {
  const c = color ?? "var(--tt-green, #39b255)";
  return (
    <a
      href={href}
      style={{
        padding: "5px 12px",
        borderRadius: 99,
        fontSize: 12,
        fontWeight: 600,
        textDecoration: "none",
        background: active ? c : "transparent",
        color: active ? "#fff" : "var(--app-fg-2)",
        border: `1.5px solid ${active ? c : "var(--app-border)"}`,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </a>
  );
}

function SummaryCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: number;
  sub?: string;
  accent?: string;
}) {
  return (
    <div
      style={{
        background: "var(--app-card)",
        border: "1.5px solid var(--app-border)",
        borderRadius: 12,
        padding: "14px 18px",
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: ".08em",
          textTransform: "uppercase",
          color: "var(--app-fg-3)",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 28,
          fontWeight: 700,
          color: accent ?? "var(--app-fg)",
          marginTop: 4,
          lineHeight: 1.1,
        }}
      >
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 11, color: "var(--app-fg-3)", marginTop: 2 }}>
          {sub}
        </div>
      )}
    </div>
  );
}
