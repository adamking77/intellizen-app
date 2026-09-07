import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { investigationIdForSignal, searchWorkspace } from "@/lib/data";
import { allProjects, type Hierarchy } from "@/lib/hierarchy";
import { LABELS } from "@/lib/labels";
import type { InternalSearchResult } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store";
import { usePluginPaletteCommands } from "@/plugins/commands";
import { toastError } from "@/lib/toast";
import { useHierarchy } from "@/lib/use-hierarchy";
import { readConversationContext } from "@/lib/conversation-context";
import { useSessionStore } from "@/engine/session-store";
import { ReplyMarkdown } from "@/components/agent/reply-markdown";
import { runRoomAction } from "@/components/agent/panel-room";
import { $groupChats } from "@/rooms/group-chat";
import { useValue } from "@/rooms/store";

// ============================================================
// Context + provider
// ============================================================

interface CommandPaletteContextValue {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
}

const CommandPaletteContext = createContext<CommandPaletteContextValue | null>(
  null,
);

export function useCommandPalette() {
  const ctx = useContext(CommandPaletteContext);
  if (!ctx) {
    throw new Error("useCommandPalette must be used inside CommandPaletteProvider");
  }
  return ctx;
}

export function CommandPaletteProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen((v) => !v), []);

  // Global ⌘K / Ctrl+K binding
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isModK = (e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K");
      if (isModK) {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle]);

  const value = useMemo(
    () => ({ isOpen, open, close, toggle }),
    [isOpen, open, close, toggle],
  );

  return (
    <CommandPaletteContext.Provider value={value}>
      {children}
      <CommandPalette />
    </CommandPaletteContext.Provider>
  );
}

// ============================================================
// Commands
// ============================================================

export type ShellCommand = "focus-mode" | "toggle-sidebar";
export const SHELL_COMMAND_EVENT = "intelizen:shell-command";
const shell = (detail: ShellCommand) => () => {
  window.dispatchEvent(new CustomEvent<ShellCommand>(SHELL_COMMAND_EVENT, { detail }));
};

type CommandKind = "navigation" | "action" | "workspace";

interface Command {
  id: string;
  label: string;
  hint?: string;
  kind: CommandKind;
  disabled?: boolean;
  stayOpen?: boolean;
  run: (ctx: { navigate: (to: string) => void }) => void | Promise<void>;
}

interface AskAttempt {
  id: number;
  kind: "profile" | "room";
  targetId: string;
  agent: string;
  question: string;
  questionMessageId: string | null;
  sessionId: string | null;
  submitted: boolean;
  error: string | null;
}

export interface AskSource {
  label: string;
  href: string;
}

/** Links explicitly attached to the correlated reply. No link means no
 * source claim: route context is input material, not proof the agent used it. */
export function askSources(text: string): AskSource[] {
  const sources = new Map<string, AskSource>();
  for (const match of text.matchAll(/\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)/g)) {
    sources.set(match[2], { label: match[1], href: match[2] });
  }
  for (const match of text.matchAll(/https?:\/\/[^\s<>)\]]+/g)) {
    if (sources.has(match[0])) continue;
    let label = match[0];
    try { label = new URL(match[0]).hostname; } catch { /* Keep the visible URL. */ }
    sources.set(match[0], { label, href: match[0] });
  }
  return [...sources.values()].slice(0, 8);
}

const NAV_COMMANDS: Command[] = [
  { id: "nav:home", label: "Home", kind: "navigation", run: ({ navigate }) => navigate("/home") },
  { id: "nav:databases", label: "Databases", kind: "navigation", run: ({ navigate }) => navigate("/databases") },
  { id: "nav:docs", label: LABELS.docs, kind: "navigation", run: ({ navigate }) => navigate("/docs") },
  { id: "nav:graph", label: "Graph", kind: "navigation", run: ({ navigate }) => navigate("/graph") },
  { id: "nav:canvas", label: "Canvas", kind: "navigation", run: ({ navigate }) => navigate("/canvas") },
  { id: "nav:settings-appearance", label: "Go to Settings ▸ Appearance", kind: "navigation", run: ({ navigate }) => navigate("/settings?section=appearance") },
];

const ACTION_COMMANDS: Command[] = [
  { id: "act:open-graph", label: "Open Graph", kind: "action", run: ({ navigate }) => navigate("/graph") },
  { id: "act:focus-mode", label: "Focus mode", hint: "⌘⇧F", kind: "action", run: shell("focus-mode") },
  { id: "act:toggle-sidebar", label: "Toggle sidebar", hint: "⌘\\", kind: "action", run: shell("toggle-sidebar") },
];

