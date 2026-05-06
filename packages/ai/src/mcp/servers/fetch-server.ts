// Fetch MCP server — retrieves arbitrary URLs and returns the body as text.
// Drop-in local replacement for the non-existent @modelcontextprotocol/server-fetch
// npm package. Handles HTML → plain text stripping for readability.

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const server = new Server(
  { name: "aio-control-fetch", version: "1.0.0" },
  { capabilities: { tools: {} } },
);

const FETCH_SCHEMA = {
  type: "object",
  properties: {
    url: { type: "string", description: "The URL to fetch." },
    method: {
      type: "string",
      enum: ["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD"],
      description: "HTTP method (default: GET).",
    },
    headers: {
      type: "object",
      description: "Optional HTTP headers as key-value pairs.",
      additionalProperties: { type: "string" },
    },
    body: {
      type: "string",
      description: "Request body for POST/PUT/PATCH.",
    },
    max_length: {
      type: "number",
      description: "Max characters to return from the response body (default: 50000).",
    },
  },
  required: ["url"],
  additionalProperties: false,
};

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s{2,}/g, " ")
    .trim();
}

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "fetch",
      description:
        "Fetch the content of a URL and return it as text. HTML is automatically stripped to plain text.",
      inputSchema: FETCH_SCHEMA,
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params as {
    name: string;
    arguments: {
      url?: string;
      method?: string;
      headers?: Record<string, string>;
      body?: string;
      max_length?: number;
    };
  };

  if (name !== "fetch") {
    return {
      content: [{ type: "text", text: JSON.stringify({ error: "unknown_tool", name }) }],
    };
  }

  const url = args?.url ?? "";
  if (!url) {
    return {
      content: [{ type: "text", text: JSON.stringify({ error: "missing_url" }) }],
    };
  }

  const maxLen = args?.max_length ?? 50_000;

  let response: Response;
  try {
    response = await fetch(url, {
      method: args?.method ?? "GET",
      headers: {
        "User-Agent": "AIO-Control-Fetch/1.0",
        ...args?.headers,
      },
      ...(args?.body ? { body: args.body } : {}),
      signal: AbortSignal.timeout(30_000),
    });
  } catch (err) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            error: "fetch_failed",
            url,
            message: err instanceof Error ? err.message : String(err),
          }),
        },
      ],
    };
  }

  let body: string;
  try {
    body = await response.text();
  } catch (err) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ error: "read_failed", message: err instanceof Error ? err.message : String(err) }),
        },
      ],
    };
  }

  const contentType = response.headers.get("content-type") ?? "";
  const isHtml = contentType.includes("text/html") || body.trimStart().startsWith("<!DOCTYPE") || body.trimStart().startsWith("<html");
  const text = isHtml ? stripHtml(body) : body;
  const truncated = text.length > maxLen;
  const out = truncated ? text.slice(0, maxLen) + "\n\n[truncated]" : text;

  return {
    content: [
      {
        type: "text",
        text: `URL: ${url}\nStatus: ${response.status} ${response.statusText}\nContent-Type: ${contentType}\n\n${out}`,
      },
    ],
  };
});

const transport = new StdioServerTransport();
server.connect(transport).catch((err) => {
  console.error("[fetch-mcp] Fatal connection error:", err);
  process.exit(1);
});
