"use client";

import Link from "next/link";
import { type CSSProperties, type ReactNode, useMemo, useState } from "react";

import { CopyIcon, ExternalLinkIcon } from "@aio/ui/icon";

type ProviderId = "telegram" | "slack" | "discord";

type CredentialId =
  | "telegram"
  | "telegram_webhook_secret"
  | "slack_bot_token"
  | "slack_signing_secret"
  | "discord_bot_token"
  | "discord_public_key";

type CopyKey =
  | "telegramWebhook"
  | "telegramSetWebhook"
  | "telegramGetUpdates"
  | "slackCommands"
  | "slackInteractions"
  | "slackManifest"
  | "discordInteractions"
  | "discordCommand"
  | "discordCurl";

export type ProviderSetupStatus = {
  credentials: Record<CredentialId, boolean>;
  targets: Record<ProviderId, number>;
};

type Props = {
  publicOrigin: string;
  workspaceSlug: string;
  setupStatus: ProviderSetupStatus;
  initialProvider?: ProviderId;
  visibleProviders?: ProviderId[];
};

type CredentialSpec = {
  id: CredentialId;
  label: string;
  optional?: boolean;
};

type ProviderSpec = {
  id: ProviderId;
  title: string;
  summary: string;
  dashboardHref: string;
  dashboardLabel: string;
  targetHref: string;
  targetLabel: string;
  credentials: CredentialSpec[];
};

const PROVIDERS: ProviderSpec[] = [
  {
    id: "telegram",
    title: "Telegram",
    summary:
      "BotFather bot, group chat_id, optional forum topics, and inbound webhook commands.",
    dashboardHref: "https://t.me/BotFather",
    dashboardLabel: "Open BotFather",
    targetHref: "/settings/notifications#telegram",
    targetLabel: "Open Telegram targets",
    credentials: [
      { id: "telegram", label: "Telegram bot token" },
      {
        id: "telegram_webhook_secret",
        label: "TELEGRAM_WEBHOOK_SECRET",
        optional: true,
      },
    ],
  },
  {
    id: "slack",
    title: "Slack",
    summary:
      "Slack app manifest, slash command URL, interactivity URL, and channel targets.",
    dashboardHref: "https://api.slack.com/apps?new_app=1",
    dashboardLabel: "Open Slack apps",
    targetHref: "/settings/notifications#channels",
    targetLabel: "Open Slack targets",
    credentials: [
      { id: "slack_bot_token", label: "Slack bot token" },
      { id: "slack_signing_secret", label: "Slack signing secret" },
    ],
  },
  {
    id: "discord",
    title: "Discord",
    summary:
      "Discord application, public key verification, bot token, command registration, and channel targets.",
    dashboardHref: "https://discord.com/developers/applications",
    dashboardLabel: "Open Discord apps",
    targetHref: "/settings/notifications#channels",
    targetLabel: "Open Discord targets",
    credentials: [
      { id: "discord_bot_token", label: "Discord bot token" },
      { id: "discord_public_key", label: "Discord public key" },
    ],
  },
];

