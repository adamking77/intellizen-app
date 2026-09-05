import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Composer } from "@/components/agent/agent-composer";
import { SEND_ON_ENTER_KEY, usePreference } from "@/lib/settings-preferences";
import { joinVoiceText, useVoice, type VoiceHandle } from "@/voice/use-voice";
import { VoiceButton } from "@/voice/voice-button";
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
  name = "the team",
  onEject,
  voice: sharedVoice,
  showVoiceControls = true,
}: {
  members: GroupMember[];
  running: boolean;
  onSend: (text: string) => void | Promise<void>;
  onStop: () => void | Promise<void>;
  placeholder?: string;
  disabled?: boolean;
  draft?: string;
  onDraft?: (text: string) => void;
  name?: string;
  onEject?: () => void;
  voice?: VoiceHandle;
  showVoiceControls?: boolean;
}) {
  const [localText, setLocalText] = useState("");
  const text = draft ?? localText;
  const setText = onDraft ?? setLocalText;
  const [mention, setMention] = useState<null | { start: number; query: string }>(null);
  const [active, setActive] = useState(0);
  const [sending, setSending] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  const [sendOnEnter] = usePreference(SEND_ON_ENTER_KEY, "1");
  const ownVoice = useVoice({
    profile: null,
    messages: [],
    sending: running,
    onSend: () => undefined,
    onTranscript: (heard) => setText(joinVoiceText(text, heard)),
  });
  const voice = sharedVoice ?? ownVoice;
  const teamVoice = { ...voice, canConverse: false, why: "Conversation works with one agent at a time." };

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
    if (!trimmed || disabled || sending || running || voice.mine || voice.hearing) return;
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
    if (event.nativeEvent.isComposing) return;
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
  };

  return (
    <div className="relative shrink-0">
      {open ? (
        <ul
          role="listbox"
          aria-label="Mention a member"
          className="absolute bottom-full left-0 z-30 mb-1 max-h-48 w-64 max-w-full overflow-y-auto rounded-[var(--r-plane)] bg-[var(--raised)] p-1"
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

      <Composer
        ref={ref}
        draft={voice.interim ? joinVoiceText(text, voice.interim) : text}
        onDraft={(value) => sync(value, ref.current?.selectionStart ?? value.length)}
        onKeyDown={onKeyDown}
        onSend={() => void send().catch(() => undefined)}
        onStop={() => void onStop()}
        onEject={onEject}
        placeholder={placeholder ?? `Message ${name}…`}
        ready={!disabled && !sending && !voice.mine && !voice.hearing}
        running={running}
        agent={name}
        permission={null}
        note={voice.note}
        dictating={voice.mine || voice.hearing}
        sendOnEnter={sendOnEnter !== "0"}
        dictate={showVoiceControls ? <VoiceButton mode="dictate" voice={voice} onTranscript={() => undefined} /> : undefined}
        converse={showVoiceControls ? <VoiceButton mode="converse" voice={teamVoice} onTranscript={() => undefined} /> : undefined}
      />
    </div>
  );
}
