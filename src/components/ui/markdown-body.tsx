import { cn } from "@/lib/utils";

type MdBlock =
  | { type: "heading"; level: 1 | 2 | 3; text: string }
  | { type: "list"; items: string[]; ordered: boolean }
  | { type: "para"; text: string };

function parseMarkdownish(content: string): MdBlock[] {
  const lines = content.split("\n");
  const blocks: MdBlock[] = [];
  let paraBuffer: string[] = [];
  let listBuffer: string[] = [];
  let listOrdered = false;
  let inList = false;

  const flushPara = () => {
    if (paraBuffer.length === 0) return;
    blocks.push({ type: "para", text: paraBuffer.join(" ").trim() });
    paraBuffer = [];
  };
  const flushList = () => {
    if (listBuffer.length === 0) return;
    blocks.push({ type: "list", items: listBuffer, ordered: listOrdered });
    listBuffer = [];
    inList = false;
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (line.trim() === "") {
      flushPara();
      flushList();
      continue;
    }
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading) {
      flushPara();
      flushList();
      const level = Math.min(3, heading[1].length) as 1 | 2 | 3;
      blocks.push({ type: "heading", level, text: heading[2].trim() });
      continue;
    }
    const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (bullet || numbered) {
      flushPara();
      const ordered = Boolean(numbered);
      if (!inList || listOrdered !== ordered) {
        flushList();
        listOrdered = ordered;
        inList = true;
      }
      listBuffer.push((bullet?.[1] ?? numbered?.[1] ?? "").trim());
      continue;
    }
    flushList();
    paraBuffer.push(line.trim());
  }
  flushPara();
  flushList();
  return blocks;
}

interface MarkdownBodyProps {
  content: string;
  className?: string;
}

export function MarkdownBody({ content, className }: MarkdownBodyProps) {
  const blocks = parseMarkdownish(content);
  return (
    <div className={cn("space-y-4", className)}>
      {blocks.map((block, i) => {
        if (block.type === "heading") {
          if (block.level === 1) {
            return (
              <h2 key={i} className="text-display-sm mt-6 first:mt-0">
                {block.text}
              </h2>
            );
          }
          if (block.level === 2) {
            return (
              <h3 key={i} className="text-heading mt-5">
                {block.text}
              </h3>
            );
          }
          return (
            <h4 key={i} className="text-label mt-4">
              {block.text}
            </h4>
          );
        }
        if (block.type === "list") {
          const ListTag = block.ordered ? "ol" : "ul";
          return (
            <ListTag
              key={i}
              className={cn(
                "text-body-reading space-y-1.5 pl-5",
                block.ordered ? "list-decimal" : "list-disc",
              )}
            >
              {block.items.map((item, j) => (
                <li key={j}>{item}</li>
              ))}
            </ListTag>
          );
        }
        return (
          <p key={i} className="text-body-reading">
            {block.text}
          </p>
        );
      })}
    </div>
  );
}
