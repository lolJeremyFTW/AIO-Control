// Catalog importers: pull marketplace items from public sources and normalize
// them into the ImportItem shape. Fetching happens server-side so catalog hosts
// do not see user IPs and Next can cache responses cheaply.

import "server-only";

import type { ImportItem } from "../../app/actions/marketplace-admin";

export type Source = {
  id: string;
  label: string;
  description: string;
  url: string;
  fetcher: () => Promise<ImportItem[]>;
};

type RegistryResponse = {
  servers?: {
    server?: {
      name?: string;
      title?: string;
      description?: string;
      version?: string;
      repository?: { url?: string; source?: string; id?: string };
      websiteUrl?: string;
      remotes?: { type?: string; url?: string }[];
      packages?: { registry_name?: string; name?: string; version?: string }[];
    };
    _meta?: {
      "io.modelcontextprotocol.registry/official"?: {
        status?: string;
        isLatest?: boolean;
      };
    };
  }[];
  metadata?: { nextCursor?: string };
};

async function fetchOfficialMcp(): Promise<ImportItem[]> {
  const registryItems = await fetchOfficialMcpRegistry();
  if (registryItems.length > 0) return registryItems;

  const text = await fetchText(
    "https://raw.githubusercontent.com/modelcontextprotocol/servers/main/README.md",
  );
  if (!text) return [];
  return parseMarkdownMcpList({
    text,
    slugPrefix: "mcp-official",
    sourceProvider: "modelcontextprotocol/servers",
    sourceBase: "https://github.com/modelcontextprotocol/servers/tree/main",
    maxItems: 80,
  });
}

async function fetchOfficialMcpRegistry(): Promise<ImportItem[]> {
  const items: ImportItem[] = [];
  const seen = new Set<string>();
  let cursor: string | undefined;

  for (let page = 0; page < 4 && items.length < 120; page++) {
    const url = new URL("https://registry.modelcontextprotocol.io/v0/servers");
    url.searchParams.set("limit", "100");
    if (cursor) url.searchParams.set("cursor", cursor);

    const res = await fetch(url.toString(), { cache: "no-store" });
    if (!res.ok) break;
    const json = (await res.json()) as RegistryResponse;

    for (const entry of json.servers ?? []) {
      const server = entry.server;
      if (!server?.name) continue;
      const official = entry._meta?.["io.modelcontextprotocol.registry/official"];
      if (official?.status && official.status !== "active") continue;
      if (official?.isLatest === false) continue;
      if (seen.has(server.name)) continue;
      seen.add(server.name);

      const displayName = server.title?.trim() || server.name;
      const description = cleanText(
        server.description || `MCP server ${server.name}`,
      );
      const sourceUrl =
        server.repository?.url ||
        server.websiteUrl ||
        server.remotes?.find((remote) => remote.url)?.url ||
        `https://registry.modelcontextprotocol.io/server/${encodeURIComponent(
          server.name,
        )}`;

      items.push({
        slug: `mcp-official-${slugify(server.name)}`,
        name: displayName,
        tagline: description.slice(0, 120),
        description,
        marketplace_kind: "mcp_server",
        provider: "claude",
        kind: "router",
        category: "official",
        config: {
          mcp: {
            name: server.name,
            title: server.title ?? null,
            version: server.version ?? null,
            source: sourceUrl,
            repository: server.repository ?? null,
            remotes: server.remotes ?? [],
            packages: server.packages ?? [],
          },
        },
        source_url: sourceUrl,
        source_provider: "registry.modelcontextprotocol.io",
      });
    }

    cursor = json.metadata?.nextCursor;
    if (!cursor) break;
  }

  return items;
}

async function fetchMcpServersOrg(): Promise<ImportItem[]> {
  const text = await fetchText(
    "https://raw.githubusercontent.com/wong2/awesome-mcp-servers/main/README.md",
  );
  if (!text) return [];
  return parseMarkdownMcpList({
    text,
    slugPrefix: "mcpservers",
    sourceProvider: "mcpservers.org",
    sourceBase: "https://github.com/wong2/awesome-mcp-servers/blob/main",
    maxItems: 120,
  });
}

