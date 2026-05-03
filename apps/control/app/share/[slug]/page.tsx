// Public landing page for a marketplace agent. Anonymous readers
// see the spec + a "Install" button that routes them to login →
// then the marketplace install action. Server-rendered + cached.

import { notFound } from "next/navigation";
import Link from "next/link";

import { ShareLinkButton } from "../../../components/ShareLinkButton";
import { createSupabaseServerClient } from "../../../lib/supabase/server";

type Props = { params: Promise<{ slug: string }> };

export const dynamic = "force-dynamic";

export default async function PublicAgentSharePage({ params }: Props) {
  const { slug } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: agent } = await supabase
    .from("marketplace_agents")
    .select(
      "slug, name, tagline, description, provider, model, kind, category, official, marketplace_kind, share_count, install_count, config",
    )
    .eq("slug", slug)
    .maybeSingle();
  if (!agent) notFound();

  // Best-effort share counter bump — fire-and-forget RPC.
  void supabase.rpc("bump_marketplace_share", { _slug: slug });

  const installUrl = `/login?next=${encodeURIComponent(`/marketplace?install=${slug}`)}`;

  const config = agent.config as Record<string, unknown> | null;
  const systemPromptAddon =
    typeof config?.systemPromptAddon === "string"
      ? (config.systemPromptAddon as string)
      : null;

  return (
    <div
      style={{
        maxWidth: 720,
        margin: "0 auto",
        padding: "40px 22px 80px",
        color: "var(--app-fg)",
        fontFamily: "var(--type)",
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.18em",
          color: "var(--app-fg-3)",
          textTransform: "uppercase",
          marginBottom: 6,
        }}
      >
        AIO Control · {agent.marketplace_kind}
      </div>
      <h1
        style={{
          fontFamily: "var(--hand)",
          fontSize: 40,
          fontWeight: 700,
          margin: "0 0 8px",
          letterSpacing: "-1px",
        }}
      >
        {agent.name}
        {agent.official && (
          <span
            style={{
              marginLeft: 12,
              fontSize: 12,
              fontWeight: 700,
              padding: "3px 9px",
              borderRadius: 999,
              border: "1.5px solid var(--tt-green)",
              color: "var(--tt-green)",
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              verticalAlign: "middle",
            }}
          >
            Official
          </span>
        )}
      </h1>
      {agent.tagline && (
        <p
          style={{
            fontSize: 18,
            color: "var(--app-fg-2)",
            margin: "0 0 22px",
            lineHeight: 1.4,
          }}
        >
          {agent.tagline}
        </p>
      )}

      <div
        style={{
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
          marginBottom: 22,
        }}
      >
        <Chip label={agent.provider} />
        {agent.model && <Chip label={agent.model} />}
        <Chip label={agent.category ?? "overig"} />
        <Chip label={`${agent.install_count ?? 0} installs`} />
      </div>

      {agent.description && (
        <p
          style={{
            fontSize: 14.5,
            lineHeight: 1.6,
            margin: "0 0 22px",
            color: "var(--app-fg)",
          }}
        >
          {agent.description}
        </p>
      )}

      {systemPromptAddon && (
        <details style={{ marginBottom: 22 }}>
          <summary
            style={{
              cursor: "pointer",
              fontSize: 12,
              color: "var(--app-fg-2)",
              fontWeight: 600,
            }}
          >
            System prompt addon
          </summary>
          <pre
            style={{
              marginTop: 8,
              padding: 12,
              background: "var(--app-card-2)",
              border: "1px solid var(--app-border)",
              borderRadius: 8,
              fontSize: 12,
              whiteSpace: "pre-wrap",
              color: "var(--app-fg-2)",
            }}
          >
            {systemPromptAddon}
          </pre>
        </details>
      )}

      <div
        style={{
          display: "flex",
          gap: 10,
          alignItems: "center",
          flexWrap: "wrap",
          marginTop: 28,
        }}
      >
        <Link
          href={installUrl}
          style={{
            padding: "12px 22px",
            background: "var(--tt-green)",
            border: "1.5px solid var(--tt-green)",
            color: "#fff",
            borderRadius: 12,
            fontWeight: 700,
            fontSize: 14,
            textDecoration: "none",
          }}
        >
          + Installeer in mijn workspace
        </Link>
        <ShareLinkButton slug={agent.slug} />
      </div>

      <p
        style={{
          marginTop: 40,
          fontSize: 11.5,
          color: "var(--app-fg-3)",
        }}
      >
        Gedeeld via AIO Control · {agent.share_count ?? 0} keer bekeken
      </p>
    </div>
  );
}

function Chip({ label }: { label: string }) {
  return (
    <span
      style={{
        padding: "5px 11px",
        borderRadius: 999,
        fontSize: 11.5,
        fontWeight: 700,
        background: "var(--app-card-2)",
        border: "1px solid var(--app-border-2)",
        color: "var(--app-fg-2)",
        textTransform: "lowercase",
        letterSpacing: "0.06em",
      }}
    >
      {label}
    </span>
  );
}

