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
import { useLocation, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";

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

type CommandKind = "navigation" | "action";

interface Command {
  id: string;
  label: string;
  hint?: string;
  kind: CommandKind;
  scope?: string; // route prefix for scoped-only commands
  run: (ctx: { navigate: (to: string) => void }) => void;
}

const NAV_COMMANDS: Command[] = [
  { id: "nav:inbox", label: "Inbox", kind: "navigation", run: ({ navigate }) => navigate("/inbox") },
  { id: "nav:monitors", label: "Monitors", kind: "navigation", run: ({ navigate }) => navigate("/monitors") },
  { id: "nav:search", label: "Search", kind: "navigation", run: ({ navigate }) => navigate("/search") },
  { id: "nav:projects", label: "Ops", kind: "navigation", run: ({ navigate }) => navigate("/projects") },
  { id: "nav:graph", label: "Graph", kind: "navigation", run: ({ navigate }) => navigate("/graph") },
  { id: "nav:investigate", label: "Investigate", kind: "navigation", run: ({ navigate }) => navigate("/investigate") },
  { id: "nav:reports", label: "Reports", kind: "navigation", run: ({ navigate }) => navigate("/reports") },
];

const ACTION_COMMANDS: Command[] = [
  { id: "act:new-investigation", label: "New investigation", hint: "Investigate", kind: "action", run: ({ navigate }) => navigate("/investigate") },
  { id: "act:new-monitor", label: "New monitor", hint: "Monitors", kind: "action", run: ({ navigate }) => navigate("/monitors") },
  { id: "act:new-project", label: "New project", hint: "Ops", kind: "action", run: ({ navigate }) => navigate("/projects") },
  { id: "act:run-monitor", label: "Run monitor", hint: "Refresh Inbox", kind: "action", run: ({ navigate }) => navigate("/inbox") },
  { id: "act:open-graph", label: "Open Graph", kind: "action", run: ({ navigate }) => navigate("/graph") },
  { id: "act:search-web", label: "Search — Web", hint: "Exa web", kind: "action", run: ({ navigate }) => navigate("/search?mode=web") },
  { id: "act:search-news", label: "Search — News", kind: "action", run: ({ navigate }) => navigate("/search?mode=news") },
  { id: "act:search-people", label: "Search — People", kind: "action", run: ({ navigate }) => navigate("/search?mode=people") },
  { id: "act:search-research", label: "Search — Research", kind: "action", run: ({ navigate }) => navigate("/search?mode=research") },
];

const SCOPED_COMMANDS: Command[] = [
  { id: "scope:investigate:run-phase", label: "Run active phase", hint: "Investigate", kind: "action", scope: "/investigate", run: () => {} },
  { id: "scope:investigate:open-artifact", label: "Open artifact", hint: "Investigate", kind: "action", scope: "/investigate", run: () => {} },
];

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
  const location = useLocation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setActiveIndex(0);
      // Focus after mount animation
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [isOpen]);

  const scoped = useMemo(
    () =>
      SCOPED_COMMANDS.filter((c) => !c.scope || location.pathname.startsWith(c.scope)),
    [location.pathname],
  );

  const groups = useMemo(() => {
    const rank = (cmds: Command[]) =>
      cmds
        .map((c) => ({ c, score: fuzzyScore(query, c.label) }))
        .filter((r) => r.score > 0)
        .sort((a, b) => b.score - a.score)
        .map((r) => r.c);

    return [
      { heading: "Navigation", items: rank(NAV_COMMANDS) },
      { heading: "Actions", items: rank([...scoped, ...ACTION_COMMANDS]) },
    ].filter((g) => g.items.length > 0);
  }, [query, scoped]);

  const flatResults = useMemo(() => groups.flatMap((g) => g.items), [groups]);

  useEffect(() => {
    if (activeIndex >= flatResults.length) {
      setActiveIndex(Math.max(0, flatResults.length - 1));
    }
  }, [flatResults.length, activeIndex]);

  const execute = useCallback(
    (cmd: Command) => {
      cmd.run({ navigate });
      close();
    },
    [navigate, close],
  );

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-[var(--crust)]/70" aria-hidden />

      <div
        className={cn(
          "relative z-10 w-[560px] max-w-[90vw] overflow-hidden rounded-xl",
          "bg-[var(--mantle)] border border-[var(--surface-1)]",
          "shadow-[0_8px_24px_rgba(0,0,0,0.4)]",
          "animate-fade-in",
        )}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            close();
          } else if (e.key === "ArrowDown") {
            e.preventDefault();
            setActiveIndex((i) => Math.min(flatResults.length - 1, i + 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActiveIndex((i) => Math.max(0, i - 1));
          } else if (e.key === "Enter") {
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
          placeholder="Type a command or search…"
          className={cn(
            "w-full bg-[var(--crust)] px-4 py-3",
            "font-ui text-[15px] text-[var(--text)]",
            "placeholder:text-[var(--overlay-0)]",
            "border-b border-[var(--border)]",
            "focus:outline-none",
          )}
        />

        <div id="cp-listbox" role="listbox" aria-label="Commands" className="max-h-[50vh] overflow-y-auto py-2">
          {groups.length === 0 && (
            <div className="px-4 py-6 text-center font-ui text-[13px] text-[var(--overlay-1)]">
              No results
            </div>
          )}
          {groups.map((group) => {
            return (
              <div key={group.heading} className="pb-2">
                <div className="px-4 pb-1 pt-2">
                  <span className="font-ui text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--overlay-1)]">
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
                      onMouseEnter={() => setActiveIndex(flatIdx)}
                      onClick={() => execute(cmd)}
                      className={cn(
                        "flex w-full items-center justify-between px-4 py-2 text-left",
                        "font-ui text-[13px]",
                        "transition-colors duration-150 ease-[cubic-bezier(0.16,1,0.3,1)]",
                        isActive
                          ? "bg-[var(--accent-soft)] text-[var(--text)]"
                          : "text-[var(--subtext-1)] hover:bg-[var(--surface-wash)]",
                      )}
                    >
                      <span>{cmd.label}</span>
                      {cmd.hint && (
                        <span className="font-mono text-[11px] text-[var(--overlay-1)]">
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

        <div className="flex items-center justify-between border-t border-[var(--border)] bg-[var(--base)] px-4 py-2">
          <div className="flex items-center gap-3 font-ui text-[10px] uppercase tracking-[0.14em] text-[var(--overlay-1)]">
            <span>
              <span className="font-mono">↑↓</span> Navigate
            </span>
            <span>
              <span className="font-mono">↵</span> Run
            </span>
            <span>
              <span className="font-mono">Esc</span> Close
            </span>
          </div>
          <span className="font-mono text-[10px] text-[var(--overlay-1)]">⌘K</span>
        </div>
      </div>
    </div>
  );
}
