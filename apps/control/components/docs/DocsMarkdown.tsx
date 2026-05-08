// Docs-flavoured markdown renderer. Wider feature set than the chat
// MarkdownText (anchors on headings, link rendering, nested lists,
// callouts, fenced code blocks) but still home-grown so we don't pull
// in a 30 KB markdown stack just for prose pages.
//
// Supported:
//   - # / ## / ### / #### headings (auto-anchored, copy-link on hover)
//   - paragraphs separated by blank lines
//   - **bold**, *italic*, `inline code`, [text](url)
//   - bullet lists (- foo) and numbered (1. foo)
//   - simple markdown tables
//   - fenced ```code blocks``` (one optional language hint, ignored visually)
//   - > blockquotes (rendered as callouts)
//   - --- horizontal rules
//
// HTML is NEVER passed through. Anything not in the supported subset
// renders as plain text. XSS-safe by construction.

import type { ReactNode } from "react";
import { Fragment } from "react";

import { slugifyHeading } from "../../lib/docs/slugify";

type Props = { text: string };

type Block =
  | { kind: "p"; text: string }
  | { kind: "h"; level: 1 | 2 | 3 | 4; text: string }
  | { kind: "ul"; items: string[] }
  | { kind: "ol"; items: string[] }
  | { kind: "table"; headers: string[]; rows: string[][] }
  | { kind: "code"; lang: string | null; text: string }
  | { kind: "quote"; text: string }
  | { kind: "hr" };

export function DocsMarkdown({ text }: Props) {
  const blocks = splitBlocks(text);
  return (
    <div className="docs-prose">
      {blocks.map((b, i) => (
        <Block key={i} block={b} />
      ))}
    </div>
  );
}

function isTableRow(line: string): boolean {
  return /\|/.test(line) && line.trim().startsWith("|");
}

function isTableDivider(line: string): boolean {
  if (!isTableRow(line)) return false;
  const cells = line
    .trim()
    .replace(/^\||\|$/g, "")
    .split("|");
  return cells.every((c) => /^[\s:-]+$/.test(c.trim()) && c.includes("-"));
}

function parseTableRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((c) => c.trim());
}