function commandFromWorkspaceResult(result: InternalSearchResult, tree: Hierarchy): Command {
  const label = result.title || "Untitled result";
  const hint = result.subtitle ?? result.source_type.replace("_", " ");
  return {
    id: `workspace:${result.source_type}:${result.source_id}`,
    label,
    hint,
    kind: "workspace",
    run: async ({ navigate }) => {
      if (result.source_type === "intel_signal") {
        const investigationId = await investigationIdForSignal(Number(result.source_id));
        const project = allProjects(tree).find((candidate) => candidate.legacy_investigation_id === investigationId);
        if (project) {
          navigate(`/project/${project.id}?tab=evidence`);
          return;
        }
        if (result.url?.startsWith("http")) window.open(result.url, "_blank", "noopener,noreferrer");
        return;
      }
      if (result.source_type === "knowledge_document") {
        navigate("/docs");
        return;
      }
      navigate("/databases");
    },
  };
}

// ============================================================
// Fuzzy match (tiny, deterministic)
// ============================================================

function fuzzyScore(query: string, text: string): number {
  if (!query) return 1;
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  if (t.includes(q)) return 10 + (10 - Math.min(9, t.indexOf(q)));
  let qi = 0;
  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] === q[qi]) qi++;
  }
  return qi === q.length ? 1 : 0;
}

// ============================================================
// Modal UI
// ============================================================

