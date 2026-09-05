import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import { CornerDownLeft, Square } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import { botHandle, displayName } from "./group-membership";
import type { GroupMember } from "./types";

/** The `@…` fragment the caret sits in, or null. Only a handle at a word
 *  boundary counts, so an email address never opens the menu. */
export function mentionFragment(text: string, caret: number): null | { start: number; query: string } {
  const upto = text.slice(0, caret);
  const at = upto.lastIndexOf("@");
  if (at < 0) return null;
  if (at > 0 && !/\s/.test(upto[at - 1])) return null;
  const query = upto.slice(at + 1);
  if (/[\s@]/.test(query)) return null;
  return { start: at, query: query.toLowerCase() };
}

/** Members whose handle or display name starts with the fragment, plus the
 *  broadcast handles. */
export function mentionMatches(
  members: GroupMember[],
  query: string,
): Array<{ handle: string; label: string }> {
  const options = [
    ...members.map((m) => ({ handle: botHandle(m.name, m), label: displayName(m) })),
    { handle: "everyone", label: "Everyone in the room" },
    { handle: "user", label: "You" },
  ];
  if (!query) return options;
  return options.filter(
    (o) => o.handle.startsWith(query) || o.label.toLowerCase().startsWith(query),
  );
}

/** The room composer: a textarea, `@` autocomplete over the roster, Enter to
 *  send, and a Stop button while the room is driving a round. */
export function RoomComposer({
  members,
  running,
  onSend,
  onStop,
  placeholder,
  disabled = false,
  draft,
  onDraft,
}: {
  members: GroupMember[];
  running: boolean;
  onSend: (text: string) => void | Promise<void>;
  onStop: () => void | Promise<void>;
  placeholder?: string;
  disabled?: boolean;
  draft?: string;
  onDraft?: (text: string) => void;
}) {
  const [localText, setLocalText] = useState("");
  const text = draft ?? localText;
  const setText = onDraft ?? setLocalText;
  const [mention, setMention] = useState<null | { start: number; query: string }>(null);
  const [active, setActive] = useState(0);
  const [sending, setSending] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);

  const matches = useMemo(
    () => (mention ? mentionMatches(members, mention.query).slice(0, 8) : []),
    [mention, members],
  );
  const open = matches.length > 0 && mention !== null;

  const sync = (value: string, caret: number) => {
    setText(value);
    const found = mentionFragment(value, caret);
    setMention(found);
    setActive(0);
  };

  const pick = (handle: string) => {
    if (!mention) return;
    const el = ref.current;
    const caret = el?.selectionStart ?? text.length;
    const next = `${text.slice(0, mention.start)}@${handle} ${text.slice(caret)}`;
    setText(next);
    setMention(null);
    requestAnimationFrame(() => {
      const at = mention.start + handle.length + 2;
      el?.focus();
      el?.setSelectionRange(at, at);
    });
  };

  const send = async () => {
    const trimmed = text.trim();
    if (!trimmed || disabled || sending) return;
    setSending(true);
    try {
      await onSend(trimmed);
      if (draft === undefined) setText("");
      setMention(null);
    } finally {
      setSending(false);
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (open) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActive((i) => (i + 1) % matches.length);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setActive((i) => (i - 1 + matches.length) % matches.length);
        return;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        pick(matches[active].handle);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setMention(null);
        return;
      }
    }
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void send();
    }
  };

  return (
    <div className="relative shrink-0 border-t border-[var(--border)] bg-[var(--mantle)] px-4 py-3">
      {open ? (
        <ul
          role="listbox"
          aria-label="Mention a member"
          className="absolute bottom-full left-4 z-30 mb-1 max-h-48 w-64 overflow-y-auto rounded-[var(--r-plane)] border border-[var(--border)] bg-[var(--mantle)] py-1"
          style={{ boxShadow: "var(--shadow-elevated)" }}
        >
          {matches.map((option, index) => (
            <li key={option.handle}>
              <button
                type="button"
                role="option"
                aria-selected={index === active}
                onMouseDown={(event) => {
                  event.preventDefault();
                  pick(option.handle);
                }}
                onMouseEnter={() => setActive(index)}
                className={cn(
                  "flex w-full items-baseline gap-2 px-2.5 py-1.5 text-left",
                  index === active ? "bg-[var(--selected)]" : "hover:bg-[var(--hover)]",
                )}
              >
                <span className="font-ui text-[var(--t-ui)] text-[var(--text)]">@{option.handle}</span>
                <span className="truncate font-ui text-[var(--t-section)] text-[var(--text-muted)]">
                  {option.label}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="flex items-end gap-2">
        <Textarea
          ref={ref}
          rows={1}
          value={text}
          disabled={disabled || sending}
          placeholder={placeholder ?? "Message the room. @name to address someone."}
          onChange={(event) => sync(event.target.value, event.target.selectionStart ?? 0)}
          onKeyDown={onKeyDown}
          className="max-h-40 min-h-9 flex-1 resize-none"
        />
        {running ? (
          <Button size="sm" variant="ghost" onClick={() => void onStop()} title="Stop the room">
            <Square className="h-3.5 w-3.5" />
            Stop
          </Button>
        ) : (
          <Button size="sm" onClick={() => void send()} disabled={disabled || sending || !text.trim()} title="Send (Enter)">
            <CornerDownLeft className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}