export function ProviderSetupKit({
  publicOrigin,
  workspaceSlug,
  setupStatus,
  initialProvider = "telegram",
  visibleProviders,
}: Props) {
  const [copied, setCopied] = useState<CopyKey | null>(null);
  const fallbackProvider = PROVIDERS[0]!;
  const providerList = PROVIDERS.filter(
    (provider) => !visibleProviders || visibleProviders.includes(provider.id),
  );
  const firstProvider = providerList[0]?.id ?? fallbackProvider.id;
  const [active, setActive] = useState<ProviderId>(
    providerList.some((provider) => provider.id === initialProvider)
      ? initialProvider
      : firstProvider,
  );
  const activeProvider =
    providerList.find((provider) => provider.id === active) ??
    providerList[0] ??
    fallbackProvider;

  const origin = publicOrigin.replace(/\/$/, "");
  const urls = useMemo(
    () => ({
      telegramWebhook: `${origin}/api/integrations/telegram/webhook?secret=paste_telegram_webhook_secret`,
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

  const telegramSetWebhook = useMemo(
    () =>
      [
        '$env:TELEGRAM_BOT_TOKEN="paste_bot_token"',
        '$env:TELEGRAM_WEBHOOK_SECRET="paste_webhook_secret"',
        `curl.exe -F "url=${origin}/api/integrations/telegram/webhook?secret=$env:TELEGRAM_WEBHOOK_SECRET" "https://api.telegram.org/bot$($env:TELEGRAM_BOT_TOKEN)/setWebhook"`,
      ].join("\n"),
    [origin],
  );

  const telegramGetUpdates = [
    '$env:TELEGRAM_BOT_TOKEN="paste_bot_token"',
    'curl.exe "https://api.telegram.org/bot$($env:TELEGRAM_BOT_TOKEN)/getUpdates"',
  ].join("\n");

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

  const missingRequired = missingCredentials(activeProvider, setupStatus);
  const credentialsReady = missingRequired.length === 0;
  const targetCount = setupStatus.targets[activeProvider.id] ?? 0;
  const hasTarget = targetCount > 0;
  const externalStepState = credentialsReady ? "manual" : "active";
  const targetStepState = hasTarget
    ? "done"
    : credentialsReady
      ? "active"
      : "waiting";
  const testStepState = credentialsReady && hasTarget ? "active" : "waiting";

  return (
    <div style={shell}>
      <div style={topRow}>
        <div>
          <div style={eyebrow}>Channel setup flow</div>
          <p style={intro}>
            Start with a provider, save the required secrets, paste the callback
            URLs in the provider dashboard, add a channel target, then send a
            test message.
          </p>
        </div>
        <Link
          href={`/${workspaceSlug}/settings/ai#api-keys`}
          style={linkButton}
          aria-label="Open API Keys"
        >
          API Keys
          <ExternalLinkIcon />
        </Link>
      </div>

      {providerList.length > 1 && (
        <div role="tablist" aria-label="Provider setup" style={tabs}>
          {providerList.map((provider) => {
            const summary = providerSummary(provider, setupStatus);
            const selected = activeProvider.id === provider.id;
            return (
              <button
                key={provider.id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setActive(provider.id)}
                style={tabButton(selected)}
              >
                <span>{provider.title}</span>
                <span style={statusPill(summary.tone)}>{summary.label}</span>
              </button>
            );
          })}
        </div>
      )}

      <section style={flowShell}>
        <div style={flowHeader}>
          <div>
            <h3 style={flowTitle}>{activeProvider.title}</h3>
            <p style={flowSummary}>{activeProvider.summary}</p>
          </div>
          <div style={metricRow}>
            <StatusMetric
              label="Secrets"
              value={
                credentialsReady ? "Set" : `${missingRequired.length} missing`
              }
              tone={credentialsReady ? "good" : "warn"}
            />
            <StatusMetric
              label="Targets"
              value={String(targetCount)}
              tone={hasTarget ? "good" : "warn"}
            />
          </div>
        </div>

        <div style={stepsGrid}>
          <SetupStep
            number={1}
            title="Create provider app"
            state={externalStepState}
          >
            <p style={stepText}>{providerCreateText(activeProvider.id)}</p>
            <a
              href={activeProvider.dashboardHref}
              target="_blank"
              rel="noreferrer"
              style={externalButton}
            >
              {activeProvider.dashboardLabel}
              <ExternalLinkIcon />
            </a>
          </SetupStep>

          <SetupStep
            number={2}
            title="Save secrets"
            state={credentialsReady ? "done" : "active"}
          >
            <CredentialList
              credentials={activeProvider.credentials}
              status={setupStatus.credentials}
            />
            <Link
              href={`/${workspaceSlug}/settings/ai#api-keys`}
              style={inlineLink}
            >
              Save or replace secrets
              <ExternalLinkIcon />
            </Link>
          </SetupStep>

          <SetupStep number={3} title="Connect callbacks" state="manual">
            {activeProvider.id === "telegram" && (
              <div style={stack}>
                <CopyRow
                  label="Webhook URL"
                  value={urls.telegramWebhook}
                  copied={copied === "telegramWebhook"}
                  onCopy={() => copy("telegramWebhook", urls.telegramWebhook)}
                />
                <CodeBlock
                  label="Set webhook with PowerShell"
                  value={telegramSetWebhook}
                  copied={copied === "telegramSetWebhook"}
                  onCopy={() => copy("telegramSetWebhook", telegramSetWebhook)}
                />
                <CodeBlock
                  label="Find chat_id after sending a group message"
                  value={telegramGetUpdates}
                  copied={copied === "telegramGetUpdates"}
                  onCopy={() => copy("telegramGetUpdates", telegramGetUpdates)}
                />
              </div>
            )}

            {activeProvider.id === "slack" && (
              <div style={stack}>
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
                  onCopy={() =>
                    copy("slackInteractions", urls.slackInteractions)
                  }
                />
                <CodeBlock
                  label="Slack app manifest"
                  value={slackManifest}
                  copied={copied === "slackManifest"}
                  onCopy={() => copy("slackManifest", slackManifest)}
                />
              </div>
            )}

            {activeProvider.id === "discord" && (
              <div style={stack}>
                <CopyRow
                  label="Interactions Endpoint URL"
                  value={urls.discordInteractions}
                  copied={copied === "discordInteractions"}
                  onCopy={() =>
                    copy("discordInteractions", urls.discordInteractions)
                  }
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
              </div>
            )}
          </SetupStep>

          <SetupStep number={4} title="Add AIO target" state={targetStepState}>
            <p style={stepText}>{providerTargetText(activeProvider.id)}</p>
            <Link
              href={`/${workspaceSlug}${activeProvider.targetHref}`}
              style={inlineLink}
            >
              {activeProvider.targetLabel}
              <ExternalLinkIcon />
            </Link>
          </SetupStep>

          <SetupStep number={5} title="Send test" state={testStepState}>
            <p style={stepText}>
              Use the Test button on the saved target. Provider dashboards are
              external, so this app can verify the AIO send path and signature
              handling, but not whether every dashboard field was pasted.
            </p>
          </SetupStep>
        </div>
      </section>
    </div>
  );
}

function providerSummary(
  provider: ProviderSpec,
  status: ProviderSetupStatus,
): { label: string; tone: "good" | "warn" | "muted" } {
  const missing = missingCredentials(provider, status);
  const hasTarget = (status.targets[provider.id] ?? 0) > 0;
  if (missing.length === 0 && hasTarget) {
    if (
      provider.id === "telegram" &&
      !status.credentials.telegram_webhook_secret
    ) {
      return { label: "Outbound ready", tone: "good" };
    }
    return { label: "Ready", tone: "good" };
  }
  if (missing.length > 0) return { label: "Needs secrets", tone: "warn" };
  if (!hasTarget) return { label: "Needs target", tone: "warn" };
  return { label: "Manual check", tone: "muted" };
}

function missingCredentials(
  provider: ProviderSpec,
  status: ProviderSetupStatus,
) {
  return provider.credentials.filter(
    (credential) => !credential.optional && !status.credentials[credential.id],
  );
}

function providerCreateText(provider: ProviderId) {
  if (provider === "telegram") {
    return "Create a bot in BotFather, add it to your group, and make it admin when you want topics or commands.";
  }
  if (provider === "slack") {
    return "Create a Slack app from the manifest, install it to the workspace, then copy the bot token and signing secret.";
  }
  return "Create a Discord application, add a bot, copy the public key, then invite the bot to the server.";
}

function providerTargetText(provider: ProviderId) {
  if (provider === "telegram") {
    return "Create a Telegram target with the group chat_id and optional topic_id. Use workspace scope as the default route.";
  }
  if (provider === "slack") {
    return "Create a Slack target with the channel_id, or use a webhook secret for outbound-only reports.";
  }
  return "Create a Discord target with the channel_id, or use a webhook secret for outbound-only reports.";
}

function SetupStep({
  number,
  title,
  state,
  children,
}: {
  number: number;
  title: string;
  state: "done" | "active" | "waiting" | "manual";
  children: ReactNode;
}) {
  return (
    <section style={stepShell}>
      <div style={stepHead}>
        <div style={stepNumber(state)}>{number}</div>
        <div>
          <h4 style={stepTitle}>{title}</h4>
          <div style={stepStateText(state)}>{stateLabel(state)}</div>
        </div>
      </div>
      <div style={stepBody}>{children}</div>
    </section>
  );
}

function stateLabel(state: "done" | "active" | "waiting" | "manual") {
  if (state === "done") return "Done";
  if (state === "active") return "Next";
  if (state === "waiting") return "Waiting";
  return "Manual";
}

function StatusMetric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "good" | "warn";
}) {
  return (
    <div style={metric}>
      <span style={metricLabel}>{label}</span>
      <span style={metricValue(tone)}>{value}</span>
    </div>
  );
}

function CredentialList({
  credentials,
  status,
}: {
  credentials: CredentialSpec[];
  status: ProviderSetupStatus["credentials"];
}) {
  return (
    <div style={credentialList}>
      {credentials.map((credential) => {
        const isSet = status[credential.id];
        return (
          <div key={credential.id} style={credentialRow}>
            <span style={credentialName}>{credential.label}</span>
            <span style={credentialState(isSet, credential.optional)}>
              {isSet ? "Set" : credential.optional ? "Optional" : "Missing"}
            </span>
          </div>
        );
      })}
    </div>
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
      <button type="button" onClick={onCopy} style={copyButton}>
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
        <button type="button" onClick={onCopy} style={copyButton}>
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
  maxWidth: 820,
  color: "var(--app-fg-3)",
  fontSize: 12.5,
  lineHeight: 1.5,
};

const tabs: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
  gap: 8,
};

const tabButton = (selected: boolean): CSSProperties => ({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
  minHeight: 42,
  border: selected
    ? "1.5px solid var(--tt-green)"
    : "1px solid var(--app-border)",
  background: selected ? "rgba(57,178,85,0.10)" : "var(--app-card-2)",
  color: "var(--app-fg)",
  borderRadius: 8,
  padding: "8px 10px",
  fontSize: 13,
  fontWeight: 800,
  cursor: "pointer",
});

const flowShell: CSSProperties = {
  border: "1px solid var(--app-border)",
  borderRadius: 8,
  background: "var(--app-card-2)",
  padding: 12,
};

const flowHeader: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 12,
  flexWrap: "wrap",
  marginBottom: 12,
};

