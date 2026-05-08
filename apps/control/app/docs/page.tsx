import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import {
  docPages,
  featureHighlights,
  outputChannels,
  providerRows,
  valueProps,
  workflowCards,
} from "./_content";
import { DocsNav } from "./_nav";
import styles from "./docs.module.css";

export const metadata: Metadata = {
  title: "AIO Control Docs - Self-hosted AI agent command center",
  description:
    "Learn how AIO Control runs OpenClaw, Hermes Agent, Claude Code, Codex, MCP tools, schedules, notifications, and human review from one dashboard.",
};

export default function DocsPage() {
  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <DocsNav activeHref="/docs" />

        <section className={styles.hero}>
          <div>
            <span className={styles.eyebrow}>Public docs</span>
            <h1>Run serious AI agent work from one control panel.</h1>
            <p>
              AIO Control is the self-hosted operator dashboard for OpenClaw,
              Hermes Agent, Claude Code, OpenAI Codex, MiniMax, OpenRouter,
              Ollama, Anthropic Claude, MCP tools, schedules, review queues, and
              output channels.
            </p>
            <div className={styles.heroActions}>
              <Link className={styles.button} href="/docs/features">
                Explore features
              </Link>
              <Link className={styles.ghostButton} href="/docs/workflows">
                See workflows
              </Link>
            </div>
          </div>
          <div className={styles.heroImageWrap}>
            <Image
              className={styles.heroImage}
              src="/readme/aio-control-dashboard.png"
              width={1600}
              height={1000}
              alt="AIO Control dashboard showing agents, runs, review queue, and Telegram, Slack, Discord outputs"
              priority
              sizes="(max-width: 980px) 100vw, 50vw"
            />
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <div>
              <h2>Why users should want this</h2>
              <p className={styles.sectionIntro}>
                AIO Control is for operators who have outgrown scattered
                terminal sessions, one-off chat windows, and hidden automation
                scripts. It makes agent work visible, repeatable, routed, and
                reviewable.
              </p>
            </div>
          </div>
          <div className={styles.grid}>
            {valueProps.map((item) => (
              <article className={styles.card} key={item.title}>
                <h3>{item.title}</h3>
                <p>{item.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className={styles.section}>
          <h2>Key features</h2>
          <p className={styles.sectionIntro}>
            The core product is not only chat. It is the operational layer
            around agents: setup, context, tools, schedules, approvals, outputs,
            dashboards, and cost control.
          </p>
          <ul className={styles.featureList}>
            {featureHighlights.map((feature) => (
              <li key={feature}>{feature}</li>
            ))}
          </ul>
        </section>

        <section className={styles.section}>
          <h2>Provider coverage</h2>
          <p className={styles.sectionIntro}>
            The provider router normalizes local CLIs, subscription-style
            providers, hosted APIs, local models, and MCP-capable runtimes into
            one event stream.
          </p>
          <div className={styles.table}>
            {providerRows.map(([provider, mode, use]) => (
              <div className={styles.row} key={provider}>
                <strong>{provider}</strong>
                <span>{mode}</span>
                <span>{use}</span>
              </div>
            ))}
          </div>
        </section>

        <section className={styles.section}>
          <h2>Workflows people can actually run</h2>
          <div className={styles.twoGrid}>
            {workflowCards.map((item) => (
              <article className={styles.card} key={item.title}>
                <h3>{item.title}</h3>
                <p>{item.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className={styles.section}>
          <h2>Outputs: Telegram, Slack, Discord, email, push, dashboards</h2>
          <p className={styles.sectionIntro}>
            Agent work should arrive where decisions happen. AIO Control can
            send reports, approvals, commands, and artifacts to the channels
            teams already use.
          </p>
          <div className={styles.channels}>
            {outputChannels.map((channel) => (
              <article className={styles.card} key={channel.name}>
                <span className={styles.channelBadge}>
                  {channel.name.slice(0, 1)}
                </span>
                <h3>{channel.name}</h3>
                <p>{channel.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className={styles.section}>
          <h2>Docs scope</h2>
          <p className={styles.sectionIntro}>
            Start with the overview, then go deeper into the parts that matter
            for your agent stack and operating model.
          </p>
          <div className={styles.grid}>
            {docPages.map((page) => (
              <Link
                className={styles.linkCard}
                href={`/docs/${page.slug}`}
                key={page.slug}
              >
                <h3>{page.title}</h3>
                <p>{page.summary}</p>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
