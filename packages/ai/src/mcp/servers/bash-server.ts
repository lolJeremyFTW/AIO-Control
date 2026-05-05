// Bash MCP server — executes shell commands locally on the VPS.
// Dangerous commands are blocked unless the command is prefixed with
// "Approved: " (meaning the user approved it via the ask_followup flow).
//
// Run: node packages/ai/src/mcp/servers/bash-server.js
// (compiled from TypeScript — use tsx in dev, or build for production)

import { spawn } from "node:child_process";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

// ── Dangerous pattern detection ────────────────────────────────────────────────

// Commands that always require approval, even with "Approved:" prefix.
// These are so destructive that even user approval is risky.
const ALWAYS_DANGEROUS_PATTERNS: RegExp[] = [
  /^dd\s+/,                   // dd — direct disk write, no undo
  /^mkfs\./,                  // mkfs — wipe filesystem
  /^shred\./,                 // shred — secure delete
  /^sfdisk\s+/,               // sfdisk — partition table edit
  /^fdisk\s+/,                 // fdisk — partition edit
  /^parted\s+/,               // parted — partition manager
];

// Commands that require approval.
const DANGEROUS_PATTERNS: RegExp[] = [
  /^rm\s+-rf\s+\//,           // rm -rf / — wipe root
  /^rm\s+-rf\s+\/home/,      // rm -rf /home — wipe home dirs
  /^rm\s+-rf\s+\/var/,       // rm -rf /var — wipe var
  /^rm\s+-rf\s+\/usr/,       // rm -rf /usr — wipe usr
  /^rm\s+-rf\s+\/etc/,       // rm -rf /etc — wipe config
  /^rm\s+-rf\s+\/boot/,      // rm -rf /boot — wipe boot
  /^rm\s+-rf\s+\/srv/,       // rm -rf /srv — wipe srv
  /^shutdown\s+/,              // shutdown — power off
  /^reboot\s+/,                // reboot — restart
  /^poweroff\s+/,              // poweroff — power off
  /^halt\s+/,                  // halt — halt
  /^git\s+push\s+.*--force/,  // git push --force — force push
  /^git\s+push\s+.*--all/,    // git push --all — push all
  /^:w!\s*$/,                  // vim :w! — force write (in a pipe)
  /^crontab\s+-r/,            // crontab -r — delete all crons
  /^crontab\s+-r\s+-u\s+\w+/, // crontab -r -u — delete user's crons
  /^systemctl\s+stop\s+(ssh|cron|nginx|apache2|docker)$/,
  /^systemctl\s+disable\s+(ssh|cron|nginx|apache2|docker)$/,
  /^service\s+\w+\s+stop\s+ssh/,
  /^service\s+\w+\s+disable\s+ssh/,
  /^iptables\s+-F/,           // iptables -F — flush all rules
  /^iptables\s+-X/,           // iptables -X — delete chains
  /^iptables\s+-t\s+nat\s+-F/, // flush NAT table
  /^ufw\s+disable/,            // ufw disable — disable firewall
  /^ufw\s+reset/,             // ufw reset — reset firewall
  /^passwd\s+root/,           // passwd root — change root password
  /^userdel\s+/,              // userdel — delete user
  /^deluser\s+/,              // deluser — delete user
  /^groupdel\s+/,             // groupdel — delete group
  /^visudo\s+/,               // visudo — edit sudoers (risky)
];

