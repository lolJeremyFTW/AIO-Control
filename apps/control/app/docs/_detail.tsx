import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { docPages, getDocPage } from "./_content";
import { DocsNav } from "./_nav";
import styles from "./docs.module.css";

export function generateDocMetadata(slug: string): Metadata {
  const page = getDocPage(slug);
  if (!page) {
    return {
      title: "AIO Control Docs",
    };
  }

  return {
    title: `${page.title} - AIO Control Docs`,
    description: page.summary,
  };
}

type DocDetailProps = {
  slug: string;
};

export function DocDetail({ slug }: DocDetailProps) {
  const page = getDocPage(slug);
  if (!page) notFound();

  const activeHref = `/docs/${page.slug}`;

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <DocsNav activeHref={activeHref} />

        <section className={styles.docHero}>
          <span className={styles.eyebrow}>{page.eyebrow}</span>
          <h1>{page.title}</h1>
          <p>{page.summary}</p>
        </section>

        <div className={styles.docLayout}>
          <div className={styles.docStack}>
            <section className={styles.docPanel}>
              <h2>Why this matters</h2>
              <ul className={styles.whyList}>
                {page.why.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>

            {page.sections.map((section) => (
              <section className={styles.docPanel} key={section.title}>
                <h2>{section.title}</h2>
                <p>{section.body}</p>
                <ul>
                  {section.bullets.map((bullet) => (
                    <li key={bullet}>{bullet}</li>
                  ))}
                </ul>
              </section>
            ))}
          </div>

          <aside className={styles.side} aria-label="Docs pages">
            <Link href="/docs">Overview</Link>
            {docPages.map((item) => (
              <Link
                className={item.slug === page.slug ? styles.active : undefined}
                href={`/docs/${item.slug}`}
                key={item.slug}
              >
                {item.title}
              </Link>
            ))}
          </aside>
        </div>
      </div>
    </main>
  );
}
