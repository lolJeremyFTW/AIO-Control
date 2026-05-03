// Catalog importers — pull marketplace items from public sources and
// normalise them into the ImportItem shape. Each importer fetches a
// well-known endpoint (GitHub raw README, JSON manifest, etc.) and
// scrapes/parses what it can.
//
// All fetches happen server-side so user IPs aren't leaked to the
// catalog hosts and we can cache responses cheaply.

import "server-only";

import type { ImportItem } from "../../app/actions/marketplace-admin";

export type Source = {
  id: string;
  label: string;
  description: string;
  url: string;
  fetcher: () => Promise<ImportItem[]>;
};

// ─── modelcontextprotocol/servers (official MCP catalog) ────────────────────
async function fetchOfficialMcp(): Promise<ImportItem[]> {
  // The official MCP repo lists servers in its README. We hit the raw
  // README and pull out the "## Server" entries.
  const url =
    "https://raw.githubusercontent.com/modelcontextprotocol/servers/main/README.md";
  const res = await fetch(url, { next: { revalidate: 86400 } });
  if (!res.ok) return [];
  const text = await res.text();

  // Find sections like:
  //   ### **[Filesystem](src/filesystem)** – Secure file operations…
  // or
  //   - **[GitHub](src/github)** – Repository management
  const items: ImportItem[] = [];
  const re = /-\s*\*\*\[([^\]]+)\]\(([^)]+)\)\*\*\s*[-–—]\s*([^\n]+)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const name = match[1]!.trim();
    const href = match[2]!.trim();
    const desc = match[3]!.trim();
    const slug = `mcp-${slugify(name)}`;
    const sourceUrl = href.startsWith("http")
      ? href
      : `https://github.com/modelcontextprotocol/servers/tree/main/${href}`;
    items.push({
      slug,
      name,
      tagline: desc.slice(0, 120),
      description: desc,
      marketplace_kind: "mcp_server",
      provider: "claude",
      kind: "router",
      category: "mcp",
      config: {
        mcp: {
          name: slugify(name),
          source: sourceUrl,
        },
      },
      source_url: sourceUrl,
      source_provider: "modelcontextprotocol/servers",
    });
    if (items.length > 60) break; // sanity cap
  }
  return items;
}

