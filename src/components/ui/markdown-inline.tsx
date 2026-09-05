import { Fragment, type ReactNode } from "react";
import { toastError } from "@/lib/toast";

/** Render inline Markdown as React nodes; raw HTML is always text. */
export function markdownInline(text: string, vaultPath?: string | null): ReactNode[] {
  const pattern = /(`+)([^`]+)\1|\[([^\]]+)\]\(([^\s)]+)\)|\*\*([^*]+)\*\*|__([^_]+)__|\*(?!\s)([^*]+?)(?<!\s)\*|(?<!\w)_(?!\s)([^_]+?)(?<!\s)_(?!\w)|~~([^~]+)~~/g;
  const result: ReactNode[] = [];
  let cursor = 0;
  for (const match of text.matchAll(pattern)) {
    result.push(text.slice(cursor, match.index));
    const key = match.index;
    if (match[2]) result.push(<code key={key} className="rounded bg-[var(--surface-0)] px-1 text-[0.9em]">{match[2]}</code>);
    else if (match[3]) {
      const safe = /^(https?:|mailto:|#)/i.test(match[4]);
      result.push(safe ? <a key={key} href={match[4]} target={match[4].startsWith("#") ? undefined : "_blank"} rel="noreferrer" className="text-[var(--accent-text)] underline">{markdownInline(match[3], vaultPath)}</a> : vaultPath && !/^(?:[a-z]+:|\/)/i.test(match[4]) ? <a key={key} href={match[4]} title={`Open ${match[4]}`} className="text-[var(--accent-text)] underline" onClick={(event) => { event.preventDefault(); void import("@/lib/vault").then(({ openVaultReference }) => openVaultReference(match[4], vaultPath)).catch((error) => toastError("Could not open reference", error)); }}>{markdownInline(match[3], vaultPath)}</a> : <span key={key} title={`Source reference: ${match[4]}`}>{markdownInline(match[3], vaultPath)}</span>);
    } else if (match[5] || match[6]) result.push(<strong key={key}>{markdownInline(match[5] || match[6])}</strong>);
    else if (match[7] || match[8]) result.push(<em key={key}>{markdownInline(match[7] || match[8])}</em>);
    else result.push(<del key={key}>{markdownInline(match[9])}</del>);
    cursor = match.index + match[0].length;
  }
  result.push(text.slice(cursor));
  return result.map((node, index) => <Fragment key={index}>{node}</Fragment>);
}

export function markdownTableCells(line: string) {
  return line.trim().replace(/^\|/, "").replace(/\|$/, "").split(/(?<!\\)\|/).map((cell) => cell.trim().replace(/\\\|/g, "|"));
}
