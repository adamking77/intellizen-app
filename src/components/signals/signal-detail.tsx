import { useMemo, useState } from "react";
import { Bookmark, ChevronDown, ChevronRight, ExternalLink, Radar, Target, X } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";

import { Button } from "@/components/ui/button";
import { cn, formatDate, safeHostname } from "@/lib/utils";
import { domainColor } from "@/lib/domains";
import type { IntelSignal } from "@/lib/types";

type SignalDetailProps = {
  signal: IntelSignal | null;
  onSave: (signal: IntelSignal) => void;
  onAttach: (signal: IntelSignal) => void;
  onDismiss: (signalId: number) => void;
};

type ExaPayload = {
  text?: string;
  highlights?: string[];
  author?: string;
};

function extractFullText(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as ExaPayload;
  const text = typeof p.text === "string" ? p.text.trim() : "";
  return text.length > 0 ? text : null;
}

function extractExtraHighlights(payload: unknown, snippet: string | null): string[] {
  if (!payload || typeof payload !== "object") return [];
  const p = payload as ExaPayload;
  const highlights = Array.isArray(p.highlights) ? p.highlights : [];
  // Drop the one already used as snippet
  return highlights.filter((h) => typeof h === "string" && h.trim() && h.trim() !== (snippet ?? "").trim());
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+(?=["'"(\[]?[A-Z0-9])/u)
    .map((s) => s.trim())
    .filter(Boolean);
}

function paragraphize(text: string, sentencesPerPara = 3): string[] {
  // 1) Respect explicit double-newline paragraph breaks
  const byDouble = text
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);
  if (byDouble.length > 1) return byDouble;

  // 2) Respect single-newline breaks when author used them
  const bySingle = text
    .split(/\n+/)
    .map((block) => block.trim())
    .filter(Boolean);
  if (bySingle.length > 1) return bySingle;

  // 3) Fallback: scraped blob with no paragraph structure. Group sentences.
  const sentences = splitSentences(text);
  if (sentences.length <= sentencesPerPara) return [text.trim()];
  const paras: string[] = [];
  for (let i = 0; i < sentences.length; i += sentencesPerPara) {
    paras.push(sentences.slice(i, i + sentencesPerPara).join(" "));
  }
  return paras;
}

