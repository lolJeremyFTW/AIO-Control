// Tiny safe-subset markdown renderer for assistant outputs in the run
// drawer. Most of our agents write reports in markdown (headings,
// bullets, bold) and showing them as <pre>-wrapped plain text is ugly.
//
// Why home-grown instead of react-markdown:
//   - ~50 lines vs 30 KB of dependencies for a feature that's only
//     used in one bubble.
//   - We control exactly what's allowed (no raw HTML, no images, no
//     iframes) so XSS is impossible by construction even though the
//     text comes from our own dispatcher.
//
// Supported subset:
//   - # / ## / ### headings
//   - bullet lists (- foo, * foo) and numbered lists (1. foo)
//   - paragraphs separated by blank lines
//   - **bold**, *italic*, `inline code`, [link text](url)
//   - ```code fences``` (no language hint styling)
//   - `> blockquote`
// Anything else falls through as plain text.

"use client";

import type { ReactNode } from "react";
import { Fragment } from "react";

type Props = { text: string };

export function MarkdownText({ text }: Props) {
  const blocks = splitBlocks(text);
  return (
    <>
      {blocks.map((b, i) => (
        <Block key={i} block={b} />
      ))}
    </>
  );
}

type Block =
  | { kind: "p"; text: string }
  | { kind: "h"; level: 1 | 2 | 3; text: string }
  | { kind: "ul"; items: string[] }
  | { kind: "ol"; items: string[] }
  | { kind: "code"; text: string }
  | { kind: "quote"; text: string };

function splitBlocks(text: string): Block[] {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? "";

    // Code fence — collect until closing ```.
    if (line.trim().startsWith("```")) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !(lines[i] ?? "").trim().startsWith("```")) {
        buf.push(lines[i] ?? "");
        i++;
      }
      i++; // skip closing fence (or EOF)
      blocks.push({ kind: "code", text: buf.join("\n") });
      continue;
    }

    if (!line.trim()) {
      i++;
      continue;
    }

    // Headings.
    const hMatch = /^(#{1,3})\s+(.*)$/.exec(line);
    if (hMatch) {
      blocks.push({
        kind: "h",
        level: hMatch[1]!.length as 1 | 2 | 3,
        text: hMatch[2] ?? "",
      });
      i++;
      continue;
    }

    // Blockquote — collect consecutive `> ` lines.
    if (/^\s*>\s?/.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i] ?? "")) {
        buf.push((lines[i] ?? "").replace(/^\s*>\s?/, ""));
        i++;
      }
      blocks.push({ kind: "quote", text: buf.join("\n") });
      continue;
    }

    // Bullet list.
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i] ?? "")) {
        items.push((lines[i] ?? "").replace(/^\s*[-*]\s+/, ""));
        i++;
      }
      blocks.push({ kind: "ul", items });
      continue;
    }

    // Numbered list.
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i] ?? "")) {
        items.push((lines[i] ?? "").replace(/^\s*\d+\.\s+/, ""));
        i++;
      }
      blocks.push({ kind: "ol", items });
      continue;
    }

    // Paragraph — collect consecutive non-blank lines.
    const buf: string[] = [];
    while (i < lines.length && (lines[i] ?? "").trim() !== "") {
      // Stop if the next line starts a different block type.
      const next = lines[i] ?? "";
      if (
        /^(#{1,3}\s|>\s?|\s*[-*]\s|\s*\d+\.\s)/.test(next) ||
        next.trim().startsWith("```")
      ) {
        break;
      }
      buf.push(next);
      i++;
    }
    if (buf.length > 0) {
      blocks.push({ kind: "p", text: buf.join("\n") });
    }
  }
  return blocks;
}

function Block({ block }: { block: Block }) {
  switch (block.kind) {
    case "h": {
      const fontSize =
        block.level === 1 ? 18 : block.level === 2 ? 16 : 14;
      return (
        <div
          style={{
            fontSize,
            fontWeight: 800,
            margin: "10px 0 4px",
            color: "var(--app-fg)",
            letterSpacing: -0.2,
          }}
        >
          <Inline text={block.text} />
        </div>
      );
    }
    case "p":
      return (
        <p style={{ margin: "0 0 8px", lineHeight: 1.55 }}>
          <Inline text={block.text} />
        </p>
      );
    case "ul":
      return (
        <ul style={{ margin: "0 0 8px", paddingLeft: 22, lineHeight: 1.55 }}>
          {block.items.map((it, i) => (
            <li key={i}>
              <Inline text={it} />
            </li>
          ))}
        </ul>
      );
    case "ol":
      return (
        <ol style={{ margin: "0 0 8px", paddingLeft: 22, lineHeight: 1.55 }}>
          {block.items.map((it, i) => (
            <li key={i}>
              <Inline text={it} />
            </li>
          ))}
        </ol>
      );
    case "quote":
      return (
        <blockquote
          style={{
            margin: "0 0 8px",
            padding: "6px 10px",
            borderLeft: "3px solid var(--app-border)",
            color: "var(--app-fg-2)",
            background: "rgba(255,255,255,0.02)",
            lineHeight: 1.5,
          }}
        >
          <Inline text={block.text} />
        </blockquote>
      );
    case "code":
      return (
        <pre
          style={{
            margin: "0 0 8px",
            padding: "10px 12px",
            background: "var(--app-card-2)",
            border: "1px solid var(--app-border-2)",
            borderRadius: 8,
            fontFamily: "ui-monospace, Menlo, monospace",
            fontSize: 11.5,
            lineHeight: 1.5,
            overflow: "auto",
            whiteSpace: "pre",
            color: "var(--app-fg-2)",
          }}
        >
          {block.text}
        </pre>
      );
  }
}

// Inline formatting — splits on **bold**, *italic*, `code`, and
// [text](url) using a single tokenizer pass so the patterns don't
// fight each other. Anything that doesn't match falls through as
// plain text (React escapes naturally — no XSS risk).
function Inline({ text }: { text: string }): ReactNode {
  const re = /(\*\*[^*\n]+\*\*|`[^`\n]+`|\[[^\]\n]+\]\([^)\s]+\)|\*[^*\n]+\*)/g;
  const parts = text.split(re);
  return (
    <>
      {parts.map((part, idx) => {
        if (!part) return null;
        // Bold first because ** prefix overlaps with *.
        if (part.startsWith("**") && part.endsWith("**")) {
          return (
            <strong key={idx}>{part.slice(2, -2)}</strong>
          );
        }
        if (part.startsWith("`") && part.endsWith("`")) {
          return (
            <code
              key={idx}
              style={{
                fontFamily: "ui-monospace, Menlo, monospace",
                fontSize: "0.92em",
                padding: "1px 5px",
                background: "var(--app-card-2)",
                border: "1px solid var(--app-border-2)",
                borderRadius: 4,
              }}
            >
              {part.slice(1, -1)}
            </code>
          );
        }
        if (part.startsWith("[")) {
          const m = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(part);
          if (m) {
            return (
              <a
                key={idx}
                href={m[2]}
                target="_blank"
                rel="noopener noreferrer nofollow"
                style={{ color: "var(--tt-green)", textDecoration: "underline" }}
              >
                {m[1]}
              </a>
            );
          }
        }
        if (part.startsWith("*") && part.endsWith("*")) {
          return <em key={idx}>{part.slice(1, -1)}</em>;
        }
        return <Fragment key={idx}>{part}</Fragment>;
      })}
    </>
  );
}