const flowTitle: CSSProperties = {
  margin: 0,
  fontSize: 16,
  fontWeight: 850,
};

const flowSummary: CSSProperties = {
  margin: "4px 0 0",
  maxWidth: 760,
  color: "var(--app-fg-3)",
  fontSize: 12.5,
  lineHeight: 1.45,
};

const metricRow: CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
};

const metric: CSSProperties = {
  minWidth: 96,
  border: "1px solid var(--app-border-2)",
  borderRadius: 8,
  padding: "7px 9px",
  background: "var(--app-card)",
};

const metricLabel: CSSProperties = {
  display: "block",
  color: "var(--app-fg-3)",
  fontSize: 10.5,
  fontWeight: 800,
  textTransform: "uppercase",
};

const metricValue = (tone: "good" | "warn"): CSSProperties => ({
  display: "block",
  marginTop: 2,
  color: tone === "good" ? "var(--tt-green)" : "var(--amber)",
  fontSize: 12,
  fontWeight: 850,
});

const stepsGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
  gap: 10,
};

const stepShell: CSSProperties = {
  border: "1px solid var(--app-border-2)",
  borderRadius: 8,
  padding: 10,
  background: "var(--app-card)",
  minWidth: 0,
};

const stepHead: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: 9,
  marginBottom: 8,
};