export function SignalDetail({ signal, onSave, onAttach, onDismiss }: SignalDetailProps) {
  const [fullOpen, setFullOpen] = useState(false);

  const fullText = useMemo(() => extractFullText(signal?.raw_payload), [signal]);
  const extraHighlights = useMemo(
    () => extractExtraHighlights(signal?.raw_payload, signal?.snippet ?? null),
    [signal],
  );
  const snippetParagraphs = useMemo(
    () => (signal?.snippet ? paragraphize(signal.snippet) : []),
    [signal],
  );
  const fullParagraphs = useMemo(
    () => (fullText ? paragraphize(fullText) : []),
    [fullText],
  );
  const wordCount = useMemo(() => {
    if (!fullText) return 0;
    return fullText.split(/\s+/).filter(Boolean).length;
  }, [fullText]);

  if (!signal) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <Radar className="h-5 w-5 text-[var(--overlay-1)]" strokeWidth={1.5} />
        <div>
          <p className="text-label">No signal selected</p>
          <p className="mt-2 font-ui text-[12px] text-[var(--overlay-1)]">
            Select a signal from the feed
          </p>
        </div>
      </div>
    );
  }

  const color = domainColor(signal.watch_domain);
  const host = safeHostname(signal.url);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="shrink-0 border-b border-[var(--border)] p-5">
        <div className="mb-3 flex items-center gap-2">
          {signal.watch_domain ? (
            <div className="flex items-center gap-2">
              <span
                aria-hidden
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: color }}
              />
              <span
                className="font-ui text-[10px] font-semibold uppercase tracking-[0.14em]"
                style={{ color }}
              >
                {signal.watch_domain}
              </span>
            </div>
          ) : null}
          {typeof signal.exa_score === "number" ? (
            <span
              className={cn(
                "ml-auto font-mono text-[11px] tabular-nums",
                signal.exa_score > 0.7
                  ? "text-[var(--accent)]"
                  : signal.exa_score > 0.5
                    ? "text-[var(--warning)]"
                    : "text-[var(--overlay-1)]",
              )}
            >
              {signal.exa_score.toFixed(3)}
            </span>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => void openUrl(signal.url)}
          className="group/link inline-flex items-start gap-2 text-left"
        >
          <h2 className="text-heading tracking-tight transition-colors duration-150 group-hover/link:text-[var(--accent)]">
            {signal.title}
          </h2>
          <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--overlay-1)] group-hover/link:text-[var(--accent)]" />
        </button>
      </div>

      {/* Meta row */}
      <div className="shrink-0 border-b border-[var(--border)] px-5 py-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[11px] text-[var(--overlay-1)]">
          {signal.source ? (
            <span className="text-[var(--subtext-0)]">{signal.source}</span>
          ) : null}
          <span>{formatDate(signal.published_at)}</span>
          {host && <span>{host}</span>}
        </div>
      </div>

      {/* Body — scrollable */}
      <div className="flex-1 overflow-y-auto">
        {/* Highlight */}
        {snippetParagraphs.length > 0 ? (
          <section className="border-b border-[var(--border-subtle)] px-5 pt-5 pb-6">
            <p className="mb-2 font-ui text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--overlay-1)]">
              Highlight
            </p>
            <div className="max-w-[65ch] space-y-4">
              {snippetParagraphs.map((para, i) => (
                <p key={i} className="text-body-reading">
                  {para}
                </p>
              ))}
            </div>
          </section>
        ) : (
          <section className="border-b border-[var(--border-subtle)] px-5 py-5">
            <p className="font-ui text-[12px] italic text-[var(--overlay-1)]">
              No snippet available.
            </p>
          </section>
        )}

        {/* Additional highlights from Exa */}
        {extraHighlights.length > 0 ? (
          <section className="border-b border-[var(--border-subtle)] px-5 py-5">
            <p className="mb-3 font-ui text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--overlay-1)]">
              Additional excerpts
            </p>
            <div className="max-w-[65ch] space-y-4">
              {extraHighlights.map((highlight, i) => (
                <p
                  key={i}
                  className="text-body-reading border-l border-[var(--border)] pl-3 text-[15px] text-[var(--subtext-0)]"
                >
                  {highlight.trim()}
                </p>
              ))}
            </div>
          </section>
        ) : null}

        {/* Full article — collapsible */}
        {fullParagraphs.length > 0 ? (
          <section className="px-5 py-5">
            <button
              type="button"
              onClick={() => setFullOpen((o) => !o)}
              className="flex w-full items-center justify-between gap-2 rounded-md py-1 text-left transition-colors hover:text-[var(--text)]"
            >
              <span className="flex items-center gap-2">
                {fullOpen ? (
                  <ChevronDown className="h-3.5 w-3.5 text-[var(--overlay-1)]" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5 text-[var(--overlay-1)]" />
                )}
                <span className="font-ui text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--subtext-0)]">
                  Full article
                </span>
              </span>
              <span className="font-mono text-[10px] tabular-nums text-[var(--overlay-1)]">
                {wordCount.toLocaleString()} words · {fullParagraphs.length} ¶
              </span>
            </button>
            {fullOpen ? (
              <div className="mt-4 max-w-[65ch] space-y-5">
                {fullParagraphs.map((para, i) => (
                  <p key={i} className="text-body-reading">
                    {para}
                  </p>
                ))}
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => void openUrl(signal.url)}
                    className="inline-flex items-center gap-1.5 font-ui text-[11px] text-[var(--accent)] hover:underline"
                  >
                    <ExternalLink className="h-3 w-3" />
                    Open original at {host ?? "source"}
                  </button>
                </div>
              </div>
            ) : null}
          </section>
        ) : null}
      </div>

      {/* Actions */}
      <div className="shrink-0 border-t border-[var(--border)] p-4">
        <div className="flex gap-2">
          <Button className="flex-1 gap-2" onClick={() => onSave(signal)}>
            <Bookmark className="h-3.5 w-3.5" />
            Save to project
          </Button>
          <Button variant="accent-outline" className="gap-2" onClick={() => onAttach(signal)}>
            <Target className="h-3.5 w-3.5" />
            Attach
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0 hover:text-[var(--danger)]"
            onClick={() => onDismiss(signal.id)}
            title="Dismiss signal"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
