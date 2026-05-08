"use client";

import { type CSSProperties, type ReactNode, useMemo, useState } from "react";

import { CopyIcon, ExternalLinkIcon } from "@aio/ui/icon";

type Props = {
  publicOrigin: string;
  workspaceSlug: string;
};

type CopyKey =
  | "slackCommands"
  | "slackInteractions"
  | "discordInteractions"
  | "slackManifest"
  | "discordCommand"
  | "discordCurl";

export function ProviderSetupKit({ publicOrigin, workspaceSlug }: Props) {
  const [copied, setCopied] = useState<CopyKey | null>(null);
  const origin = publicOrigin.replace(/\/$/, "");
  const urls = useMemo(
    () => ({
      slackCommands: `${origin}/api/integrations/slack/commands`,
      slackInteractions: `${origin}/api/integrations/slack/interactions`,
      discordInteractions: `${origin}/api/integrations/discord/interactions`,
    }),
    [origin],
  );

  const slackManifest = useMemo(
    () =>
      JSON.stringify(
        {
          display_information: {
            name: "AIO Control",
            description: "Run AIO Control commands and receive run reports.",
          },
          features: {
            bot_user: {
              display_name: "AIO Control",
              always_online: false,
            },
            slash_commands: [
              {
                command: "/aio",
                url: urls.slackCommands,
                description: "Run AIO Control commands.",
                usage_hint: "status | agents | run <name> | queue",
                should_escape: false,
              },
            ],
          },
          oauth_config: {
            scopes: {
              bot: ["chat:write", "commands"],
            },
          },
          settings: {
            interactivity: {
              is_enabled: true,
              request_url: urls.slackInteractions,
            },
            org_deploy_enabled: false,
            socket_mode_enabled: false,
            token_rotation_enabled: false,
          },
        },
        null,
        2,
      ),
    [urls.slackCommands, urls.slackInteractions],
  );

  const discordCommand = useMemo(
    () =>
      JSON.stringify(
        [
          {
            name: "aio",
            description: "Run AIO Control commands.",
            type: 1,
            options: [
              {
                name: "status",
                description: "Workspace status.",
                type: 1,
              },
              {
                name: "agents",
                description: "List agents.",
                type: 1,
              },
              {
                name: "queue",
                description: "List open queue items.",
                type: 1,
              },
              {
                name: "help",
                description: "Show available commands.",
                type: 1,
              },
              {
                name: "run",
                description: "Start an agent by name.",
                type: 1,
                options: [
                  {
                    name: "name",
                    description: "Agent name or substring.",
                    type: 3,
                    required: true,
                  },
                ],
              },
              {
                name: "approve",
                description: "Approve a queue item.",
                type: 1,
                options: [
                  {
                    name: "id",
                    description: "Queue item id or prefix.",
                    type: 3,
                    required: true,
                  },
                ],
              },
              {
                name: "reject",
                description: "Reject a queue item.",
                type: 1,
                options: [
                  {
                    name: "id",
                    description: "Queue item id or prefix.",
                    type: 3,
                    required: true,
                  },
                ],
              },
            ],
          },
        ],
        null,
        2,
      ),
    [],
  );

  const discordCurl = useMemo(
    () =>
      [
        '$env:DISCORD_APP_ID="paste_application_id"',
        '$env:DISCORD_GUILD_ID="paste_guild_id"',
        '$env:DISCORD_BOT_TOKEN="paste_bot_token"',
        "$body = @'",
        discordCommand,
        "'@",
        'curl.exe -X PUT "https://discord.com/api/v10/applications/$env:DISCORD_APP_ID/guilds/$env:DISCORD_GUILD_ID/commands" -H "Authorization: Bot $env:DISCORD_BOT_TOKEN" -H "Content-Type: application/json" --data-binary $body',
      ].join("\n"),
    [discordCommand],
  );

  const copy = async (key: CopyKey, value: string) => {
    await navigator.clipboard.writeText(value);
    setCopied(key);
    window.setTimeout(() => setCopied(null), 1400);
  };

  return (
    <div style={shell}>
      <div style={topRow}>
        <div>
          <div style={eyebrow}>Provider setup kit</div>
          <p style={intro}>
            These artifacts work before tokens exist. Create the provider apps,
            then paste the generated tokens into API Keys and add a channel
            target below.
          </p>
        </div>
        <a
          href={`/${workspaceSlug}/settings/api-keys`}
          style={linkButton}
          aria-label="Open API Keys"
        >
          API Keys
          <ExternalLinkIcon />
        </a>
      </div>

      <div style={grid}>
        <SetupColumn
          title="Slack"
          steps={[
            "Create a Slack app from the manifest.",
            "Install it to the workspace.",
            "Save slack_bot_token and slack_signing_secret in API Keys.",
            "Create a Slack target below with the channel_id.",
          ]}
          links={[
            {
              label: "Slack app page",
              href: "https://api.slack.com/apps?new_app=1",
            },
          ]}
        >
          <CopyRow
            label="Slash command URL"
            value={urls.slackCommands}
            copied={copied === "slackCommands"}
            onCopy={() => copy("slackCommands", urls.slackCommands)}
          />
          <CopyRow
            label="Interactivity URL"
            value={urls.slackInteractions}
            copied={copied === "slackInteractions"}
            onCopy={() => copy("slackInteractions", urls.slackInteractions)}
          />
          <CodeBlock
            label="Slack app manifest"
            value={slackManifest}
            copied={copied === "slackManifest"}
            onCopy={() => copy("slackManifest", slackManifest)}
          />
        </SetupColumn>

        <SetupColumn
          title="Discord"
          steps={[
            "Create a Discord application and bot.",
            "Save discord_public_key and discord_bot_token in API Keys.",
            "Set the Interactions Endpoint URL.",
            "Register the guild command, then create a Discord target below.",
          ]}
          links={[
            {
              label: "Discord developer portal",
              href: "https://discord.com/developers/applications",
            },
          ]}
        >
          <CopyRow
            label="Interactions URL"
            value={urls.discordInteractions}
            copied={copied === "discordInteractions"}
            onCopy={() => copy("discordInteractions", urls.discordInteractions)}
          />
          <CodeBlock
            label="Discord guild command JSON"
            value={discordCommand}
            copied={copied === "discordCommand"}
            onCopy={() => copy("discordCommand", discordCommand)}
          />
          <CodeBlock
            label="PowerShell command registration"
            value={discordCurl}
            copied={copied === "discordCurl"}
            onCopy={() => copy("discordCurl", discordCurl)}
          />
        </SetupColumn>
      </div>

      <p style={note}>
        Webhook-only mode can be used for outbound reports without bot tokens:
        save the webhook URL as a custom API Key secret, then create a target
        below in Webhook URL secret mode. Commands and buttons require bot/app
        credentials.
      </p>
    </div>
  );
}

