export type McpServerCatalogItem = {
  id: string;
  title: string;
  description: string;
  command: string;
  badge?: "official" | "local" | "oauth" | "key";
  tags: string[];
};

export const MCP_SERVER_CATALOG: McpServerCatalogItem[] = [
  {
    id: "minimax",
    title: "MiniMax Coder-Plan",
    description: "Web search and image understanding through MiniMax Coder Plan MCP.",
    command: "/minimax",
    badge: "key",
    tags: ["mcp", "search", "vision", "minimax"],
  },
  {
    id: "minimax-images",
    title: "MiniMax Image Generation",
    description: "Generate images with MiniMax image-01 using the workspace MiniMax key.",
    command: "/minimax-images",
    badge: "key",
    tags: ["mcp", "image", "generation", "minimax", "image-01"],
  },
  {
    id: "openai-images",
    title: "OpenAI Images",
    description:
      "Generate images with GPT Image using the user's Codex login when available, with OpenAI API key fallback.",
    command: "/openai-images",
    badge: "oauth",
    tags: ["mcp", "image", "generation", "openai", "codex", "gpt-image"],
  },
  {
    id: "aio",
    title: "AIO Control",
    description:
      "Platform tools plus local Supabase/Postgres context for businesses, agents, runs, dashboards, and approved writes.",
    command: "/aio",
    badge: "local",
    tags: ["mcp", "platform", "agents", "runs", "supabase", "postgres"],
  },
  {
    id: "bash",
    title: "Bash Shell",
    description: "Local VPS shell tool. Use carefully; write actions are approval-gated in agent flows.",
    command: "/bash",
    badge: "local",
    tags: ["mcp", "shell", "vps", "code"],
  },
  {
    id: "filesystem",
    title: "Filesystem",
    description: "Read, list, and optionally write files within the configured MCP filesystem roots.",
    command: "/filesystem",
    badge: "official",
    tags: ["mcp", "files", "read", "write"],
  },
  {
    id: "fetch",
    title: "Web Fetch",
    description: "Fetch URLs and return clean text/markdown for agents.",
    command: "/fetch",
    badge: "local",
    tags: ["mcp", "web", "fetch"],
  },
  {
    id: "playwright",
    title: "Playwright Browser",
    description: "Headless Chromium browser automation: navigate, click, type, inspect, screenshot.",
    command: "/playwright",
    badge: "official",
    tags: ["mcp", "browser", "web", "test"],
  },
  {
    id: "brave",
    title: "Brave Search",
    description: "High-quality web and news search backed by Brave Search API.",
    command: "/brave",
    badge: "official",
    tags: ["mcp", "search", "web", "news"],
  },
  {
    id: "memory",
    title: "Memory",
    description: "Persistent knowledge graph for entities, relations, and observations.",
    command: "/memory",
    badge: "official",
    tags: ["mcp", "memory", "knowledge"],
  },
  {
    id: "firecrawl",
    title: "Firecrawl",
    description: "Scrape, crawl, and deep research websites into structured markdown.",
    command: "/firecrawl",
    badge: "key",
    tags: ["mcp", "crawl", "scrape", "research"],
  },
  {
    id: "firecrawl-pc",
    title: "Firecrawl PC",
    description: "Firecrawl MCP routed to the TrompTech PC over Tailscale.",
    command: "/firecrawl-pc",
    badge: "key",
    tags: ["mcp", "crawl", "pc", "tailscale"],
  },
];

export function listMcpServerCatalog(): McpServerCatalogItem[] {
  return MCP_SERVER_CATALOG;
}

export function getMcpServerCatalogItem(
  id: string,
): McpServerCatalogItem | undefined {
  return MCP_SERVER_CATALOG.find((item) => item.id === id);
}