// ─── msitarzewski/agency-agents (OpenAI Agents) ─────────────────────────────
async function fetchAgencyAgents(): Promise<ImportItem[]> {
  // The repo has a top-level agents/ folder with one .yaml or .json
  // per agent. We use the GitHub trees API to list them.
  const treeUrl =
    "https://api.github.com/repos/msitarzewski/agency-agents/git/trees/main?recursive=1";
  const res = await fetch(treeUrl, {
    next: { revalidate: 86400 },
    headers: { accept: "application/vnd.github+json" },
  });
  if (!res.ok) return [];
  const tree = (await res.json()) as {
    tree?: { path: string; type: string }[];
  };
  const items: ImportItem[] = [];
  for (const entry of tree.tree ?? []) {
    if (entry.type !== "blob") continue;
    if (!/^agents\/.+\.(yaml|yml|json|md)$/i.test(entry.path)) continue;
    const name = entry.path
      .replace(/^agents\//, "")
      .replace(/\.[^.]+$/, "")
      .replace(/[-_]/g, " ");
    const slug = `agency-${slugify(name)}`;
    const sourceUrl = `https://github.com/msitarzewski/agency-agents/blob/main/${entry.path}`;
    items.push({
      slug,
      name,
      tagline: `Agent uit msitarzewski/agency-agents`,
      description: `Geïmporteerd uit ${entry.path}. Open de source-link voor de volledige spec.`,
      marketplace_kind: "agent",
      provider: "openrouter",
      model: "openrouter/auto",
      kind: "worker",
      category: "agency",
      config: {},
      source_url: sourceUrl,
      source_provider: "msitarzewski/agency-agents",
    });
    if (items.length > 80) break;
  }
  return items;
}

// ─── forrestchang/andrej-karpathy-skills ────────────────────────────────────
async function fetchKarpathySkills(): Promise<ImportItem[]> {
  return fetchSkillRepoTree(
    "forrestchang/andrej-karpathy-skills",
    "karpathy",
    "Andrej Karpathy curated skill",
  );
}

// ─── mattpocock/skills ──────────────────────────────────────────────────────
async function fetchMattPocockSkills(): Promise<ImportItem[]> {
  return fetchSkillRepoTree(
    "mattpocock/skills",
    "mattpocock",
    "Matt Pocock curated skill",
  );
}

// Generic skill-repo importer: walks the tree for SKILL.md / *.md files
// in skills/<name>/SKILL.md or top-level *.md.
async function fetchSkillRepoTree(
  repo: string,
  catPrefix: string,
  taglinePrefix: string,
): Promise<ImportItem[]> {
  const treeUrl = `https://api.github.com/repos/${repo}/git/trees/main?recursive=1`;
  const res = await fetch(treeUrl, {
    next: { revalidate: 86400 },
    headers: { accept: "application/vnd.github+json" },
  });
  if (!res.ok) return [];
  const tree = (await res.json()) as {
    tree?: { path: string; type: string }[];
  };
  const items: ImportItem[] = [];
  for (const entry of tree.tree ?? []) {
    if (entry.type !== "blob") continue;
    // Either skills/<name>/SKILL.md or skills/<name>.md
    const m = entry.path.match(/^skills\/([^/]+)(?:\/SKILL\.md)?$/i);
    const m2 = entry.path.match(/^skills\/([^/]+)\.md$/i);
    const m3 = entry.path.match(/^([^/]+)\/SKILL\.md$/i);
    const name = (m?.[1] ?? m2?.[1] ?? m3?.[1] ?? "")
      .replace(/[-_]/g, " ")
      .trim();
    if (!name) continue;
    const slug = `${catPrefix}-${slugify(name)}`;
    const sourceUrl = `https://github.com/${repo}/blob/main/${entry.path}`;
    items.push({
      slug,
      name,
      tagline: `${taglinePrefix}`,
      description: `Geïmporteerd uit ${repo}. Klik de source-link voor het volledige skill-bestand.`,
      marketplace_kind: "skill",
      provider: "claude",
      kind: "generator",
      category: catPrefix,
      config: { source: sourceUrl },
      source_url: sourceUrl,
      source_provider: repo,
    });
    if (items.length > 50) break;
  }
  return items;
}

// ─── Sources registry ───────────────────────────────────────────────────────
export const SOURCES: Source[] = [
  {
    id: "mcp-official",
    label: "Official MCP servers",
    description: "modelcontextprotocol/servers — de officiële catalogus",
    url: "https://github.com/modelcontextprotocol/servers",
    fetcher: fetchOfficialMcp,
  },
  {
    id: "mcp-so",
    label: "mcp.so directory",
    description: "Community-curated MCP server directory",
    url: "https://mcp.so",
    fetcher: async () => [], // placeholder — needs scraping HTML
  },
  {
    id: "mcp-servers-org",
    label: "mcpservers.org",
    description: "MCP server marketplace",
    url: "https://mcpservers.org",
    fetcher: async () => [], // placeholder — needs scraping HTML
  },
  {
    id: "agency-agents",
    label: "msitarzewski/agency-agents",
    description: "OpenAI Agents collection",
    url: "https://github.com/msitarzewski/agency-agents",
    fetcher: fetchAgencyAgents,
  },
  {
    id: "karpathy-skills",
    label: "Andrej Karpathy skills",
    description: "forrestchang/andrej-karpathy-skills",
    url: "https://github.com/forrestchang/andrej-karpathy-skills",
    fetcher: fetchKarpathySkills,
  },
  {
    id: "mattpocock-skills",
    label: "Matt Pocock skills",
    description: "mattpocock/skills",
    url: "https://github.com/mattpocock/skills",
    fetcher: fetchMattPocockSkills,
  },
];

export async function getSourceItems(sourceId: string): Promise<ImportItem[]> {
  const source = SOURCES.find((s) => s.id === sourceId);
  if (!source) return [];
  try {
    return await source.fetcher();
  } catch (err) {
    console.error(`importer ${sourceId} failed`, err);
    return [];
  }
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}
