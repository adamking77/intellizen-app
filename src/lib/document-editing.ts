import { documentEditableBody, upsertDocumentFrontmatterId } from "@/lib/documents";
import { parseGraphEmbedBlocks, type GraphEmbedSpec } from "@/components/graph/export";

export function documentPage(raw: string, fallbackTitle: string) {
  const body = documentEditableBody(raw);
  const heading = /^# ([^\r\n]+)(?:\r?\n(?:\r?\n)?|$)/.exec(body);
  return { title: heading?.[1] ?? fallbackTitle, body: heading ? body.slice(heading[0].length) : body };
}

export function composeDocument(raw: string, title: string, body: string, id: string) {
  const metadata = /^---\r?\n[\s\S]*?\r?\n---\r?\n*/.exec(raw)?.[0] ?? "";
  return upsertDocumentFrontmatterId(`${metadata}# ${title || "Untitled document"}\n\n${body}`, id);
}

export type DocumentSegment = { text: string; graph?: GraphEmbedSpec };
/** Preserve authored graph directives verbatim while surrounding prose is edited. */
export function splitDocumentEmbeds(body: string): DocumentSegment[] {
  const segments: DocumentSegment[] = [];
  const pattern = /^[ \t]*```[ \t]*graph[^\n]*\r?\n[\s\S]*?^[ \t]*```[ \t]*(?:\r?\n)?/gm;
  let cursor = 0;
  for (const match of body.matchAll(pattern)) {
    const graph = parseGraphEmbedBlocks(match[0])[0];
    if (!graph) continue;
    if (match.index > cursor) segments.push({ text: body.slice(cursor, match.index) });
    segments.push({ text: match[0], graph });
    cursor = match.index + match[0].length;
  }
  if (cursor <= body.length) segments.push({ text: body.slice(cursor) });
  return segments;
}