function splitBlocks(text: string): Block[] {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i] ?? "";

    // Fenced code
    if (line.trim().startsWith("```")) {
      const lang = line.trim().slice(3).trim() || null;
      const buf: string[] = [];
      i++;
      while (i < lines.length && !(lines[i] ?? "").trim().startsWith("```")) {
        buf.push(lines[i] ?? "");
        i++;
      }
      i++;
      blocks.push({ kind: "code", lang, text: buf.join("\n") });
      continue;
    }

    if (!line.trim()) {
      i++;
      continue;
    }

    // Horizontal rule
    if (/^---+$/.test(line.trim())) {
      blocks.push({ kind: "hr" });
      i++;
      continue;
    }

    // Tables
    if (isTableRow(line) && isTableDivider(lines[i + 1] ?? "")) {
      const headers = parseTableRow(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && isTableRow(lines[i] ?? "")) {
        const row = parseTableRow(lines[i] ?? "");
        if (row.length > 0) rows.push(row);
        i++;
      }
      blocks.push({ kind: "table", headers, rows });
      continue;
    }

    // Headings
    const hMatch = line.match(/^(#{1,4})\s+(.+?)\s*$/);
    if (hMatch) {
      blocks.push({
        kind: "h",
        level: hMatch[1]!.length as 1 | 2 | 3 | 4,
        text: hMatch[2]!,
      });
      i++;
      continue;
    }

    // Bullet list
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i] ?? "")) {
        items.push((lines[i] ?? "").replace(/^\s*[-*]\s+/, ""));
        i++;
      }
      blocks.push({ kind: "ul", items });
      continue;
    }

    // Ordered list
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i] ?? "")) {
        items.push((lines[i] ?? "").replace(/^\s*\d+\.\s+/, ""));
        i++;
      }
      blocks.push({ kind: "ol", items });
      continue;
    }

    // Blockquote
    if (line.trim().startsWith(">")) {
      const buf: string[] = [];
      while (i < lines.length && (lines[i] ?? "").trim().startsWith(">")) {
        buf.push((lines[i] ?? "").replace(/^\s*>\s?/, ""));
        i++;
      }
      blocks.push({ kind: "quote", text: buf.join("\n") });
      continue;
    }

    // Paragraph
    const buf: string[] = [];
    while (
      i < lines.length &&
      (lines[i] ?? "").trim() &&
      !/^#{1,4}\s/.test(lines[i] ?? "") &&
      !/^\s*[-*]\s+/.test(lines[i] ?? "") &&
      !/^\s*\d+\.\s+/.test(lines[i] ?? "") &&
      !(lines[i] ?? "").trim().startsWith(">") &&
      !(lines[i] ?? "").trim().startsWith("```") &&
      !isTableRow(lines[i] ?? "") &&
      !/^---+$/.test((lines[i] ?? "").trim())
    ) {
      buf.push(lines[i] ?? "");
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
      const id = slugifyHeading(block.text);
      const Tag = (`h${block.level}`) as "h1" | "h2" | "h3" | "h4";
      return (
        <Tag id={id} className={`docs-h docs-h-${block.level}`}>
          <a className="docs-anchor" href={`#${id}`} aria-label="anchor">
            #
          </a>
          {renderInline(block.text)}
        </Tag>
      );
    }
    case "p":
      return <p className="docs-p">{renderInline(block.text)}</p>;
    case "ul":
      return (
        <ul className="docs-ul">
          {block.items.map((it, i) => (
            <li key={i}>{renderInline(it)}</li>
          ))}
        </ul>
      );
    case "ol":
      return (
        <ol className="docs-ol">
          {block.items.map((it, i) => (
            <li key={i}>{renderInline(it)}</li>
          ))}
        </ol>
      );
    case "table":
      return (
        <div className="docs-table-wrap">
          <table className="docs-table">
            <thead>
              <tr>
                {block.headers.map((h, i) => (
                  <th key={i}>{renderInline(h)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((r, i) => (
                <tr key={i}>
                  {r.map((c, j) => (
                    <td key={j}>{renderInline(c)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "code":
      return (
        <pre className="docs-code">
          <code>{block.text}</code>
        </pre>
      );
    case "quote":
      return <blockquote className="docs-quote">{renderInline(block.text)}</blockquote>;
    case "hr":
      return <hr className="docs-hr" />;
    default:
      return null;
  }
}

/** Render bold / italic / inline code / links. Order matters: code
 *  spans are extracted first so * inside backticks doesn't trigger
 *  emphasis. Links use a simple non-greedy match. */
function renderInline(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  let rest = text;
  let key = 0;

  while (rest.length > 0) {
    // inline code
    const codeMatch = rest.match(/`([^`]+)`/);
    // link
    const linkMatch = rest.match(/\[([^\]]+)\]\(([^)]+)\)/);
    // bold
    const boldMatch = rest.match(/\*\*([^*]+)\*\*/);
    // italic (non-greedy, single asterisk)
    const italMatch = rest.match(/(?<!\*)\*([^*]+)\*(?!\*)/);

    const candidates = [codeMatch, linkMatch, boldMatch, italMatch].filter(
      (m): m is RegExpMatchArray => !!m && typeof m.index === "number",
    );
    if (candidates.length === 0) {
      parts.push(<Fragment key={`f-${key++}`}>{rest}</Fragment>);
      break;
    }
    candidates.sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
    const m = candidates[0]!;
    const idx = m.index ?? 0;
    if (idx > 0) {
      parts.push(<Fragment key={`t-${key++}`}>{rest.slice(0, idx)}</Fragment>);
    }
    if (m === codeMatch) {
      parts.push(<code key={`c-${key++}`}>{m[1]}</code>);
    } else if (m === linkMatch) {
      const href = m[2] ?? "#";
      const isExternal = /^https?:\/\//.test(href);
      parts.push(
        <a
          key={`l-${key++}`}
          href={href}
          target={isExternal ? "_blank" : undefined}
          rel={isExternal ? "noreferrer" : undefined}
        >
          {m[1]}
        </a>,
      );
    } else if (m === boldMatch) {
      parts.push(<strong key={`b-${key++}`}>{m[1]}</strong>);
    } else if (m === italMatch) {
      parts.push(<em key={`i-${key++}`}>{m[1]}</em>);
    }
    rest = rest.slice(idx + m[0].length);
  }
  return parts;
}