const stepNumber = (
  state: "done" | "active" | "waiting" | "manual",
): CSSProperties => ({
  width: 24,
  height: 24,
  borderRadius: 999,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
  border:
    state === "done"
      ? "1px solid var(--tt-green)"
      : "1px solid var(--app-border)",
  background:
    state === "done"
      ? "rgba(57,178,85,0.14)"
      : state === "active"
        ? "rgba(245,158,11,0.12)"
        : "transparent",
  color:
    state === "done"
      ? "var(--tt-green)"
      : state === "active"
        ? "var(--amber)"
        : "var(--app-fg-2)",
  fontSize: 12,
  fontWeight: 900,
});

const stepTitle: CSSProperties = {
  margin: 0,
  fontSize: 13,
  fontWeight: 850,
};

const stepStateText = (
  state: "done" | "active" | "waiting" | "manual",
): CSSProperties => ({
  marginTop: 1,
  color:
    state === "done"
      ? "var(--tt-green)"
      : state === "active"
        ? "var(--amber)"
        : "var(--app-fg-3)",
  fontSize: 10.5,
  fontWeight: 800,
  textTransform: "uppercase",
});

const stepBody: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
};

const stepText: CSSProperties = {
  margin: 0,
  color: "var(--app-fg-3)",
  fontSize: 12,
  lineHeight: 1.5,
};

