import { Fragment, type ReactNode } from "react";

import { cn } from "@/lib/utils";

// An agent's reply: the repo's markdown body classes (`intelizen-doc-markdown`,
// `md-codeblock`, `md-list`) with inline code, emphasis and links rendered
// rather than left as literal backticks and asterisks.

type Block =
  | { type: "code"; text: string }
  | { type: "list"; ordered: boolean; items: string[] }
  | { type: "para"; text: string };

function splitBlocks(content: string): Block[] {
  const blocks: Block[] = [];
  let para: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let fence: string[] | null = null;
  const flush = () => {
    if (para.length) blocks.push({ type: "para", text: para.join(" ").trim() });
    para = [];
    if (list) blocks.push({ type: "list", ...list });
    list = null;
  };
  for (const raw of content.split("\n")) {
    const line = raw.trimEnd();
    if (line.trim().startsWith("```")) {
      if (fence) {
        blocks.push({ type: "code", text: fence.join("\n") });
        fence = null;
      } else {
        flush();
        fence = [];
      }
      continue;
    }
    if (fence) {
      fence.push(raw);
      continue;
    }
    if (!line.trim()) {
      flush();
      continue;
    }
    const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (bullet || numbered) {
      if (para.length) {
        blocks.push({ type: "para", text: para.join(" ").trim() });
        para = [];
      }
      const ordered = Boolean(numbered);
      if (!list || list.ordered !== ordered) {
        if (list) blocks.push({ type: "list", ...list });
        list = { ordered, items: [] };
      }
      list.items.push((bullet?.[1] ?? numbered?.[1] ?? "").trim());
      continue;
    }
    if (list) {
      blocks.push({ type: "list", ...list });
      list = null;
    }
    para.push(line.trim());
  }
  flush();
  if (fence && (fence as string[]).length) blocks.push({ type: "code", text: (fence as string[]).join("\n") });
  return blocks;
}

const INLINE = /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(\*[^*\n]+\*)|(\[[^\]\n]+\]\([^)\s]+\))/g;

/** Inline markdown: `code`, **strong**, *emphasis*, [text](url). */
export function renderInline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let key = 0;
  for (const match of text.matchAll(INLINE)) {
    const at = match.index ?? 0;
    if (at > last) out.push(text.slice(last, at));
    const token = match[0];
    if (match[1]) {
      out.push(
        <code key={key++} className="rounded bg-[color-mix(in_srgb,var(--text)_8%,transparent)] px-1 py-px font-mono text-[0.92em]">
          {token.slice(1, -1)}
        </code>,
      );
    } else if (match[2]) {
      out.push(<strong key={key++}>{renderInline(token.slice(2, -2))}</strong>);
    } else if (match[3]) {
      out.push(<em key={key++}>{renderInline(token.slice(1, -1))}</em>);
    } else {
      const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token);
      if (link) {
        out.push(
          <a key={key++} href={link[2]} target="_blank" rel="noreferrer" className="underline decoration-[var(--accent-border)] underline-offset-2">
            {renderInline(link[1])}
          </a>,
        );
      } else {
        out.push(token);
      }
    }
    last = at + token.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function ReplyMarkdown({ content, className }: { content: string; className?: string }) {
  return (
    <div className={cn("intelizen-doc-markdown", className)}>
      {splitBlocks(content).map((block, i) => {
        if (block.type === "code") {
          return (
            <pre key={i} className="md-codeblock">
              <code>{block.text}</code>
            </pre>
          );
        }
        if (block.type === "list") {
          const Tag = block.ordered ? "ol" : "ul";
          return (
            <Tag key={i} className={cn("md-list", block.ordered ? "list-decimal" : "list-disc")}>
              {block.items.map((item, j) => (
                <li key={j}>{renderInline(item)}</li>
              ))}
            </Tag>
          );
        }
        return (
          <p key={i}>
            {renderInline(block.text).map((node, j) => (
              <Fragment key={j}>{node}</Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}
