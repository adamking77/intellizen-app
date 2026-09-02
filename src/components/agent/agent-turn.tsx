import { useState } from "react";
import { ChevronDown, Copy } from "lucide-react";

import { took, clock } from "@/components/agent/turn-time";
import { ReplyMarkdown } from "@/components/agent/reply-markdown";
import type { HermesProfile } from "@/engine/profiles";
import type { Message, ToolRow } from "@/engine/transcript";
import { writeTextToClipboard } from "@/lib/clipboard";
import { cn } from "@/lib/utils";

const TURN_ICON =
  "inline-flex h-5 w-5 items-center justify-center rounded text-[var(--text-muted)] transition-colors hover:bg-[var(--hover)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-border)]";

/** A fact about a turn, in the row with its controls. Not a control, so it
 *  never rides the hover fade. */
export function TurnFact({ text, title, truncate }: { text: string; title?: string; truncate?: boolean }) {
  return (
    <span
      className={cn(
        "px-0.5 font-ui text-[12px] tabular-nums text-[var(--text-muted)] whitespace-nowrap",
        truncate ? "min-w-0 truncate" : "shrink-0",
      )}
      title={title}
    >
      {text}
    </span>
  );
}

/** The turn's controls, below the message. Invisible until the turn is
 *  hovered or focused, and it holds its height either way so a stream
 *  resolving never moves the log. */
function TurnBar({ align, children }: { align?: "end"; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "mt-px flex h-5 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100",
        "pointer-events-none group-hover:pointer-events-auto group-focus-within:pointer-events-auto",
        align === "end" && "justify-end",
      )}
    >
      {children}
    </div>
  );
}

function ToolRowView({ tool }: { tool: ToolRow }) {
  const [open, setOpen] = useState(false);
  const canOpen = Boolean(tool.resultText);
  return (
    <div className="rounded-md bg-[var(--crust)]">
      <button
        type="button"
        onClick={() => canOpen && setOpen((v) => !v)}
        aria-expanded={canOpen ? open : undefined}
        className={cn(
          "flex w-full items-center gap-2 px-[9px] py-1.5 text-left",
          canOpen ? "cursor-default" : "cursor-default",
        )}
        title={tool.name === tool.title ? tool.name : `${tool.name}: ${tool.title}`}
      >
        <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-[var(--text-muted)]">{tool.title}</span>
        {tool.ok === undefined ? (
          <span className="font-mono text-[11px] text-[var(--text-muted)]">running</span>
        ) : (
          <>
            {tool.durationMs !== undefined ? (
              <span className="font-mono text-[11px] tabular-nums text-[var(--text-muted)]">
                {tool.durationMs < 1000 ? `${tool.durationMs} ms` : `${(tool.durationMs / 1000).toFixed(1)} s`}
              </span>
            ) : null}
            <span
              className={cn(
                "rounded-full px-2 py-px font-ui text-[11px] whitespace-nowrap",
                tool.ok
                  ? "bg-[color-mix(in_srgb,var(--ok)_14%,transparent)] text-[var(--ok)]"
                  : "bg-[color-mix(in_srgb,var(--bad)_14%,transparent)] text-[var(--bad)]",
              )}
            >
              {tool.ok ? "ok" : "failed"}
            </span>
          </>
        )}
      </button>
      {open && tool.resultText ? (
        <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words border-t border-[var(--hair)] px-[9px] py-1.5 font-mono text-[11px] leading-relaxed text-[var(--text-muted)]">
          {tool.resultText}
        </pre>
      ) : null}
    </div>
  );
}

export function UserTurn({ message, now }: { message: Message; now: number }) {
  return (
    <div className="group relative max-w-[82%] self-end">
      <div className="rounded-[10px] bg-[color-mix(in_srgb,var(--accent)_16%,transparent)] px-[11px] py-2">
        <span className="whitespace-pre-wrap font-ui text-[13px] leading-normal text-[var(--text)]">{message.text}</span>
      </div>
      <TurnBar align="end">
        {message.at !== undefined ? (
          <TurnFact text={clock(message.at, now)} title={new Date(message.at).toLocaleString()} />
        ) : null}
        <button
          type="button"
          className={TURN_ICON}
          title="Copy"
          aria-label="Copy your message"
          onClick={() => void writeTextToClipboard(message.text)}
        >
          <Copy className="h-3.5 w-3.5" strokeWidth={1.7} aria-hidden />
        </button>
      </TurnBar>
    </div>
  );
}

