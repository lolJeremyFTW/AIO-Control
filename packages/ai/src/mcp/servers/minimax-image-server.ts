#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const server = new Server(
  { name: "aio-minimax-images", version: "1.0.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "generate_image",
      description:
        "Generate an image with MiniMax image generation using the workspace MiniMax Coder/Token Plan API key.",
      inputSchema: {
        type: "object",
        properties: {
          prompt: { type: "string", description: "Image prompt, max 1500 chars." },
          aspect_ratio: {
            type: "string",
            enum: ["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3", "21:9"],
            default: "1:1",
          },
          response_format: {
            type: "string",
            enum: ["base64", "url"],
            default: "base64",
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
    aspect_ratio?: string;
    response_format?: "base64" | "url";
  };
  const prompt = args.prompt?.trim();
  if (!prompt) return text(JSON.stringify({ error: "prompt is required" }));

  const apiKey = process.env.MINIMAX_API_KEY;
  if (!apiKey) {
    return text(
      JSON.stringify({
        error: "MiniMax image generation requires MINIMAX_API_KEY.",
      }),
    );
  }

  const host = (process.env.MINIMAX_API_HOST ?? "https://api.minimax.io").replace(
    /\/$/,
    "",
  );
  const response = await fetch(`${host}/v1/image_generation`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.MINIMAX_IMAGE_MODEL ?? "image-01",
      prompt,
      aspect_ratio: args.aspect_ratio ?? "1:1",
      response_format: args.response_format ?? "base64",
    }),
  });

  const json = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) {
    return text(JSON.stringify({ error: normalizeMiniMaxError(json, response.status) }));
  }
  return text(JSON.stringify(json));
});

function text(value: string) {
  return { content: [{ type: "text" as const, text: value }] };
}

function normalizeMiniMaxError(json: unknown, status: number): string {
  if (json && typeof json === "object") {
    const root = json as {
      base_resp?: { status_msg?: string };
      error?: { message?: string };
      message?: string;
    };
    if (root.base_resp?.status_msg) return root.base_resp.status_msg;
    if (root.error?.message) return root.error.message;
    if (root.message) return root.message;
  }
  return `MiniMax image generation failed with status ${status}`;
}

const transport = new StdioServerTransport();
server.connect(transport).catch((err) => {
  console.error("[minimax-image-mcp] Fatal connection error:", err);
  process.exit(1);
});