// Commands that are always safe (read-only / non-destructive)
const ALWAYS_SAFE_PATTERNS: RegExp[] = [
  /^ls\b/, /^ls\s+/,          // ls — list files
  /^ll\b/, /^ll\s+/,         // ll — list (alias)
  /^pwd\b/,                   // pwd — print working dir
  /^cat\b/, /^cat\s+/,        // cat — read file
  /^head\b/, /^head\s+/,      // head — read start
  /^tail\b/, /^tail\s+/,      // tail — read end
  /^grep\b/, /^grep\s+/,      // grep — search
  /^find\b/, /^find\s+/,      // find — search files
  /^which\b/, /^which\s+/,    // which — locate command
  /^type\b/, /^type\s+/,      // type — command type
  /^ps\b/, /^ps\s+/,          // ps — process list
  /^top\b/, /^top\s+/,        // top — process monitor
  /^htop\b/, /^htop\s+/,      // htop — process monitor
  /^df\b/, /^df\s+/,          // df — disk free
  /^du\b/, /^du\s+/,          // du — disk usage
  /^free\b/, /^free\s+/,      // free — memory
  /^uptime\b/,                // uptime — system info
  /^whoami\b/,                // whoami — current user
  /^id\b/,                    // id — user info
  /^uname\b/, /^uname\s+/,    // uname — system info
  /^hostname\b/,               // hostname
  /^date\b/,                  // date
  /^cal\b/, /^cal\s+/,        // cal — calendar
  /^curl\b/, /^curl\s+/,      // curl — HTTP client (read-only)
  /^wget\b/, /^wget\s+/,      // wget — download
  /^ping\b/, /^ping\s+/,      // ping — network test
  /^nc\s+-z/,                 // nc -z — port scan (quick)
  /^netstat\b/, /^netstat\s+/, // netstat — network stats
  /^ss\b/, /^ss\s+/,          // ss — socket stats
  /^ip\s+addr/,               // ip addr — show IPs
  /^ip\s+route/,              // ip route — show routes
  /^iptables\s+-L/,           // iptables -L — list rules (safe)
  /^iptables\s+-S/,           // iptables -S — list rules (safe)
  /^ufw\s+status/,           // ufw status (safe)
  /^systemctl\s+status/,      // systemctl status (safe)
  /^systemctl\s+list-units/,  // systemctl list-units (safe)
  /^service\s+\w+\s+status/,  // service status (safe)
  /^git\s+status/,           // git status (safe)
  /^git\s+log/,              // git log (safe)
  /^git\s+diff/,             // git diff (safe)
  /^git\s+show/,             // git show (safe)
  /^git\s+branch/,           // git branch (safe)
  /^git\s+tag/,              // git tag (safe)
  /^git\s+stash/,            // git stash (safe)
  /^git\s+remote\s+-v/,     // git remote -v (safe)
  /^crontab\s+-l/,          // crontab -l — list crons (safe)
  /^crontab\s+-e/,          // crontab -e — edit crons (safe, user initiated)
  /^ls\s+-la/,               // ls -la (safe)
  /^stat\b/, /^stat\s+/,     // stat — file info
  /^file\b/, /^file\s+/,     // file — file type
  /^wc\b/, /^wc\s+/,         // wc — word count
  /^diff\b/, /^diff\s+/,     // diff — compare
  /^sort\b/, /^sort\s+/,     // sort — sort
  /^awk\b/, /^awk\s+/,       // awk — text processing
  /^sed\b/, /^sed\s+/,      // sed — stream editor (read ops)
  /^cut\b/, /^cut\s+/,      // cut — cut columns
  /^tr\b/, /^tr\s+/,        // tr — translate
  /^base64\b/, /^base64\s+/, // base64 encode/decode
  /^md5sum\b/, /^md5sum\s+/, // md5sum — hash
  /^sha256sum\b/, /^sha256sum\s+/, // sha256sum — hash
  /^tar\s+-tf/,             // tar -tf — list archive (safe)
  /^zipinfo\b/, /^zipinfo\s+/, // zipinfo — list zip
  /^uname\s+-a/,            // uname -a (safe)
  /^uptime\s+-s/,          // uptime -s (safe)
];