export function AgentTurn({
  message,
  profile,
  now,
  onRetry,
  children,
}: {
  message: Message;
  profile: HermesProfile | null;
  now: number;
  onRetry?: (prompt: string) => void;
  /** Decision cards that arrived inside this turn, rendered where they arrived. */
  children?: React.ReactNode;
}) {
  const [runOpen, setRunOpen] = useState(false);
  const tools = message.tools ?? [];
  const name = profile?.displayName || message.from;
  const initial = (name.trim()[0] ?? "?").toUpperCase();
  const collapsed = tools.length > 2 && !runOpen;
  return (
    <div className="group flex gap-[9px]">
      <div
        aria-hidden
        className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--accent-soft)] font-ui text-[11px] font-semibold text-[var(--accent)]"
      >
        {initial}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center gap-[7px]">
          <span className="font-ui text-[13px] text-[var(--text)]">{name}</span>
          {profile?.provider || profile?.model ? (
            <span className="truncate rounded-full bg-[color-mix(in_srgb,var(--runtime)_14%,transparent)] px-2 py-px font-mono text-[10px] text-[var(--runtime)] whitespace-nowrap">
              {[profile.provider, profile.model].filter(Boolean).join(" · ")}
            </span>
          ) : null}
        </div>

        {message.thought ? (
          <details className="rounded-md border-l-2 border-[var(--line-strong)] bg-[var(--crust)] px-2.5 py-[7px]">
            <summary className="cursor-default list-none font-ui text-[12px] text-[var(--text-muted)]">
              Thought
            </summary>
            <p className="mt-1 whitespace-pre-wrap font-ui text-[12px] leading-normal text-[var(--text-muted)]">
              {message.thought.replace(/^\s+/, "")}
            </p>
          </details>
        ) : null}

        {collapsed ? (
          <button
            type="button"
            onClick={() => setRunOpen(true)}
            className="flex items-center gap-2 rounded-md bg-[var(--crust)] px-[9px] py-1.5 text-left"
          >
            <span className="flex-1 font-mono text-[12px] text-[var(--text-muted)]">{tools.length} steps</span>
            <ChevronDown className="h-3 w-3 text-[var(--text-muted)]" strokeWidth={1.8} aria-hidden />
          </button>
        ) : (
          tools.map((tool) => <ToolRowView key={tool.id} tool={tool} />)
        )}

        {children}

        {message.text || message.streaming ? (
          <div className="rounded-[10px] bg-[color-mix(in_srgb,var(--text)_7%,transparent)] px-[11px] py-2">
            {message.text ? (
              <ReplyMarkdown
                content={message.text.replace(/^\s+/, "")}
                className="font-ui text-[13px] leading-normal text-[var(--text)]"
              />
            ) : null}
            {message.streaming ? (
              <span
                aria-hidden
                className="ml-0.5 inline-block h-[13px] w-0.5 -translate-y-px bg-[var(--accent)] align-middle"
              />
            ) : null}
          </div>
        ) : null}

        {(message.facts ?? []).map((fact) => (
          <div key={fact.id} className="flex min-w-0 items-center gap-1.5">
            <TurnFact text={fact.text} title={`${fact.text} · ${new Date(fact.at).toLocaleString()}`} truncate />
          </div>
        ))}

        {!message.streaming && message.text ? (
          <TurnBar>
            <button
              type="button"
              className={TURN_ICON}
              title="Copy"
              aria-label="Copy this reply"
              onClick={() => void writeTextToClipboard(message.text)}
            >
              <Copy className="h-3.5 w-3.5" strokeWidth={1.7} aria-hidden />
            </button>
            {message.tookMs !== undefined ? <TurnFact text={took(message.tookMs)} title="How long this turn took" /> : null}
            <div className="flex-1" />
            {message.at !== undefined ? (
              <TurnFact text={clock(message.at, now)} title={new Date(message.at).toLocaleString()} />
            ) : null}
          </TurnBar>
        ) : null}

        {message.failed ? (
          <div className="rounded-[10px] bg-[color-mix(in_srgb,var(--bad)_11%,transparent)] px-[11px] py-2">
            <p className="font-ui text-[13px] leading-normal text-[var(--bad)]">{message.failed}</p>
            {onRetry && message.prompt ? (
              <div className="mt-2 flex gap-1.5">
                <button
                  type="button"
                  onClick={() => onRetry(message.prompt as string)}
                  className="rounded-full bg-[var(--go-bg)] px-3 py-0.5 font-ui text-[12px] text-[var(--go-fg)] hover:opacity-90"
                >
                  Ask again
                </button>
                <button
                  type="button"
                  onClick={() => void writeTextToClipboard(message.failed as string)}
                  className="rounded-full bg-[color-mix(in_srgb,var(--text)_10%,transparent)] px-3 py-0.5 font-ui text-[12px] text-[var(--text)] hover:opacity-90"
                >
                  Copy error
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