function CommandPalette() {
  const { isOpen, close } = useCommandPalette();
  const navigate = useNavigate();
  const entityFilter = useAppStore((state) => state.entityFilter);
  const { tree } = useHierarchy();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [ask, setAsk] = useState<AskAttempt | null>(null);
  const askSequence = useRef(0);
  const selectedRoomId = useSessionStore((state) => state.selectedRoomId);
  const rooms = useValue($groupChats);
  const selectedRoom = selectedRoomId ? rooms[selectedRoomId] : null;
  const selectedProfile = useSessionStore((state) => state.selectedRoomId ? null : state.selectedProfile);
  const selectedAgent = useSessionStore((state) => selectedProfile ? state.profileDirectory[selectedProfile] : null);
  const askThread = useSessionStore((state) => ask?.kind === "profile" ? state.threads[ask.targetId] : undefined);
  const askRoom = ask?.kind === "room" ? rooms[ask.targetId] : undefined;
  const profileAskedAt = ask?.kind === "profile" && ask.questionMessageId && askThread?.sessionId === ask.sessionId
    ? askThread.transcript.messages.findIndex((message) => message.id === ask.questionMessageId && message.from === "you")
    : -1;
  const profileTail = profileAskedAt >= 0 ? askThread?.transcript.messages.slice(profileAskedAt + 1) ?? [] : [];
  const profileBoundary = profileTail.findIndex((message) => message.from === "you");
  const profileAnswer = profileAskedAt >= 0
    ? profileTail.slice(0, profileBoundary < 0 ? undefined : profileBoundary).find((message) => message.from !== "you")
    : undefined;
  const roomAskedAt = ask?.kind === "room" && ask.questionMessageId
    ? askRoom?.log.findIndex((message) => message.id === ask.questionMessageId && message.from.kind === "user") ?? -1
    : -1;
  const roomQuestion = roomAskedAt >= 0 ? askRoom?.log[roomAskedAt] : undefined;
  const roomTail = roomQuestion ? askRoom?.log.slice(roomAskedAt + 1) ?? [] : [];
  const roomBoundary = roomTail.findIndex((message) => message.from.kind === "user");
  const roomAnswers = roomQuestion
    ? roomTail.slice(0, roomBoundary < 0 ? undefined : roomBoundary).filter((message) => message.from.kind === "member" && message.thread === roomQuestion.thread)
    : [];
  const answerText = ask?.kind === "room" ? roomAnswers.map((message) => message.text).join("\n\n") : profileAnswer?.text ?? "";
  const sources = useMemo(() => askSources(answerText), [answerText]);
  const askRunning = Boolean(ask && !ask.error && (!ask.submitted || (ask.kind === "room"
    ? Boolean(roomQuestion && roomBoundary < 0 && askRoom?.running)
    : Boolean(profileAskedAt >= 0 && profileBoundary < 0 && askThread?.transcript.turnStartedAt !== null))));
  const workspaceQuery = query.trim();
  const { data: workspaceResults = [] } = useQuery({
    queryKey: ["command-palette-workspace-search", workspaceQuery, entityFilter],
    queryFn: () => searchWorkspace({ query: workspaceQuery, entity: entityFilter, limit: 8 }),
    enabled: isOpen && workspaceQuery.length >= 2,
  });

  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setActiveIndex(0);
      // Focus after mount animation
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [isOpen]);

  const pluginCommands = usePluginPaletteCommands(); // wave-1 plugins
  const askQuestion = useCallback(async () => {
    const question = query.trim();
    const state = useSessionStore.getState();
    const roomId = state.selectedRoomId;
    const room = roomId ? $groupChats.get()[roomId] : null;
    const profile = roomId ? null : state.selectedProfile;
    if (!question || askRunning || (!room && !profile)) return;
    const agent = room
      ? room.name || "Team"
      : state.profileDirectory[profile!]?.displayName || state.profileDirectory[profile!]?.name || profile!;
    const id = ++askSequence.current;
    setAsk({
      id,
      kind: room ? "room" : "profile",
      targetId: room ? roomId! : profile!,
      agent,
      question,
      questionMessageId: null,
      sessionId: null,
      submitted: false,
      error: null,
    });
    try {
      const context = readConversationContext();
      if (room) {
        const sent = await runRoomAction({ type: "room-send", roomId: roomId!, text: question, context, preservePanelDraft: true });
        setAsk((current) => current?.id === id ? { ...current, questionMessageId: sent?.messageId ?? null, submitted: true } : current);
      } else {
        await state.send(profile!, question, [], context, {
          preservePanelDraft: true,
          onQueued: (messageId, sessionId) => setAsk((current) => current?.id === id
            ? { ...current, questionMessageId: messageId, sessionId, submitted: true }
            : current),
        });
      }
    } catch (error) {
      setAsk((current) => current?.id === id
        ? { ...current, error: error instanceof Error ? error.message : String(error) }
        : current);
    }
  }, [query, askRunning]);
  const groups = useMemo(() => {
    const rank = (cmds: Command[]) =>
      cmds
        .map((c) => ({ c, score: fuzzyScore(query, c.label) }))
        .filter((r) => r.score > 0)
        .sort((a, b) => b.score - a.score)
        .map((r) => r.c);

    const workspaceCommands = workspaceResults.map((result) => commandFromWorkspaceResult(result, tree));
    const targetId = selectedRoom ? selectedRoomId : selectedAgent ? selectedProfile : null;
    const targetLabel = selectedRoom?.name || selectedAgent?.displayName || selectedAgent?.name || targetId;
    const askCommand: Command[] = workspaceQuery && targetId ? [{
      id: `ask:${targetId}`,
      label: `“${workspaceQuery}”`,
      hint: askRunning ? "asking" : "↵ to ask",
      kind: "action",
      disabled: askRunning,
      stayOpen: true,
      run: askQuestion,
    }] : [];

    return [
      { heading: "Go", items: rank([...NAV_COMMANDS, ...ACTION_COMMANDS, ...pluginCommands]) },
      { heading: "Found", items: workspaceCommands },
      { heading: `Ask ${targetLabel || "an agent"}`, items: askCommand },
    ].filter((g) => g.items.length > 0);
  }, [query, workspaceQuery, workspaceResults, pluginCommands, tree, selectedRoom, selectedRoomId, selectedProfile, selectedAgent, askRunning, askQuestion]);

  const flatResults = useMemo(() => groups.flatMap((g) => g.items), [groups]);

  useEffect(() => {
    if (activeIndex >= flatResults.length) {
      setActiveIndex(Math.max(0, flatResults.length - 1));
    }
  }, [flatResults.length, activeIndex]);

  const execute = useCallback(
    (cmd: Command) => {
      if (cmd.disabled) return;
      void Promise.resolve(cmd.run({ navigate })).catch((error) => toastError("Couldn't open search result", error));
      if (!cmd.stayOpen) close();
    },
    [navigate, close],
  );

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      className="fixed inset-0 z-50 flex items-start justify-center pt-[13vh]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0" style={{ background: "color-mix(in srgb, var(--crust) 72%, transparent)" }} onMouseDown={close} aria-hidden />

      <div
        className={cn(
          "relative z-10 flex max-h-[72dvh] w-[760px] max-w-[calc(100vw-32px)] flex-col overflow-hidden",
          "animate-fade-in",
        )}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            close();
          } else if (e.key === "ArrowDown") {
            e.preventDefault();
            setActiveIndex((i) => Math.min(Math.max(0, flatResults.length - 1), i + 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActiveIndex((i) => Math.max(0, i - 1));
          } else if (e.key === "Enter") {
            if (e.target instanceof HTMLAnchorElement || e.target instanceof HTMLButtonElement) return;
            e.preventDefault();
            const cmd = flatResults[activeIndex];
            if (cmd) execute(cmd);
          }
        }}
      >
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={groups.length > 0}
          aria-controls="cp-listbox"
          aria-activedescendant={flatResults[activeIndex] ? `cp-${flatResults[activeIndex].id}` : undefined}
          aria-autocomplete="list"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActiveIndex(0);
          }}
          placeholder="Type to go, find, or ask…"
          className={cn(
            "w-full border-b border-[var(--text-muted)] bg-transparent px-0 pb-3 pt-1",
            "font-ui text-[28px] font-light leading-tight text-[var(--text)]",
            "placeholder:text-[var(--text-dim)]",
            "focus:outline-none",
          )}
        />

        <div className="min-h-0 flex-1 overflow-y-auto pt-2">
          <div id="cp-listbox" role="listbox" aria-label="Commands">
          {groups.length === 0 && (
            <div className="py-6 text-center font-ui text-[var(--t-ui)] text-[var(--text-muted)]">
              No results
            </div>
          )}
          {groups.map((group) => {
            return (
              <div key={group.heading} className="border-t border-[var(--line)] py-3">
                <div className="pb-1">
                  <span className="font-mono text-[10px] font-normal uppercase tracking-[0.12em] text-[var(--text-muted)]">
                    {group.heading}
                  </span>
                </div>
                {group.items.map((cmd) => {
                  const flatIdx = flatResults.indexOf(cmd);
                  const isActive = flatIdx === activeIndex;
                  return (
                    <button
                      key={cmd.id}
                      id={`cp-${cmd.id}`}
                      type="button"
                      role="option"
                      aria-selected={isActive}
                      disabled={cmd.disabled}
                      onMouseEnter={() => setActiveIndex(flatIdx)}
                      onClick={() => execute(cmd)}
                      className={cn(
                        "flex w-full items-center justify-between rounded-[var(--r-ctl)] px-0 py-1.5 text-left",
                        "font-ui text-[18px] font-light leading-snug",
                        "transition-colors duration-[var(--t-base)] ease-[var(--ease)]",
                        cmd.disabled && "opacity-60",
                        isActive
                          ? "text-[var(--text)]"
                          : "text-[var(--text-muted)] hover:text-[var(--text)]",
                      )}
                    >
                      <span>{cmd.label}</span>
                      {cmd.hint && (
                        <span className="font-mono text-[10px] text-[var(--text-muted)]">
                          {cmd.hint}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
          </div>
          {ask ? <section aria-label={`Answer from ${ask.agent}`} className="border-t border-[var(--line)] py-4">
            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--accent-text)]">{ask.agent} · answer</p>
            <p className="mt-1 font-ui text-[15px] text-[var(--text-muted)]">{ask.question}</p>
            {ask.error || profileAnswer?.failed ? <p role="alert" className="mt-3 text-[var(--t-ui)] text-[var(--bad)]">{ask.error || profileAnswer?.failed}</p> : ask.kind === "room" && roomAnswers.length ? (
              <div className="mt-3 grid gap-3">{roomAnswers.map((message) => <div key={message.id || `${message.at}:${message.from.name}`}>
                <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--text-muted)]">{message.from.name}</p>
                <ReplyMarkdown content={message.text} className="mt-1 font-ui text-[17px] leading-relaxed text-[var(--text)]" />
              </div>)}</div>
            ) : profileAnswer?.text ? (
              <ReplyMarkdown content={profileAnswer.text} className="mt-3 font-ui text-[17px] leading-relaxed text-[var(--text)]" />
            ) : <p role="status" className="mt-3 font-ui text-[var(--t-ui)] text-[var(--text-muted)]">{askRunning ? `${ask.agent} is checking…` : "No answer was returned."}</p>}
            {(ask.kind === "room" ? Boolean(roomQuestion && !askRoom?.running) : Boolean(profileAnswer && !profileAnswer.streaming)) ? <div className="mt-4 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 border-t border-[var(--line)] pt-3 font-mono text-[10px] text-[var(--text-muted)]">
              <span className="uppercase tracking-[0.1em]">Sources</span>
              {sources.length ? <span className="flex flex-wrap gap-x-3 gap-y-1">{sources.map((source) => <a key={source.href} href={source.href} target="_blank" rel="noreferrer" className="text-[var(--accent-text)] underline decoration-[var(--accent-border)] underline-offset-2">{source.label}</a>)}</span> : <span>None attached to this answer</span>}
            </div> : null}
          </section> : null}
        </div>

        <div className="flex items-center justify-between border-t border-[var(--line)] py-2">
          <div className="flex items-center gap-3 font-mono text-[10px] text-[var(--text-muted)]">
            <span>
              <span className="font-mono">↑↓</span> Navigate
            </span>
            <span>
              <span className="font-mono">↵</span> Open or ask
            </span>
            <span>
              <span className="font-mono">Esc</span> Close
            </span>
          </div>
          <span className="font-mono text-[10px] text-[var(--text-muted)]">⌘K</span>
        </div>
      </div>
    </div>
  );
}