function hasShellControl(cmd: string): boolean {
  return /[;&|<>`]/.test(cmd) || /\$\s*\(/.test(cmd);
}

function hasApprovalToken(token: unknown): boolean {
  const expected = process.env.AIO_BASH_APPROVAL_TOKEN;
  return typeof expected === "string" && expected.length > 0 && token === expected;
}

function isCommandDangerous(cmd: string): { dangerous: boolean; pattern?: string; always?: boolean } {
  const trimmed = cmd.trim();

  for (const pattern of ALWAYS_DANGEROUS_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { dangerous: true, pattern: pattern.source, always: true };
    }
  }

  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { dangerous: true, pattern: pattern.source };
    }
  }

  if (hasShellControl(trimmed)) {
    return { dangerous: true, pattern: "shell-control-operator" };
  }

  return { dangerous: false };
}

function isCommandAlwaysSafe(cmd: string): boolean {
  const trimmed = cmd.trim();
  if (hasShellControl(trimmed)) return false;
  for (const pattern of ALWAYS_SAFE_PATTERNS) {
    if (pattern.test(trimmed)) return true;
  }
  return false;
}

// ── Bash execution ──────────────────────────────────────────────────────────────

function executeBash(command: string): Promise<string> {
  return new Promise((resolve) => {
    const child = spawn("bash", ["-c", command], {
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 60_000, // 60 second timeout
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data: Buffer) => {
      stdout += data.toString();
      // Cap output at 100KB to prevent memory issues
      if (stdout.length > 100_000) {
        child.kill("SIGKILL");
        stdout += "\n[output truncated at 100KB]";
      }
    });

    child.stderr.on("data", (data: Buffer) => {
      stderr += data.toString();
      if (stderr.length > 50_000) {
        stderr = stderr.slice(0, 50_000) + "\n[stderr truncated]";
      }
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout || "(no output)");
      } else {
        resolve(`[exit ${code}]${stderr ? "\n" + stderr : ""}${stdout ? "\n" + stdout : ""}`.trim());
      }
    });

    child.on("error", (err) => {
      resolve(`[error] ${err.message}`);
    });
  });
}

// ── MCP Server ────────────────────────────────────────────────────────────────

const server = new Server(
  { name: "aio-control-bash", version: "1.0.0" },
  { capabilities: { tools: {} } },
);

const BASH_TOOL_SCHEMA = {
  type: "object",
  properties: {
    command: {
      type: "string",
      description: "The bash command to execute on the VPS.",
    },
    approval_token: {
      type: "string",
      description:
        "Required only for dangerous commands; must match AIO_BASH_APPROVAL_TOKEN.",
    },
  },
  required: ["command"],
  additionalProperties: false,
};

const BASH_TOOL_DESCRIPTION =
  "Execute a bash command on the VPS. Dangerous commands (rm -rf, shutdown, dd, etc.) require user approval unless the command is prefixed with 'Approved: '.";

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "execute_code",
      description: BASH_TOOL_DESCRIPTION,
      inputSchema: BASH_TOOL_SCHEMA,
    },
    {
      name: "cli_tool",
      description: BASH_TOOL_DESCRIPTION,
      inputSchema: BASH_TOOL_SCHEMA,
    },
    {
      name: "bash",
      description: BASH_TOOL_DESCRIPTION,
      inputSchema: BASH_TOOL_SCHEMA,
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params as {
    name: string;
    arguments: { command?: string; approval_token?: string };
  };

  if (name !== "bash" && name !== "execute_code" && name !== "cli_tool") {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ error: "unknown_tool", name }),
        },
      ],
    };
  }

  const command = args?.command ?? "";

  if (!command) {
    return {
      content: [{ type: "text", text: JSON.stringify({ error: "missing_command" }) }],
    };
  }

  // Always safe commands — execute immediately
  if (isCommandAlwaysSafe(command)) {
    const result = await executeBash(command);
    return { content: [{ type: "text", text: result }] };
  }

  // Check if it's dangerous
  const { dangerous, pattern, always } = isCommandDangerous(command);

  if (dangerous) {
    if (!always && hasApprovalToken(args?.approval_token)) {
      const result = await executeBash(command);
      return { content: [{ type: "text", text: result }] };
    }

    // If it's always dangerous (dd, mkfs, etc.) — even approval can't save it
    if (always) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              error: "command_blocked",
              reason: `This command is always blocked: ${pattern}`,
              message:
                "This command is too dangerous to execute even with approval. If you need to perform this action, please use a direct SSH session.",
            }),
          },
        ],
      };
    }

    // Regular dangerous — needs approval
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            danger: true,
            command,
            pattern,
            message:
              `Dangerous command detected: ${command}\n\n` +
              "This command requires an approval_token that matches AIO_BASH_APPROVAL_TOKEN.",
            approval_required: true,
            token_required: true,
          }),
        },
      ],
    };
  }

  // Safe command — execute
  const result = await executeBash(command);
  return { content: [{ type: "text", text: result }] };
});

// ── Main ──────────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
server.connect(transport).catch((err) => {
  console.error("[bash-mcp] Fatal connection error:", err);
  process.exit(1);
});
