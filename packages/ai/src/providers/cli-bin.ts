// Shared CLI binary resolver for the subprocess providers (claude_cli,
// claude-as-MCP-host, openclaw, hermes). Spawned children inherit the
// parent's PATH and systemd units run with a sparse PATH that doesn't
// include common install locations (~/.npm-global/bin, /opt/homebrew/bin,
// etc.) — so spawn("hermes") fails with ENOENT even when the binary is
// installed at a standard path.
//
// Resolution order:
//   1. Explicit env override (e.g. HERMES_BIN, OPENCLAW_BIN, CLAUDE_BIN)
//   2. Bare tool name with a PATH augmented by withCliBinPath()
//
// Keep this resolver free of fs.existsSync/stat calls. Next/Turbopack's
// output file tracing treats dynamic filesystem probes as broad reads and can
// drag files like next.config.mjs into unrelated app-route traces.

import { homedir } from "node:os";

export function resolveCliBin(toolName: string, envVar: string): string {
  // 1. Explicit override always wins. Operators may pin the path even
  //    when the binary lives in a non-standard place.
  const fromEnv = process.env[envVar];
  if (fromEnv && fromEnv.trim()) return fromEnv.trim();

  // 2. Bare name. spawn() will look it up on PATH. Callers should pass
  //    env: withCliBinPath(...) so sparse service environments still see
  //    standard CLI install directories.
  return toolName;
}

export function withCliBinPath(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const key = process.platform === "win32" ? "Path" : "PATH";
  const current = env[key] ?? env.PATH ?? env.Path ?? "";
  const separator = process.platform === "win32" ? ";" : ":";
  const normalize =
    process.platform === "win32"
      ? (value: string) => value.toLowerCase()
      : (value: string) => value;
  const seen = new Set(current.split(separator).filter(Boolean).map(normalize));
  const additions = commonCliBinDirs().filter((dir) => {
    const normalized = normalize(dir);
    if (seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
  const nextPath = [...additions, current].filter(Boolean).join(separator);
  return {
    ...env,
    [key]: nextPath,
  };
}

function commonCliBinDirs(): string[] {
  // Order = popularity on the deploys we've seen (Linux VPS first, then Mac
  // dev laptops). Non-existent entries are harmless in PATH.
  const home = homedir();
  return [
    // Per-user npm global (Anthropic's claude-code CLI lands here)
    hostPath(home, ".npm-global", "bin"),
    // PEP 668 / pipx user installs
    hostPath(home, ".local", "bin"),
    // Cargo-installed Rust tools
    hostPath(home, ".cargo", "bin"),
    // Hermes-specific install layouts. The official installer drops
    // it under <home>/.hermes/hermes-agent/{venv/bin,bin} or as a
    // bare script at the project root. We check both.
    hostPath(home, ".hermes", "hermes-agent", "venv", "bin"),
    hostPath(home, ".hermes", "hermes-agent", "bin"),
    hostPath(home, ".hermes", "hermes-agent"),
    // Homebrew on Apple Silicon
    "/opt/homebrew/bin",
    // Linux / Intel-Mac Homebrew
    "/usr/local/bin",
    // System packages
    "/usr/bin",
    // Snap (Ubuntu)
    "/snap/bin",
  ];
}

function hostPath(root: string, ...parts: string[]): string {
  return [root.replace(/[\\/]+$/, ""), ...parts].join("/");
}
