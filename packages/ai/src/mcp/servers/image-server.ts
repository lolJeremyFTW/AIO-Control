#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const server = new Server(
  { name: "aio-openai-images", version: "1.0.0" },
  { capabilities: { tools: {} } },
);

const DEFAULT_MODEL = "gpt-image-1.5";

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "generate_image",
      description:
        "Generate an image using the user's Codex OAuth token when available, with owner-scoped OpenAI API key fallback.",
      inputSchema: {
        type: "object",
        properties: {
          prompt: { type: "string", description: "Image prompt." },
          size: {
            type: "string",
            enum: ["1024x1024", "1024x1536", "1536x1024", "auto"],
            default: "1024x1024",
          },
          quality: {
            type: "string",
            enum: ["low", "medium", "high", "auto"],
            default: "auto",
          },
        },
        required: ["prompt"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name !== "generate_image") {
    return text(JSON.stringify({ error: `Unknown tool: ${request.params.name}` }));
  }
  const args = (request.params.arguments ?? {}) as {
    prompt?: string;
    size?: string;
    quality?: string;
  };
  const prompt = args.prompt?.trim();
  if (!prompt) return text(JSON.stringify({ error: "prompt is required" }));

  const codexToken = process.env.OPENAI_CODEX_ACCESS_TOKEN;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!codexToken && !apiKey) {
    return text(JSON.stringify({ error: "Image generation requires OpenAI API key fallback." }));
  }

  const first = await generateImage({
    bearer: codexToken ?? apiKey!,
    prompt,
    size: args.size ?? "1024x1024",
    quality: args.quality ?? "auto",
  });
  if (first.ok) return text(JSON.stringify(first.json));

  if (codexToken && apiKey && shouldUseApiFallback(first.status, first.json)) {
    const fallback = await generateImage({
      bearer: apiKey,
      prompt,
      size: args.size ?? "1024x1024",
      quality: args.quality ?? "auto",
    });
    if (fallback.ok) return text(JSON.stringify(fallback.json));
    return text(JSON.stringify({ error: normalizeOpenAIError(fallback.json, fallback.status) }));
  }

  if (codexToken && !apiKey && shouldUseApiFallback(first.status, first.json)) {
    return text(JSON.stringify({ error: "Image generation requires OpenAI API key fallback." }));
  }

  return text(JSON.stringify({ error: normalizeOpenAIError(first.json, first.status) }));
});

async function generateImage(input: {
  bearer: string;
  prompt: string;
  size: string;
  quality: string;
}): Promise<{ ok: boolean; status: number; json: unknown }> {
  const response = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      authorization: `Bearer ${input.bearer}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_IMAGE_MODEL ?? DEFAULT_MODEL,
      prompt: input.prompt,
      size: input.size,
      quality: input.quality,
    }),
  });
  const json = (await response.json().catch(() => null)) as unknown;
  return { ok: response.ok, status: response.status, json };
}

function text(value: string) {
  return { content: [{ type: "text" as const, text: value }] };
}

function normalizeOpenAIError(json: unknown, status: number): string {
  if (json && typeof json === "object") {
    const err = (json as { error?: { message?: string } }).error;
    if (err?.message) return err.message;
  }
  return `OpenAI Images API failed with status ${status}`;
}

function shouldUseApiFallback(status: number, json: unknown): boolean {
  const message = normalizeOpenAIError(json, status).toLowerCase();
  return (
    status === 401 ||
    status === 403 ||
    message.includes("unsupported") ||
    message.includes("not supported") ||
    message.includes("capability") ||
    message.includes("scope") ||
    message.includes("image")
  );
}

const transport = new StdioServerTransport();
server.connect(transport).catch((err) => {
  console.error("[image-mcp] Fatal connection error:", err);
  process.exit(1);
});
