import "server-only";

export type OnlineSkillTemplate = {
  id: string;
  name: string;
  description: string;
  body: string;
  source_url: string;
  source_provider: string;
};

type SkillSource = {
  id: string;
  repo: string;
  label: string;
  maxItems: number;
};

const SOURCES: SkillSource[] = [
  {
    id: "karpathy",
    repo: "forrestchang/andrej-karpathy-skills",
    label: "Andrej Karpathy skills",
    maxItems: 24,
  },
  {
    id: "mattpocock",
    repo: "mattpocock/skills",
    label: "Matt Pocock skills",
    maxItems: 24,
  },
];

const GITHUB_HEADERS = {
  accept: "application/vnd.github+json",
  "user-agent": "aio-control-skill-importer",
};

type GitHubRepo = {
  default_branch?: string;
};

type GitHubTree = {
  tree?: Array<{ path: string; type: string }>;
};

export async function listPopularOnlineSkills(): Promise<
  OnlineSkillTemplate[]
> {
  const results = await Promise.all(
    SOURCES.map((source) => listRepoSkills(source)),
  );
  const seen = new Set<string>();
  return results
    .flat()
    .filter((skill) => {
      const key = `${skill.name.toLowerCase()}::${skill.source_provider}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function getPopularOnlineSkill(
  id: string,
): Promise<OnlineSkillTemplate | null> {
  const skills = await listPopularOnlineSkills();
  return skills.find((skill) => skill.id === id) ?? null;
}

export async function getSkillFromGitHubUrl(
  inputUrl: string,
): Promise<OnlineSkillTemplate | null> {
  const resolved = resolveGitHubMarkdownUrl(inputUrl);
  if (!resolved) return null;
  const content = await fetchText(resolved.rawUrl);
  if (!content?.trim()) return null;
  const parsed = parseSkillMarkdown(content, resolved.fallbackName);
  return {
    id: `custom:${hashId(resolved.sourceUrl)}`,
    name: parsed.name,
    description: parsed.description,
    body: parsed.body,
    source_url: resolved.sourceUrl,
    source_provider: resolved.sourceProvider,
  };
}

async function listRepoSkills(
  source: SkillSource,
): Promise<OnlineSkillTemplate[]> {
  const branch = await getDefaultBranch(source.repo);
  const treeUrl = `https://api.github.com/repos/${source.repo}/git/trees/${encodeURIComponent(
    branch,
  )}?recursive=1`;
  const treeRes = await fetch(treeUrl, {
    next: { revalidate: 86400 },
    headers: GITHUB_HEADERS,
  });
  if (!treeRes.ok) return [];

  const tree = (await treeRes.json()) as GitHubTree;
  const paths = (tree.tree ?? [])
    .filter((entry) => entry.type === "blob")
    .map((entry) => entry.path)
    .filter(isSkillMarkdownPath)
    .slice(0, source.maxItems);

  const templates = await Promise.all(
    paths.map(async (path) => {
      const rawUrl = rawGitHubUrl(source.repo, branch, path);
      const content = await fetchText(rawUrl);
      if (!content?.trim()) return null;
      const parsed = parseSkillMarkdown(content, nameFromPath(path));
      const sourceUrl = `https://github.com/${source.repo}/blob/${branch}/${path}`;
      return {
        id: `${source.id}:${path}`,
        name: parsed.name,
        description: parsed.description,
        body: parsed.body,
        source_url: sourceUrl,
        source_provider: source.label,
      } satisfies OnlineSkillTemplate;
    }),
  );

  return templates.filter(
    (template): template is OnlineSkillTemplate => Boolean(template),
  );
}

async function getDefaultBranch(repo: string): Promise<string> {
  const res = await fetch(`https://api.github.com/repos/${repo}`, {
    next: { revalidate: 86400 },
    headers: GITHUB_HEADERS,
  });
  if (!res.ok) return "main";
  const json = (await res.json()) as GitHubRepo;
  return json.default_branch || "main";
}

async function fetchText(url: string): Promise<string | null> {
  const res = await fetch(url, { next: { revalidate: 86400 } });
  if (!res.ok) return null;
  const text = await res.text();
  return text.slice(0, 128 * 1024);
}

function isSkillMarkdownPath(path: string): boolean {
  if (/README\.md$/i.test(path)) return false;
  if (/SKILL\.md$/i.test(path)) return true;
  return /^skills\/[^/]+\.md$/i.test(path);
}

