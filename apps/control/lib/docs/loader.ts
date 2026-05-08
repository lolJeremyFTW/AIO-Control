// Filesystem loader for the docs markdown content. Reads from
// apps/control/content/docs/{locale}/{slug}.md. The build copies
// the content/ tree next to the standalone Next.js output, so we
// resolve paths via process.cwd() at request-time.
//
// We deliberately stay zero-dependency. Frontmatter is optional,
// parsed by hand.

import "server-only";

import { promises as fs } from "node:fs";
import path from "node:path";

import type { Locale } from "../i18n/dict";

export type DocFrontmatter = {
  title?: string;
  description?: string;
  /** ISO timestamp of the last meaningful update. Optional. */
  updated?: string;
};

export type LoadedDoc = {
  frontmatter: DocFrontmatter;
  body: string;
};

const CONTENT_ROOTS = [
  // 1. Repo-style path (works in dev + when content/ is bundled).
  path.join(process.cwd(), "content", "docs"),
  // 2. Monorepo-aware path — when running from the workspace root
  //    instead of apps/control.
  path.join(process.cwd(), "apps", "control", "content", "docs"),
  // 3. Next.js standalone output places assets under .next/standalone
  //    when output: "standalone" is on. The deploy script copies
  //    content/ next to it; we resolve there as a final fallback.
  path.join(process.cwd(), ".next", "standalone", "apps", "control", "content", "docs"),
];

async function findContentRoot(): Promise<string | null> {
  for (const root of CONTENT_ROOTS) {
    try {
      const stat = await fs.stat(root);
      if (stat.isDirectory()) return root;
    } catch {
      // not here, try next
    }
  }
  return null;
}

function parseFrontmatter(raw: string): { fm: DocFrontmatter; body: string } {
  if (!raw.startsWith("---\n") && !raw.startsWith("---\r\n")) {
    return { fm: {}, body: raw };
  }
  const after = raw.replace(/^---\r?\n/, "");
  const end = after.indexOf("\n---");
  if (end === -1) return { fm: {}, body: raw };
  const fmText = after.slice(0, end);
  const body = after.slice(end + 4).replace(/^\r?\n/, "");
  const fm: DocFrontmatter = {};
  for (const line of fmText.split(/\r?\n/)) {
    const m = line.match(/^([a-zA-Z_-]+):\s*(.*)$/);
    if (!m) continue;
    const key = m[1] as keyof DocFrontmatter;
    let value = m[2] ?? "";
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    (fm as Record<string, string>)[key as string] = value;
  }
  return { fm, body };
}

export async function loadDoc(
  locale: Locale,
  slug: string,
): Promise<LoadedDoc | null> {
  const root = await findContentRoot();
  if (!root) return null;

  // Defence against path traversal — slug must not contain "..".
  if (slug.includes("..") || slug.startsWith("/") || slug.includes("\\")) {
    return null;
  }

  const filename = path.join(root, locale, `${slug}.md`);
  try {
    const raw = await fs.readFile(filename, "utf-8");
    const { fm, body } = parseFrontmatter(raw);
    return { frontmatter: fm, body };
  } catch {
    return null;
  }
}

/** Returns a list of slugs that exist for this locale. Used by the
 *  landing page to know which pages to surface. */
export async function listDocs(locale: Locale): Promise<string[]> {
  const root = await findContentRoot();
  if (!root) return [];
  const dir = path.join(root, locale);
  try {
    const entries = await fs.readdir(dir);
    return entries
      .filter((e) => e.endsWith(".md"))
      .map((e) => e.replace(/\.md$/, ""));
  } catch {
    return [];
  }
}