async function fetchMcpSo(): Promise<ImportItem[]> {
  const pages = await Promise.all([
    fetchText("https://mcp.so"),
    fetchText("https://mcp.so/servers?tag=featured"),
    fetchText("https://mcp.so/servers?tag=official"),
  ]);
  const items: ImportItem[] = [];
  const seen = new Set<string>();

  for (const html of pages) {
    if (!html) continue;
    for (const match of html.matchAll(
      /https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+/g,
    )) {
      const sourceUrl = match[0]!;
      if (
        sourceUrl.includes("/issues") ||
        sourceUrl.includes("/actions") ||
        sourceUrl.includes("/user-attachments") ||
        seen.has(sourceUrl)
      ) {
        continue;
      }

      seen.add(sourceUrl);
      const repo = sourceUrl.replace("https://github.com/", "");
      const name = repo.split("/").at(-1)!.replace(/[-_]/g, " ");
      items.push({
        slug: `mcp-so-${slugify(repo)}`,
        name,
        tagline: `MCP server uit mcp.so (${repo})`,
        description:
          "Gevonden in de gerenderde mcp.so directory. Open de source-link voor installatie en configuratie.",
        marketplace_kind: "mcp_server",
        provider: "claude",
        kind: "router",
        category: "mcp-so",
        config: {
          mcp: {
            name: slugify(name),
            source: sourceUrl,
          },
        },
        source_url: sourceUrl,
        source_provider: "mcp.so",
      });
      if (items.length >= 80) return items;
    }
  }

  return items;
}

async function fetchAgencyAgents(): Promise<ImportItem[]> {
  const tree = await fetchGitHubTree("msitarzewski/agency-agents");
  const items: ImportItem[] = [];

  for (const entry of tree) {
    if (entry.type !== "blob") continue;
    if (!/^[a-z0-9-]+\/[a-z0-9-]+\.md$/i.test(entry.path)) continue;
    if (entry.path.startsWith(".github/")) continue;

    const [category = "agency", file = entry.path] = entry.path.split("/");
    const name = file.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ");
    const slug = `agency-${slugify(name)}`;
    const sourceUrl = `https://github.com/msitarzewski/agency-agents/blob/main/${entry.path}`;
    items.push({
      slug,
      name,
      tagline: `Agent uit msitarzewski/agency-agents`,
      description: `Geimporteerd uit ${entry.path}. Open de source-link voor de volledige spec.`,
      marketplace_kind: "agent",
      provider: "openrouter",
      model: "openrouter/auto",
      kind: "worker",
      category,
      config: {},
      source_url: sourceUrl,
      source_provider: "msitarzewski/agency-agents",
    });
    if (items.length >= 120) break;
  }

  return items;
}

async function fetchKarpathySkills(): Promise<ImportItem[]> {
  return fetchSkillRepoTree(
    "forrestchang/andrej-karpathy-skills",
    "karpathy",
    "Andrej Karpathy curated skill",
  );
}

async function fetchMattPocockSkills(): Promise<ImportItem[]> {
  return fetchSkillRepoTree(
    "mattpocock/skills",
    "mattpocock",
    "Matt Pocock curated skill",
  );
}

