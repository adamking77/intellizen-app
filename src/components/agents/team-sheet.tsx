// Make or edit a team, after hermes-app's `TeamSheet.tsx`: member checkboxes,
// the six cap, the name defaulting to who is in it.

import { Dialog } from "@base-ui/react/dialog";
import { useEffect, useMemo, useRef, useState } from "react";

import { errorMessage } from "@/lib/toast";
import { cn } from "@/lib/utils";

import {
  engineLabel,
  filterAgents,
  handleOf,
  MAX_TEAM_MEMBERS,
  MIN_TEAM_MEMBERS,
  TEAM_SEARCH_THRESHOLD,
  type Agent,
  type Team,
} from "./agent-model";
import { Avatar } from "./avatar";

const INPUT =
  "min-w-0 rounded-[var(--r-row)] border-0 bg-[var(--mantle)] px-[9px] py-1.5 font-ui text-[var(--t-ui)] text-[var(--text)] " +
  "placeholder:text-[var(--overlay-0)] focus:outline-none focus:shadow-none";

export function TeamSheet({
  agents,
  team,
  images,
  onClose,
  onSave,
  onDelete,
}: {
  agents: Agent[];
  /** The team being edited, or undefined when making a new one. */
  team?: Team;
  images?: Record<string, string | null>;
  onClose: () => void;
  onSave: (name: string, members: string[]) => Promise<void>;
  onDelete?: () => Promise<void>;
}) {
  const [picked, setPicked] = useState<string[]>(team?.members ?? []);
  const [name, setName] = useState(team?.name ?? "");
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    input.current?.focus();
  }, []);

  // Who is in it, which is what the team would be called if never named.
  const fallback = useMemo(
    () => picked.map((id) => agents.find((a) => a.id === id)?.displayName).filter(Boolean).join(", "),
    [picked, agents],
  );
  const chosen = name.trim() || fallback;
  const full = picked.length >= MAX_TEAM_MEMBERS;
  const shown = useMemo(() => filterAgents(agents, query, picked), [agents, query, picked]);

  const toggle = (id: string) => {
    setError(null);
    setPicked((p) => {
      if (p.includes(id)) return p.filter((x) => x !== id);
      if (p.length >= MAX_TEAM_MEMBERS) {
        setError(`A team holds at most ${MAX_TEAM_MEMBERS}.`);
        return p;
      }
      return [...p, id];
    });
  };

  // A save that fails says so here rather than closing the sheet.
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const save = () => {
    if (picked.length < MIN_TEAM_MEMBERS) {
      setError(`A team is ${MIN_TEAM_MEMBERS} or more agents. One on its own is an Agent.`);
      return;
    }
    if (!chosen) {
      setError("Give the team a name.");
      return;
    }
    void run(() => onSave(chosen, picked));
  };

  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Backdrop className="modal-backdrop fixed inset-0 z-[120]" />
        <Dialog.Viewport className="fixed inset-0 z-[121] flex items-center justify-center p-3">
          <Dialog.Popup
            aria-label={team ? "Edit team" : "New team"}
            className="modal-surface flex max-h-[72dvh] w-[min(420px,calc(100vw-24px))] flex-col overflow-hidden"
          >
            <div className="px-[17px] pb-[11px] pt-[15px]">
              <Dialog.Title className="font-ui text-[var(--t-ui)] font-medium text-[var(--text)]">{team ? "Edit team" : "New team"}</Dialog.Title>
              <div className="mt-[3px] font-ui text-[var(--t-meta)] text-[var(--text-muted)]">
                {MIN_TEAM_MEMBERS} to {MAX_TEAM_MEMBERS} agents. They answer in turn, in one log.
              </div>
            </div>

            {agents.length >= TEAM_SEARCH_THRESHOLD ? (
              <div className="px-[17px] pb-2.5">
                <input className={cn(INPUT, "w-full")} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search agents…" aria-label="Search agents" />
              </div>
            ) : null}

            <div className="flex-1 overflow-y-auto px-[9px]">
              {shown.length === 0 ? <div className="px-2 py-2.5 font-ui text-[var(--t-meta)] text-[var(--text-muted)]">No agent matches “{query}”.</div> : null}
              {shown.map((a) => {
                const on = picked.includes(a.id);
                // A full team greys what it cannot take rather than hiding it.
                const shut = !on && full;
                return (
                  <label
                    key={a.id}
                    className={cn(
                      "flex items-center gap-2.5 rounded-[var(--r-row)] px-2 py-[7px]",
                      on && "bg-[var(--selected)]",
                      shut ? "opacity-40" : "cursor-pointer hover:bg-[var(--hover)]",
                    )}
                  >
                    <input type="checkbox" checked={on} disabled={shut} onChange={() => toggle(a.id)} style={{ accentColor: "var(--accent)" }} />
                    <Avatar agent={a} size={22} image={images?.[a.id]} />
                    <div className="flex min-w-0 flex-col">
                      <span className="font-ui text-[var(--t-ui)] text-[var(--text)]">{a.displayName}</span>
                      <span className="font-mono text-[var(--t-section)] text-[var(--text-muted)]">@{handleOf(a.displayName)}</span>
                    </div>
                    <div className="grow" />
                    <span className="font-ui text-[var(--t-meta)] text-[var(--text-muted)]">{engineLabel(a.engine)}</span>
                  </label>
                );
              })}
            </div>

            <div className="flex items-center gap-[9px] px-[13px] py-[11px]">
              <input
                ref={input}
                className={cn(INPUT, "flex-1 bg-[var(--input)]")}
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") save();
                }}
                placeholder={fallback || "Team name"}
                aria-label="Team name"
              />
              <button type="button" className="pill" onClick={onClose} disabled={busy}>
                Cancel
              </button>
              {team && onDelete ? (
                <button type="button" className="pill" onClick={() => void run(onDelete)} disabled={busy}>
                  Delete
                </button>
              ) : null}
              <button
                type="button"
                onClick={save}
                disabled={picked.length < MIN_TEAM_MEMBERS || busy}
                className={cn(
                  "rounded-[var(--r-pill)] px-3.5 py-1.5 font-ui text-[var(--t-meta)] disabled:opacity-45",
                  picked.length >= MIN_TEAM_MEMBERS
                    ? "bg-[var(--accent)] text-[var(--crust)] hover:bg-[var(--accent-hover)]"
                    : "bg-[color-mix(in_srgb,var(--text)_8%,transparent)] text-[var(--text)]",
                )}
              >
                {busy ? "Saving…" : team ? "Save" : "Create"}
              </button>
            </div>
            {error ? <div className="px-[13px] pb-2.5 font-ui text-[var(--t-meta)] text-[var(--bad)]">{error}</div> : null}
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
