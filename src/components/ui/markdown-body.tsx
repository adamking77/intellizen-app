import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

type MdBlock =
  | { type: "heading"; level: 1 | 2 | 3; text: string }
  | { type: "list"; items: string[]; ordered: boolean }
  | { type: "code"; text: string }
  | { type: "image"; alt: string; source: string }
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

  let inFence = false;
  let fenceBuffer: string[] = [];
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (line.trim().startsWith("```")) {
      if (inFence) {
        blocks.push({ type: "code", text: fenceBuffer.join("\n") });
        fenceBuffer = [];
        inFence = false;
      } else {
        flushPara();
        flushList();
        inFence = true;
      }
      continue;
    }
    if (inFence) {
      fenceBuffer.push(raw);
      continue;
    }
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
    const image = /^!\[([^\]]*)\]\(([^)\s]+)\)$/.exec(line.trim());
    if (image) {
      flushPara();
      flushList();
      blocks.push({ type: "image", alt: image[1], source: image[2] });
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
  if (inFence && fenceBuffer.length > 0) {
    blocks.push({ type: "code", text: fenceBuffer.join("\n") });
  }
  return blocks;
}

interface MarkdownBodyProps {
  content: string;
  className?: string;
  vaultPath?: string | null;
}

export function MarkdownBody({ content, className, vaultPath }: MarkdownBodyProps) {
  const blocks = parseMarkdownish(content);
  return (
    <div className={cn("intelizen-doc-markdown", className)}>
      {blocks.map((block, i) => {
        if (block.type === "heading") {
          if (block.level === 1) {
            return (
              <h2 key={i} className="md-heading-1">
                {block.text}
              </h2>
            );
          }
          if (block.level === 2) {
            return (
              <h3 key={i} className="md-heading-2">
                {block.text}
              </h3>
            );
          }
          return (
            <h4 key={i} className="md-heading-3">
              {block.text}
            </h4>
          );
        }
        if (block.type === "code") {
          return (
            <pre key={i} className="md-codeblock">
              <code>{block.text}</code>
            </pre>
          );
        }
        if (block.type === "image") {
          return <MarkdownImage key={i} alt={block.alt} source={block.source} vaultPath={vaultPath} />;
        }
        if (block.type === "list") {
          const ListTag = block.ordered ? "ol" : "ul";
          return (
            <ListTag
              key={i}
              className={cn(
                "md-list",
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
          <p key={i} className="md-paragraph">
            {block.text}
          </p>
        );
      })}
    </div>
  );
}

function MarkdownImage({ alt, source, vaultPath }: { alt: string; source: string; vaultPath?: string | null }) {
  const external = /^(?:data:|blob:|https?:)/.test(source);
  const [localSource, setLocalSource] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (external) {
      return;
    }
    let active = true;
    let objectUrl: string | null = null;
    setLocalSource(null);
    setFailed(false);
    void Promise.all([import("@tauri-apps/plugin-fs"), import("@tauri-apps/api/path")])
      .then(async ([fs, path]) => {
        const base = vaultPath ? await path.dirname(vaultPath) : "documents";
        const absolute = source.startsWith("/") ? source : await path.join(await path.homeDir(), "vault", "intelligence", base, source);
        const bytes = await fs.readFile(absolute);
        if (!active) return;
        objectUrl = URL.createObjectURL(new Blob([bytes], { type: imageMime(source) }));
        setLocalSource(objectUrl);
      })
      .catch(() => active && setFailed(true));
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [external, source, vaultPath]);

  if (external) return <img src={source} alt={alt} className="my-4 max-h-[70vh] max-w-full rounded-[var(--r-plane)] object-contain" />;
  if (failed) return <p className="md-paragraph text-[var(--text-muted)]">{alt || "Image"} could not be loaded.</p>;
  return localSource ? <img src={localSource} alt={alt} className="my-4 max-h-[70vh] max-w-full rounded-[var(--r-plane)] object-contain" /> : null;
}

function imageMime(source: string) {
  const extension = source.split(".").pop()?.toLowerCase();
  if (extension === "svg") return "image/svg+xml";
  return `image/${extension === "jpg" ? "jpeg" : extension || "png"}`;
}