async function fetchSkillRepoTree(
  repo: string,
  catPrefix: string,
  taglinePrefix: string,
): Promise<ImportItem[]> {
  const tree = await fetchGitHubTree(repo);
  const items: ImportItem[] = [];

  for (const entry of tree) {
    if (entry.type !== "blob") continue;
    if (!/(^|\/)SKILL\.md$/i.test(entry.path)) continue;

    const parts = entry.path.split("/");
    const skillDir = parts.at(-2);
    const name = (skillDir ?? "").replace(/[-_]/g, " ").trim();
    if (!name) continue;

    const category = parts[1] && parts[1] !== skillDir ? parts[1] : catPrefix;
    const slug = `${catPrefix}-${slugify(name)}`;
    const sourceUrl = `https://github.com/${repo}/blob/main/${entry.path}`;
    items.push({
      slug,
      name,
      tagline: taglinePrefix,
      description: `Geimporteerd uit ${repo}. Klik de source-link voor het volledige skill-bestand.`,
      marketplace_kind: "skill",
      provider: "claude",
      kind: "generator",
      category,
      config: { source: sourceUrl },
      source_url: sourceUrl,
      source_provider: repo,
    });
    if (items.length >= 80) break;
  }

  return items;
}

function parseMarkdownMcpList(input: {
  text: string;
  slugPrefix: string;
  sourceProvider: string;
  sourceBase?: string;
  maxItems: number;
}): ImportItem[] {
  const items: ImportItem[] = [];
  let category = "mcp";

  for (const rawLine of input.text.split(/\r?\n/)) {
    const heading = rawLine.match(/^##\s+(.+)$/);
    if (heading) {
      category = slugify(heading[1]!) || "mcp";
      continue;
    }
    if (category === "clients" || category === "frameworks") continue;

    const match = rawLine.match(
      /^[-*]\s+(?:.*?)\*\*\[([^\]]+)]\(([^)]+)\)\*\*\s*(?:[-:\u2013\u2014]\s*)?(.+)$/,
    );
    if (!match) continue;

    const name = cleanText(match[1]!);
    const href = match[2]!.trim();
    const desc = cleanText(match[3]!).slice(0, 500);
    if (!name || !href || href.startsWith("#")) continue;

    const sourceUrl = href.startsWith("http")
      ? href
      : `${input.sourceBase ?? ""}/${href.replace(/^\.?\//, "")}`;
    items.push({
      slug: `${input.slugPrefix}-${slugify(name)}`,
      name,
      tagline: desc.slice(0, 120),
      description: desc,
      marketplace_kind: "mcp_server",
      provider: "claude",
      kind: "router",
      category,
      config: {
        mcp: {
          name: slugify(name),
          source: sourceUrl,
        },
      },
      source_url: sourceUrl,
      source_provider: input.sourceProvider,
    });
    if (items.length >= input.maxItems) break;
  }

  return items;
}

export const SOURCES: Source[] = [
  {
    id: "mcp-official",
    label: "Official MCP servers",
    description: "registry.modelcontextprotocol.io - de officiele catalogus",
    url: "https://registry.modelcontextprotocol.io",
    fetcher: fetchOfficialMcp,
  },
  {
    id: "mcp-so",
    label: "mcp.so directory",
    description: "Community-curated MCP server directory",
    url: "https://mcp.so",
    fetcher: fetchMcpSo,
  },
  {
    id: "mcp-servers-org",
    label: "mcpservers.org",
    description: "MCP server marketplace",
    url: "https://mcpservers.org",
    fetcher: fetchMcpServersOrg,
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

async function fetchGitHubTree(
  repo: string,
): Promise<{ path: string; type: string }[]> {
  const res = await fetch(
    `https://api.github.com/repos/${repo}/git/trees/main?recursive=1`,
    {
      cache: "no-store",
      headers: { accept: "application/vnd.github+json" },
    },
  );
  if (!res.ok) return [];
  const json = (await res.json()) as {
    tree?: { path: string; type: string }[];
  };
  return json.tree ?? [];
}

async function fetchText(url: string): Promise<string | null> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return null;
  return res.text();
}

function cleanText(text: string): string {
  return text
    .replace(/<[^>]+>/g, "")
    .replace(/!\[[^\]]*]\([^)]+\)/g, "")
    .replace(/\[([^\]]+)]\([^)]+\)/g, "$1")
    .replace(/[`*_~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}
