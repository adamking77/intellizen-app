import { useState } from "react";
import { ChevronDown, Copy, FileText, Pencil, RotateCcw, Volume2, VolumeX } from "lucide-react";

import { took, clock } from "@/components/agent/turn-time";
import {
  agentTurnActions,
  errorReport,
  failureActions,
  turnText,
  userTurnActions,
  type ActionContext,
  type MessageAction,
  type MessageActionId,
} from "@/components/agent/message-actions";
import { ReplyMarkdown } from "@/components/agent/reply-markdown";
import type { HermesProfile } from "@/engine/profiles";
import { Avatar, identityColor } from "@/components/agents/avatar";
import type { Message, ToolRow } from "@/engine/transcript";
import { writeTextToClipboard } from "@/lib/clipboard";
import { cn } from "@/lib/utils";

const TURN_ICON =
  "inline-flex h-5 w-5 items-center justify-center rounded text-[var(--text-muted)] transition-colors hover:bg-[var(--hover)] hover:text-[var(--text)]";

/** A fact about a turn, in the row with its controls. Not a control, so it
 *  never rides the hover fade. */
export function TurnFact({ text, title, truncate }: { text: string; title?: string; truncate?: boolean }) {
  return (
    <span
      className={cn(
        "px-0.5 font-ui text-[var(--t-meta)] tabular-nums text-[var(--text-muted)] whitespace-nowrap",
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

const ACTION_ICON: Record<MessageActionId, typeof Copy> = {
  copy: Copy,
  read: Volume2,
  "stop-reading": VolumeX,
  document: FileText,
  "ask-again": RotateCcw,
  edit: Pencil,
};

/** One act on a turn, as an icon with the word behind it. The donor's shipped
 *  shape: no `⋯`, no menu — those were specified and rejected on sight. */
function ActionIcon({ action, onRun }: { action: MessageAction; onRun: (id: MessageActionId) => void }) {
  const Icon = ACTION_ICON[action.id];
  return (
    <button
      type="button"
      className={TURN_ICON}
      title={action.title}
      aria-label={action.label}
      onClick={() => onRun(action.id)}
    >
      <Icon className="h-3.5 w-3.5" strokeWidth={1.7} aria-hidden />
    </button>
  );
}

/** What a surface can do to the turns in it. Every entry is optional: the
 *  HUD has no document route, and a panel with no engine can send nothing. */
export interface TurnActions extends Partial<ActionContext> {
  onRead?: (message: Message) => void;
  onStopReading?: () => void;
  onDocument?: (message: Message) => void;
  onAskAgain?: (prompt: string) => void;
  onEdit?: (text: string) => void;
}

function contextOf(actions: TurnActions | undefined, reading: boolean): ActionContext {
  return {
    canRead: Boolean(actions?.onRead) && actions?.canRead !== false,
    reading,
    canDocument: Boolean(actions?.onDocument),
    canSend: actions?.canSend !== false && Boolean(actions?.onAskAgain ?? actions?.onEdit),
  };
}

function ToolRowView({ tool }: { tool: ToolRow }) {
  const [open, setOpen] = useState(false);
  const canOpen = Boolean(tool.resultText);
  return (
    <div className="rounded-[var(--r-row)] bg-[var(--crust)]">
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
        <span className="min-w-0 flex-1 truncate font-mono text-[var(--t-meta)] text-[var(--text-muted)]">{tool.title}</span>
        {tool.ok === undefined ? (
          <span className="font-mono text-[var(--t-section)] text-[var(--text-muted)]">running</span>
        ) : (
          <>
            {tool.durationMs !== undefined ? (
              <span className="font-mono text-[var(--t-section)] tabular-nums text-[var(--text-muted)]">
                {tool.durationMs < 1000 ? `${tool.durationMs} ms` : `${(tool.durationMs / 1000).toFixed(1)} s`}
              </span>
            ) : null}
            <span
              className={cn(
                "rounded-[var(--r-pill)] px-2 py-px font-ui text-[var(--t-section)] whitespace-nowrap",
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
        <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words border-t border-[var(--hair)] px-[9px] py-1.5 font-mono text-[var(--t-section)] leading-relaxed text-[var(--text-muted)]">
          {tool.resultText}
        </pre>
      ) : null}
    </div>
  );
}

export function UserTurn({
  message,
  now,
  actions,
}: {
  message: Message;
  now: number;
  actions?: TurnActions;
}) {
  // Editing replaces the bubble with an editor rather than opening a second
  // composer: the real one carries the target and the permissions, and Send
  // hands straight to it.
  const [draft, setDraft] = useState<string | null>(null);
  const editing = draft !== null;

  const run = (id: MessageActionId) => {
    if (id === "copy") void writeTextToClipboard(message.text);
    else if (id === "edit") setDraft(message.text);
  };

  if (editing) {
    return (
      <div className="max-w-[82%] self-end">
        <div className="rounded-[var(--r-msg)] border border-[var(--accent-border)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] px-[11px] py-2">
          <textarea
            value={draft}
            autoFocus
            rows={Math.min(14, draft.split("\n").length + 1)}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setDraft(null);
              else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                if (draft.trim()) actions?.onEdit?.(draft.trim());
                setDraft(null);
              }
            }}
            aria-label="Edit this message"
            className="w-full resize-none bg-transparent font-ui text-[var(--t-ui)] leading-normal text-[var(--text)] outline-none"
          />
          <div className="mt-1.5 flex justify-end gap-1.5">
            <button
              type="button"
              onClick={() => setDraft(null)}
              className="rounded-[var(--r-pill)] bg-[color-mix(in_srgb,var(--text)_10%,transparent)] px-3 py-0.5 font-ui text-[var(--t-meta)] text-[var(--text)] transition-colors hover:bg-[color-mix(in_srgb,var(--text)_14%,transparent)]"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!draft.trim()}
              onClick={() => {
                actions?.onEdit?.(draft.trim());
                setDraft(null);
              }}
              className="rounded-[var(--r-pill)] bg-[var(--go-bg)] px-3 py-0.5 font-ui text-[var(--t-meta)] text-[var(--go-fg)] transition-[filter] hover:brightness-110 disabled:opacity-40 disabled:hover:brightness-100"
            >
              Send
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="group relative max-w-[82%] self-end">
      <div className="rounded-[var(--r-msg)] bg-[color-mix(in_srgb,var(--accent)_16%,transparent)] px-[11px] py-2">
        <span className="whitespace-pre-wrap font-ui text-[var(--t-ui)] leading-normal text-[var(--text)]">{message.text}</span>
      </div>
      <TurnBar align="end">
        {message.at !== undefined ? (
          <TurnFact text={clock(message.at, now)} title={new Date(message.at).toLocaleString()} />
        ) : null}
        {userTurnActions(message, contextOf(actions, false)).map((action) => (
          <ActionIcon key={action.id} action={action} onRun={run} />
        ))}
      </TurnBar>
    </div>
  );
}

export function AgentTurn({
  message,
  profile,
  now,
  onRetry,
  actions,
  reading,
  showReasoning = true,
  children,
}: {
  message: Message;
  profile: HermesProfile | null;
  now: number;
  onRetry?: (prompt: string) => void;
  actions?: TurnActions;
  /** Measured playback amplitude while this reply is being spoken. */
  reading?: number;
  showReasoning?: boolean;
  /** Decision cards that arrived inside this turn, rendered where they arrived. */
  children?: React.ReactNode;
}) {
  const [runOpen, setRunOpen] = useState(false);
  const runAction = (id: MessageActionId) => {
    if (id === "copy") void writeTextToClipboard(turnText(message));
    else if (id === "read") actions?.onRead?.(message);
    else if (id === "stop-reading") actions?.onStopReading?.();
    else if (id === "document") actions?.onDocument?.(message);
    else if (id === "ask-again" && message.prompt) actions?.onAskAgain?.(message.prompt);
  };
  const tools = message.tools ?? [];
  const name = profile?.displayName || message.from;
  const agentColor = identityColor(name, profile?.avatarColor);
  const collapsed = tools.length > 2 && !runOpen;
  return (
    <div className="group flex gap-[9px]">
      <div className="mt-0.5 shrink-0">
        <Avatar
          agent={{
            displayName: name,
            avatarStyle: profile?.avatarStyle ?? "sphere",
            avatarKind: profile?.avatarKind,
            avatarColor: profile?.avatarColor,
          }}
          size={24}
          image={profile?.avatarImage}
          speaking={reading}
        />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center gap-[7px]">
          <span className="font-ui text-[var(--t-ui)] text-[var(--text)]">{name}</span>
          {profile?.provider || profile?.model ? (
            <span className="truncate rounded-[var(--r-pill)] bg-[color-mix(in_srgb,var(--runtime)_14%,transparent)] px-2 py-px font-mono text-[var(--t-count)] text-[var(--runtime)] whitespace-nowrap">
              {[profile.provider, profile.model].filter(Boolean).join(" · ")}
            </span>
          ) : null}
        </div>

        {showReasoning && message.thought ? (
          <details className="rounded-[var(--r-row)] bg-[var(--crust)] px-2.5 py-[7px]">
            <summary className="cursor-default list-none font-ui text-[var(--t-meta)] text-[var(--text-muted)]">
              Thought
            </summary>
            <p className="mt-1 whitespace-pre-wrap font-ui text-[var(--t-meta)] leading-normal text-[var(--text-muted)]">
              {message.thought.replace(/^\s+/, "")}
            </p>
          </details>
        ) : null}

        {collapsed ? (
          <button
            type="button"
            onClick={() => setRunOpen(true)}
            className="flex items-center gap-2 rounded-[var(--r-row)] bg-[var(--crust)] px-[9px] py-1.5 text-left"
          >
            <span className="flex-1 font-mono text-[var(--t-meta)] text-[var(--text-muted)]">{tools.length} steps</span>
            <ChevronDown className="h-3 w-3 text-[var(--text-muted)]" strokeWidth={1.8} aria-hidden />
          </button>
        ) : (
          tools.map((tool) => <ToolRowView key={tool.id} tool={tool} />)
        )}

        {children}

        {message.text || message.streaming ? (
          <div
            className="rounded-[var(--r-msg)] px-[11px] py-2"
            style={{ background: `color-mix(in srgb, ${agentColor} 12%, transparent)` }}
          >
            {message.text ? (
              <ReplyMarkdown
                content={message.text.replace(/^\s+/, "")}
                className="font-ui text-[var(--t-ui)] leading-normal text-[var(--text)]"
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
            {agentTurnActions(message, contextOf(actions, Boolean(reading))).map((action) => (
              <ActionIcon key={action.id} action={action} onRun={runAction} />
            ))}
            {message.tookMs !== undefined ? <TurnFact text={took(message.tookMs)} title="How long this turn took" /> : null}
            <div className="flex-1" />
            {message.at !== undefined ? (
              <TurnFact text={clock(message.at, now)} title={new Date(message.at).toLocaleString()} />
            ) : null}
          </TurnBar>
        ) : null}

        {message.failed ? (
          <div className="rounded-[var(--r-msg)] bg-[color-mix(in_srgb,var(--bad)_11%,transparent)] px-[11px] py-2">
            <p className="font-ui text-[var(--t-ui)] leading-normal text-[var(--bad)]">{message.failed}</p>
            {/* Word-labelled and always visible: an action you must hover to
                discover is not offered, and the row survives greyscale. */}
            <div className="mt-2 flex gap-1.5">
              {failureActions(Boolean(onRetry && message.prompt)).map((action) => (
                <button
                  key={action.id}
                  type="button"
                  onClick={() =>
                    action.id === "retry"
                      ? onRetry?.(message.prompt as string)
                      : void writeTextToClipboard(
                          errorReport({
                            reason: message.failed ?? "",
                            agent: profile?.displayName || profile?.name,
                            provider: profile?.provider,
                            model: profile?.model,
                          }),
                        )
                  }
                  className={cn(
                    "rounded-[var(--r-pill)] px-3 py-0.5 font-ui text-[var(--t-meta)] transition-colors",
                    action.id === "retry"
                      ? "bg-[var(--go-bg)] text-[var(--go-fg)] hover:brightness-110"
                      : "bg-[color-mix(in_srgb,var(--text)_10%,transparent)] text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--text)_14%,transparent)]",
                  )}
                >
                  {action.label}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
