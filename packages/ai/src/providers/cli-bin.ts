// Shared CLI binary resolver for the subprocess providers (claude_cli,
// claude-as-MCP-host, openclaw, hermes). Spawned children inherit the
// parent's PATH and systemd units run with a sparse PATH that doesn't
// include common install locations (~/.npm-global/bin, /opt/homebrew/bin,
// etc.) — so spawn("hermes") fails with ENOENT even when the binary is
// installed at a standard path.
//
// Resolution order:
//   1. Explicit env override (e.g. HERMES_BIN, OPENCLAW_BIN, CLAUDE_BIN)
//   2. Common install paths checked with existsSync
//   3. Bare tool name (let the OS try PATH)
//
// Add new candidate paths here as we discover deploys that need them.

import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export function resolveCliBin(toolName: string, envVar: string): string {
  // 1. Explicit override always wins. Operators may pin the path even
  //    when the binary lives in a non-standard place.
  const fromEnv = process.env[envVar];
  if (fromEnv && fromEnv.trim()) return fromEnv.trim();

  // 2. Walk well-known install dirs. Order = popularity on the
  //    deploys we've seen (Linux VPS first, then Mac dev laptops).
  const home = homedir();
  const candidates = [
    // Per-user npm global (Anthropic's claude-code CLI lands here)
    join(home, ".npm-global", "bin", toolName),
    // PEP 668 / pipx user installs
    join(home, ".local", "bin", toolName),
    // Cargo-installed Rust tools (Hermes is Rust)
    join(home, ".cargo", "bin", toolName),
    // Homebrew on Apple Silicon
    `/opt/homebrew/bin/${toolName}`,
    // Linux / Intel-Mac Homebrew
    `/usr/local/bin/${toolName}`,
    // System packages
    `/usr/bin/${toolName}`,
    // Snap (Ubuntu)
    `/snap/bin/${toolName}`,
  ];

  for (const path of candidates) {
    try {
      if (existsSync(path)) return path;
    } catch {
      // EACCES / EPERM on a candidate is fine — try the next one.
    }
  }

  // 3. Bare name. spawn() will look it up on PATH — works in dev
  //    where you ran `pnpm dev` from a shell that has the right env.
  return toolName;
}