const stack: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
};

const credentialList: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
};

const credentialRow: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
  border: "1px solid var(--app-border-2)",
  borderRadius: 8,
  padding: "7px 8px",
};

const credentialName: CSSProperties = {
  minWidth: 0,
  color: "var(--app-fg-2)",
  fontSize: 11.5,
  fontWeight: 700,
};

const credentialState = (
  isSet: boolean,
  optional?: boolean,
): CSSProperties => ({
  color: isSet
    ? "var(--tt-green)"
    : optional
      ? "var(--app-fg-3)"
      : "var(--amber)",
  fontSize: 10.5,
  fontWeight: 850,
  textTransform: "uppercase",
  flexShrink: 0,
});

const statusPill = (tone: "good" | "warn" | "muted"): CSSProperties => ({
  border: "1px solid var(--app-border-2)",
  borderRadius: 999,
  padding: "2px 6px",
  color:
    tone === "good"
      ? "var(--tt-green)"
      : tone === "warn"
        ? "var(--amber)"
        : "var(--app-fg-3)",
  fontSize: 10,
  fontWeight: 850,
  textTransform: "uppercase",
  whiteSpace: "nowrap",
});

const copyRow: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) auto",
  gap: 8,
  alignItems: "center",
  padding: 8,
  border: "1px solid var(--app-border-2)",
  borderRadius: 8,
  background: "var(--app-card-2)",
};

const codeShell: CSSProperties = {
  border: "1px solid var(--app-border-2)",
  borderRadius: 8,
  overflow: "hidden",
  background: "var(--app-card-2)",
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

const copyButton: CSSProperties = {
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

const externalButton: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  alignSelf: "flex-start",
  border: "1px solid var(--app-border)",
  background: "transparent",
  color: "var(--app-fg)",
  borderRadius: 8,
  padding: "6px 9px",
  fontSize: 11.5,
  fontWeight: 800,
  textDecoration: "none",
};

const inlineLink: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  alignSelf: "flex-start",
  color: "var(--app-fg)",
  fontSize: 11.5,
  fontWeight: 800,
  textDecoration: "none",
};