function SetupColumn({
  title,
  steps,
  links,
  children,
}: {
  title: string;
  steps: string[];
  links: Array<{ label: string; href: string }>;
  children: ReactNode;
}) {
  return (
    <section style={column}>
      <div style={columnHead}>
        <h4 style={heading}>{title}</h4>
        {links.map((link) => (
          <a
            key={link.href}
            href={link.href}
            target="_blank"
            rel="noreferrer"
            style={externalLink}
          >
            {link.label}
            <ExternalLinkIcon />
          </a>
        ))}
      </div>
      <ol style={stepsList}>
        {steps.map((step) => (
          <li key={step} style={stepItem}>
            {step}
          </li>
        ))}
      </ol>
      <div style={stack}>{children}</div>
    </section>
  );
}

function CopyRow({
  label,
  value,
  copied,
  onCopy,
}: {
  label: string;
  value: string;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <div style={copyRow}>
      <div style={{ minWidth: 0 }}>
        <div style={labelStyle}>{label}</div>
        <code style={inlineCode}>{value}</code>
      </div>
      <button type="button" onClick={onCopy} style={iconButton}>
        <CopyIcon />
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

function CodeBlock({
  label,
  value,
  copied,
  onCopy,
}: {
  label: string;
  value: string;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <div style={codeShell}>
      <div style={codeHead}>
        <span style={labelStyle}>{label}</span>
        <button type="button" onClick={onCopy} style={iconButton}>
          <CopyIcon />
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre style={pre}>{value}</pre>
    </div>
  );
}

const shell: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 14,
  paddingBottom: 18,
  marginBottom: 18,
  borderBottom: "1px solid var(--app-border-2)",
};

const topRow: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 12,
  flexWrap: "wrap",
};

const eyebrow: CSSProperties = {
  fontSize: 12,
  fontWeight: 800,
  color: "var(--app-fg)",
};

const intro: CSSProperties = {
  margin: "4px 0 0",
  maxWidth: 760,
  color: "var(--app-fg-3)",
  fontSize: 12.5,
  lineHeight: 1.5,
};

const grid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
  gap: 12,
};

const column: CSSProperties = {
  border: "1px solid var(--app-border)",
  borderRadius: 8,
  padding: 12,
  background: "var(--app-card-2)",
  minWidth: 0,
};

const columnHead: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
  flexWrap: "wrap",
};

const heading: CSSProperties = {
  margin: 0,
  fontSize: 14,
  fontWeight: 800,
};

const stepsList: CSSProperties = {
  margin: "10px 0 12px",
  paddingLeft: 18,
  color: "var(--app-fg-2)",
  fontSize: 12,
  lineHeight: 1.5,
};

const stepItem: CSSProperties = {
  marginBottom: 2,
};

const stack: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
};

const copyRow: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) auto",
  gap: 8,
  alignItems: "center",
  padding: 8,
  border: "1px solid var(--app-border-2)",
  borderRadius: 8,
  background: "var(--app-card)",
};

const codeShell: CSSProperties = {
  border: "1px solid var(--app-border-2)",
  borderRadius: 8,
  overflow: "hidden",
  background: "var(--app-card)",
};

const codeHead: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 8,
  padding: "7px 8px",
  borderBottom: "1px solid var(--app-border-2)",
};

const labelStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 800,
  color: "var(--app-fg-2)",
};

const inlineCode: CSSProperties = {
  display: "block",
  marginTop: 3,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  fontSize: 11.5,
  color: "var(--app-fg)",
};

const pre: CSSProperties = {
  margin: 0,
  maxHeight: 260,
  overflow: "auto",
  padding: 10,
  fontSize: 11,
  lineHeight: 1.45,
  color: "var(--app-fg)",
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
};

const iconButton: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  border: "1px solid var(--app-border)",
  background: "transparent",
  color: "var(--app-fg-2)",
  borderRadius: 8,
  padding: "5px 8px",
  fontSize: 11,
  fontWeight: 700,
  cursor: "pointer",
  flexShrink: 0,
};

const linkButton: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  border: "1px solid var(--app-border)",
  background: "var(--app-card-2)",
  color: "var(--app-fg)",
  borderRadius: 8,
  padding: "7px 10px",
  fontSize: 12,
  fontWeight: 800,
  textDecoration: "none",
};

const externalLink: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  color: "var(--app-fg-2)",
  fontSize: 11.5,
  fontWeight: 700,
  textDecoration: "none",
};

const note: CSSProperties = {
  margin: 0,
  color: "var(--app-fg-3)",
  fontSize: 12,
  lineHeight: 1.5,
};
