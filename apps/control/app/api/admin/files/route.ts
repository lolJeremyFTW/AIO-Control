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

type FileEntry = {
  name: string;
  path: string;
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

function getBrowserRoot() {
  return path.resolve(process.env.AIO_FILE_BROWSER_ROOT || process.cwd());
}

function toDisplayPath(absPath: string, root: string) {
  const relative = path.relative(root, absPath).replaceAll(path.sep, "/");
  return relative ? `/${relative}` : "/";
}

function resolveRequestedPath(rawPath: string | null) {
  const root = getBrowserRoot();
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

export async function GET(req: Request) {
  const admin = await requireGlobalAdmin();
  if (!admin.ok) {
    return NextResponse.json({ error: admin.error }, { status: admin.status });
  }

  const url = new URL(req.url);
  const mode = url.searchParams.get("mode") || "list";

  let resolved: ReturnType<typeof resolveRequestedPath>;
  try {
    resolved = resolveRequestedPath(url.searchParams.get("path"));
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
      path: displayPath,
      size: info.size,
      modifiedAt: info.mtime.toISOString(),
      content: bytes.toString("utf8"),
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
    root,
    path: displayPath,
    parent,
    entries,
    previewLimitBytes: MAX_PREVIEW_BYTES,
  });
}
