import "server-only";

export type RunMessageEvent = "done" | "failed";

export type RunMessageRun = {
  id: string;
  status: string;
  business_id: string | null;
  cost_cents: number | null;
  duration_ms: number | null;
  output: Record<string, unknown> | null;
  error_text: string | null;
};

export type RunMessageAgent = {
  id: string;
  name: string;
} | null;

export type RunMessageLink = {
  label: string;
  url: string;
};

export type SlackBlock = Record<string, unknown>;
export type DiscordEmbed = Record<string, unknown>;
export type DiscordComponent = Record<string, unknown>;

export function formatRunPlainText(input: {
  run: RunMessageRun;
  agent: RunMessageAgent;
  event: RunMessageEvent;
  links?: RunMessageLink[];
}): string {
  const lines = baseLines(input);
  const body = runBody(input.run, input.event);
  if (body) lines.push("", body);
  if (input.links && input.links.length > 0) {
    lines.push("", ...input.links.map((link) => `${link.label}: ${link.url}`));
  }
  return lines.join("\n");
}

export function formatRunSlackBlocks(input: {
  run: RunMessageRun;
  agent: RunMessageAgent;
  event: RunMessageEvent;
  links: RunMessageLink[];
}): SlackBlock[] {
  const head =
    input.event === "done"
      ? `Run done - ${input.agent?.name ?? "Agent"}`
      : `Run failed - ${input.agent?.name ?? "Agent"}`;
  const body = runBody(input.run, input.event);
  const fields = runFields(input.run);
  const blocks: SlackBlock[] = [
    {
      type: "header",
      text: { type: "plain_text", text: truncate(head, 140) },
    },
    {
      type: "section",
      fields: fields.map((field) => ({
        type: "mrkdwn",
        text: `*${field.label}*\n${field.value}`,
      })),
    },
  ];

  if (body) {
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: truncate(body, 2800) },
    });
  }

  const actions = slackActions(input.agent, input.links);
  if (actions.length > 0) {
    blocks.push({ type: "actions", elements: actions });
  }

  return blocks;
}

export function formatRunDiscordEmbeds(input: {
  run: RunMessageRun;
  agent: RunMessageAgent;
  event: RunMessageEvent;
  links: RunMessageLink[];
}): DiscordEmbed[] {
  const fields = runFields(input.run).map((field) => ({
    name: field.label,
    value: field.value,
    inline: true,
  }));
  if (input.links.length > 0) {
    fields.push({
      name: "Links",
      value: input.links
        .map((link) => `[${link.label}](${link.url})`)
        .join(" | "),
      inline: false,
    });
  }

  return [
    {
      title:
        input.event === "done"
          ? `Run done - ${input.agent?.name ?? "Agent"}`
          : `Run failed - ${input.agent?.name ?? "Agent"}`,
      description: truncate(runBody(input.run, input.event) ?? "", 3500),
      color: input.event === "done" ? 0x39b255 : 0xe5484d,
      fields,
      footer: { text: `Run ${input.run.id.slice(0, 8)}` },
      timestamp: new Date().toISOString(),
    },
  ];
}

export function formatRunDiscordComponents(input: {
  agent: RunMessageAgent;
  links: RunMessageLink[];
}): DiscordComponent[] {
  const buttons: DiscordComponent[] = [];
  if (input.agent?.id) {
    buttons.push({
      type: 2,
      style: 2,
      label: "Run again",
      custom_id: `run_again:${input.agent.id}`,
    });
  }
  for (const link of input.links.slice(0, 4)) {
    buttons.push({
      type: 2,
      style: 5,
      label: link.label,
      url: link.url,
    });
  }
  if (buttons.length === 0) return [];
  return [{ type: 1, components: buttons.slice(0, 5) }];
}

function baseLines(input: {
  run: RunMessageRun;
  agent: RunMessageAgent;
  event: RunMessageEvent;
}): string[] {
  return [
    `${input.event === "done" ? "Run done" : "Run failed"} - ${
      input.agent?.name ?? "Agent"
    }`,
    ...runFields(input.run).map((field) => `${field.label}: ${field.value}`),
  ];
}

function runFields(
  run: RunMessageRun,
): Array<{ label: string; value: string }> {
  const fields: Array<{ label: string; value: string }> = [
    { label: "Status", value: run.status },
    { label: "Run", value: run.id.slice(0, 8) },
  ];
  if (run.cost_cents != null && run.cost_cents > 0) {
    fields.push({
      label: "Cost",
      value: `EUR ${(run.cost_cents / 100).toFixed(4)}`,
    });
  }
  if (run.duration_ms != null && run.duration_ms > 0) {
    fields.push({
      label: "Duration",
      value: `${(run.duration_ms / 1000).toFixed(1)}s`,
    });
  }
  return fields;
}

function runBody(run: RunMessageRun, event: RunMessageEvent): string | null {
  if (event === "failed" && run.error_text) {
    return stripMarkdown(truncate(run.error_text, 1200));
  }
  if (event === "done") {
    const out = extractText(run.output);
    if (out) return stripMarkdown(truncate(out, 1200));
  }
  return null;
}

function slackActions(
  agent: RunMessageAgent,
  links: RunMessageLink[],
): SlackBlock[] {
  const actions: SlackBlock[] = [];
  if (agent?.id) {
    actions.push({
      type: "button",
      text: { type: "plain_text", text: "Run again" },
      action_id: "run_again",
      value: `run_again:${agent.id}`,
    });
  }
  for (const link of links.slice(0, 4)) {
    actions.push({
      type: "button",
      text: { type: "plain_text", text: link.label },
      url: link.url,
    });
  }
  return actions.slice(0, 5);
}

function extractText(output: unknown): string | null {
  if (!output || typeof output !== "object") return null;
  const record = output as Record<string, unknown>;
  if (typeof record.text === "string") return record.text;
  if (typeof record.message === "string") return record.message;
  return null;
}

function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 3)}...`;
}

function stripMarkdown(value: string): string {
  return value.replace(/[*_`]/g, "");
}
