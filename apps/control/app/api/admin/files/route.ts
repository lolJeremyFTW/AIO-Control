import { constants as fsConstants } from "node:fs";
import {
  access,
  lstat,
  readdir,
  readFile,
  realpath,
  stat,
} from "node:fs/promises";
import path from "node:path";

import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "../../../../lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_PREVIEW_BYTES = 1024 * 1024;
const MAX_SEARCH_RESULTS = 5000;
const VIRTUAL_SEARCH_DIRS = new Set(["/dev", "/proc", "/run", "/sys"]);

type BrowserScope = "configured" | "server";

type FileEntry = {
  name: string;
  path: string;
  serverPath: string;
  type: "directory" | "file" | "symlink" | "other";
  size: number | null;
  modifiedAt: string | null;
  readable: boolean;
};

async function requireGlobalAdmin() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, status: 401, error: "Unauthorized" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.is_admin) {
    return { ok: false as const, status: 403, error: "Forbidden" };
  }
  return { ok: true as const };
}

function getServerRoot() {
  return path.parse(process.cwd()).root;
}

function getBrowserRoot(scope: BrowserScope) {
  if (scope === "server") return getServerRoot();
  return path.resolve(process.env.AIO_FILE_BROWSER_ROOT || getServerRoot());
}

function parseScope(rawScope: string | null): BrowserScope {
  return rawScope === "server" ? "server" : "configured";
}

function toDisplayPath(absPath: string, root: string) {
  const relative = path.relative(root, absPath).replaceAll(path.sep, "/");
  return relative ? `/${relative}` : "/";
}

function toServerPath(absPath: string) {
  return absPath.replaceAll(path.sep, "/");
}

function resolveRequestedPath(rawPath: string | null, scope: BrowserScope) {
  const root = getBrowserRoot(scope);
  const requestPath = (rawPath || "/").replaceAll("\\", "/");
  const relative = requestPath.replace(/^\/+/, "");
  const absPath = path.resolve(root, relative);
  const rel = path.relative(root, absPath);

  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error("Path escapes configured root");
  }

  return { root, absPath, displayPath: toDisplayPath(absPath, root) };
}

async function isInsideRootByRealPath(absPath: string, root: string) {
  const [realTarget, realRoot] = await Promise.all([
    realpath(absPath),
    realpath(root),
  ]);
  const rel = path.relative(realRoot, realTarget);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

async function canRead(absPath: string) {
  try {
    await access(absPath, fsConstants.R_OK);
    return true;
  } catch {
    return false;
  }
}

async function readDirectory(root: string, absPath: string) {
  const rows = await readdir(absPath, { withFileTypes: true });
  const entries = await Promise.all(
    rows.map(async (row): Promise<FileEntry> => {
      const entryPath = path.join(absPath, row.name);
      const info = await lstat(entryPath).catch(() => null);
      const type = row.isSymbolicLink()
        ? "symlink"
        : row.isDirectory()
          ? "directory"
          : row.isFile()
            ? "file"
            : "other";

      return {
        name: row.name,
        path: toDisplayPath(entryPath, root),
        serverPath: toServerPath(entryPath),
        type,
        size: info?.isFile() ? info.size : null,
        modifiedAt: info?.mtime ? info.mtime.toISOString() : null,
        readable: await canRead(entryPath),
      };
    }),
  );

  return entries.sort((a, b) => {
    if (a.type === "directory" && b.type !== "directory") return -1;
    if (a.type !== "directory" && b.type === "directory") return 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });
}

function looksTextual(buffer: Buffer) {
  if (buffer.includes(0)) return false;
  return true;
}

function normalizeExtension(rawExtension: string | null) {
  let extension = (rawExtension || ".md").trim().toLowerCase();
  if (!extension) extension = ".md";
  if (!extension.startsWith(".")) extension = `.${extension}`;
  if (!/^\.[a-z0-9][a-z0-9._-]{0,31}$/i.test(extension)) {
    throw new Error("Invalid extension filter");
  }
  return extension;
}

function shouldSkipSearchDirectory(absPath: string) {
  if (process.platform === "win32") return false;
  return VIRTUAL_SEARCH_DIRS.has(toServerPath(path.resolve(absPath)));
}

async function searchFilesByExtension(
  root: string,
  startAbsPath: string,
  extension: string,
) {
  const entries: FileEntry[] = [];
  const pending = [startAbsPath];
  let searchedDirectories = 0;
  let skippedDirectories = 0;
  let truncated = false;

  while (pending.length > 0) {
    const directoryPath = pending.shift()!;
    if (shouldSkipSearchDirectory(directoryPath)) {
      skippedDirectories += 1;
      continue;
    }

    let rows;
    try {
      rows = await readdir(directoryPath, { withFileTypes: true });
      searchedDirectories += 1;
    } catch {
      skippedDirectories += 1;
      continue;
    }

    rows.sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
    );

    for (const row of rows) {
      const entryPath = path.join(directoryPath, row.name);
      if (row.isSymbolicLink()) continue;

      if (row.isDirectory()) {
        pending.push(entryPath);
        continue;
      }

      if (!row.isFile() || path.extname(row.name).toLowerCase() !== extension) {
        continue;
      }

      const info = await lstat(entryPath).catch(() => null);
      if (!info?.isFile()) continue;

      entries.push({
        name: row.name,
        path: toDisplayPath(entryPath, root),
        serverPath: toServerPath(entryPath),
        type: "file",
        size: info.size,
        modifiedAt: info.mtime.toISOString(),
        readable: await canRead(entryPath),
      });

      if (entries.length >= MAX_SEARCH_RESULTS) {
        truncated = true;
        break;
      }
    }

    if (truncated) break;
  }

  entries.sort((a, b) =>
    a.serverPath.localeCompare(b.serverPath, undefined, {
      sensitivity: "base",
    }),
  );

  return {
    entries,
    searchedDirectories,
    skippedDirectories,
    truncated,
  };
}