function rawGitHubUrl(repo: string, branch: string, path: string): string {
  return `https://raw.githubusercontent.com/${repo}/${encodeURIComponent(
    branch,
  )}/${path
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/")}`;
}

function resolveGitHubMarkdownUrl(inputUrl: string):
  | {
      rawUrl: string;
      sourceUrl: string;
      sourceProvider: string;
      fallbackName: string;
    }
  | null {
  let url: URL;
  try {
    url = new URL(inputUrl.trim());
  } catch {
    return null;
  }
  if (!["https:", "http:"].includes(url.protocol)) return null;

  if (url.hostname === "raw.githubusercontent.com") {
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length < 4) return null;
    const [owner, repo, branch, ...pathParts] = parts;
    const path = pathParts.join("/");
    if (!isMarkdownFile(path)) return null;
    const sourceUrl = `https://github.com/${owner}/${repo}/blob/${branch}/${path}`;
    return {
      rawUrl: url.toString(),
      sourceUrl,
      sourceProvider: `${owner}/${repo}`,
      fallbackName: nameFromPath(path),
    };
  }

  if (url.hostname === "github.com") {
    const parts = url.pathname.split("/").filter(Boolean);
    const blobIndex = parts.indexOf("blob");
    if (parts.length < 5 || blobIndex !== 2) return null;
    const [owner, repo] = parts;
    const branch = parts[3];
    const path = parts.slice(4).join("/");
    if (!owner || !repo || !branch || !isMarkdownFile(path)) return null;
    return {
      rawUrl: rawGitHubUrl(`${owner}/${repo}`, branch, path),
      sourceUrl: url.toString(),
      sourceProvider: `${owner}/${repo}`,
      fallbackName: nameFromPath(path),
    };
  }

  return null;
}

function isMarkdownFile(path: string): boolean {
  return /\.(md|markdown)$/i.test(path);
}

function nameFromPath(path: string): string {
  const parts = path.split("/");
  const file = parts.at(-1) ?? "skill.md";
  const folder = parts.at(-2) ?? file;
  const seed = /^SKILL\.md$/i.test(file) ? folder : file.replace(/\.[^.]+$/, "");
  return titleCase(seed.replace(/[-_]+/g, " "));
}

function parseSkillMarkdown(
  content: string,
  fallbackName: string,
): { name: string; description: string; body: string } {
  const parsed = parseFrontmatter(content);
  const body = parsed.body.trim() || content.trim();
  const name =
    stringValue(parsed.frontmatter.name) ||
    stringValue(parsed.frontmatter.title) ||
    fallbackName;
  const description =
    stringValue(parsed.frontmatter.description) ||
    stringValue(parsed.frontmatter.when_to_use) ||
    firstMeaningfulLine(body) ||
    "Geimporteerde online skill.";

  return {
    name: normalizeSkillName(name),
    description: compactLine(description).slice(0, 240),
    body,
  };
}

function parseFrontmatter(text: string): {
  frontmatter: Record<string, unknown>;
  body: string;
} {
  const match = text.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
  if (!match) return { frontmatter: {}, body: text };

  const frontmatter: Record<string, unknown> = {};
  for (const line of match[1]!.split("\n")) {
    const kv = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
    if (!kv) continue;
    const key = kv[1]!.trim();
    const raw = kv[2]!.trim();
    if (
      (raw.startsWith('"') && raw.endsWith('"')) ||
      (raw.startsWith("'") && raw.endsWith("'"))
    ) {
      frontmatter[key] = raw.slice(1, -1);
    } else {
      frontmatter[key] = raw;
    }
  }

  return { frontmatter, body: match[2] ?? "" };
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function firstMeaningfulLine(text: string): string {
  const line =
    text
      .split("\n")
      .map((item) => item.trim())
      .find((item) => item && !item.startsWith("#")) ?? "";
  return compactLine(line.replace(/^[-*]\s+/, ""));
}

function compactLine(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeSkillName(name: string): string {
  return compactLine(name)
    .replace(/^skill:\s*/i, "")
    .slice(0, 80);
}

function titleCase(value: string): string {
  return value.replace(/\b\w/g, (char) => char.toUpperCase());
}

function hashId(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return hash.toString(36);
}