export async function GET(req: Request) {
  const admin = await requireGlobalAdmin();
  if (!admin.ok) {
    return NextResponse.json({ error: admin.error }, { status: admin.status });
  }

  const url = new URL(req.url);
  const mode = url.searchParams.get("mode") || "list";
  const scope = parseScope(url.searchParams.get("scope"));

  let resolved: ReturnType<typeof resolveRequestedPath>;
  try {
    resolved = resolveRequestedPath(url.searchParams.get("path"), scope);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid path" },
      { status: 400 },
    );
  }

  const { root, absPath, displayPath } = resolved;
  const info = await stat(absPath).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  if (!info) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!(await isInsideRootByRealPath(absPath, root))) {
    return NextResponse.json(
      { error: "Path escapes configured root" },
      { status: 400 },
    );
  }

  if (mode === "download") {
    if (!info.isFile()) {
      return NextResponse.json(
        { error: "Only files can be downloaded" },
        { status: 400 },
      );
    }
    const bytes = await readFile(absPath);
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "content-type": "application/octet-stream",
        "content-disposition": `attachment; filename="${path.basename(absPath).replaceAll('"', "")}"`,
      },
    });
  }

  if (mode === "read") {
    if (!info.isFile()) {
      return NextResponse.json(
        { error: "Only files can be previewed" },
        { status: 400 },
      );
    }
    if (info.size > MAX_PREVIEW_BYTES) {
      return NextResponse.json(
        {
          error: "File is larger than the preview limit",
          path: displayPath,
          size: info.size,
          maxPreviewBytes: MAX_PREVIEW_BYTES,
        },
        { status: 413 },
      );
    }

    const bytes = await readFile(absPath);
    if (!looksTextual(bytes)) {
      return NextResponse.json(
        {
          error: "Binary files are only available as download",
          path: displayPath,
        },
        { status: 415 },
      );
    }

    return NextResponse.json({
      scope,
      path: displayPath,
      serverPath: toServerPath(absPath),
      size: info.size,
      modifiedAt: info.mtime.toISOString(),
      content: bytes.toString("utf8"),
    });
  }

  if (mode === "search") {
    if (!info.isDirectory()) {
      return NextResponse.json(
        { error: "Path is not a directory" },
        { status: 400 },
      );
    }

    let extension: string;
    try {
      extension = normalizeExtension(url.searchParams.get("extension"));
    } catch (error) {
      return NextResponse.json(
        {
          error:
            error instanceof Error ? error.message : "Invalid extension filter",
        },
        { status: 400 },
      );
    }

    const startedAt = Date.now();
    const result = await searchFilesByExtension(root, absPath, extension);
    return NextResponse.json({
      scope,
      root,
      path: displayPath,
      serverPath: toServerPath(absPath),
      extension,
      previewLimitBytes: MAX_PREVIEW_BYTES,
      maxResults: MAX_SEARCH_RESULTS,
      durationMs: Date.now() - startedAt,
      ...result,
    });
  }

  if (!info.isDirectory()) {
    return NextResponse.json(
      { error: "Path is not a directory" },
      { status: 400 },
    );
  }

  const parent =
    displayPath === "/" ? null : toDisplayPath(path.dirname(absPath), root);
  const entries = await readDirectory(root, absPath);
  return NextResponse.json({
    scope,
    root,
    path: displayPath,
    serverPath: toServerPath(absPath),
    parent,
    entries,
    previewLimitBytes: MAX_PREVIEW_BYTES,
  });
}
