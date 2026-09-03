import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";

import type { HermesProfile } from "@/engine/profiles";
import { nextIndex } from "@/components/layout/use-roving";
import { Avatar } from "@/components/agents/avatar";
import { cn } from "@/lib/utils";

/** Who you are talking to. A popover on the name in the panel's header,
 *  after hermes-app's `TargetPicker.tsx`: the name states the target every
 *  turn, so making it the control keeps display and switch as one thing.
 *  Offline profiles are shown and marked, never hidden. Escape and an
 *  outside press close it; the arrows move through the rows. */
export function TargetPicker({
  profiles,
  target,
  usable,
  onTarget,
  onClose,
}: {
  profiles: HermesProfile[];
  target: string | null;
  usable: (profile: HermesProfile) => boolean;
  onTarget: (name: string) => void;
  onClose: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const rows = useRef<(HTMLButtonElement | null)[]>([]);
  const [active, setActive] = useState(() => {
    const at = profiles.findIndex((p) => p.name === target);
    return at >= 0 ? at : 0;
  });

  useEffect(() => {
    const key = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const down = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) onClose();
    };
    window.addEventListener("keydown", key);
    // Deferred a tick so the click that opened this does not close it.
    const t = window.setTimeout(() => window.addEventListener("mousedown", down), 0);
    return () => {
      window.removeEventListener("keydown", key);
      window.removeEventListener("mousedown", down);
      window.clearTimeout(t);
    };
  }, [onClose]);

  // Focus starts on the current target so the arrows move from where the
  // person already is.
  useEffect(() => {
    rows.current[active]?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pick = useCallback(
    (name: string) => {
      onTarget(name);
      onClose();
    },
    [onTarget, onClose],
  );

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      const row = profiles[active];
      if (row) {
        e.preventDefault();
        e.stopPropagation();
        pick(row.name);
      }
      return;
    }
    const next = nextIndex(e.key, active, profiles.length);
    if (next === null) return;
    e.preventDefault();
    e.stopPropagation();
    setActive(next);
    rows.current[next]?.focus();
  };

  return (
    <div
      ref={box}
      role="listbox"
      aria-label="Who to talk to"
      onKeyDown={onKeyDown}
      className="absolute left-0 top-8 z-30 flex max-h-[340px] min-w-[208px] max-w-[min(264px,calc(100vw-24px))] flex-col gap-px overflow-y-auto rounded-[var(--r-plane)] bg-[var(--raised)] p-[5px] shadow-[var(--shadow-elevated)]"
    >
      <div className="px-2 pb-1 pt-[7px] font-ui text-[var(--t-count)] font-light uppercase tracking-[0.14em] text-[var(--overlay-1)]">
        Agents
      </div>
      {profiles.length === 0 ? (
        <div className="px-2 py-1.5 font-ui text-[var(--t-meta)] text-[var(--text-muted)]">No agents listed.</div>
      ) : null}
      {profiles.map((p, i) => {
        const selected = p.name === target;
        const on = usable(p);
        return (
          <button
            key={p.name}
            ref={(el) => {
              rows.current[i] = el;
            }}
            type="button"
            role="option"
            aria-selected={selected}
            tabIndex={i === active ? 0 : -1}
            onFocus={() => setActive(i)}
            onClick={() => pick(p.name)}
            className={cn(
              "flex w-full items-center gap-2 rounded-[var(--r-row)] px-2 py-1.5 text-left font-ui text-[var(--t-ui)] text-[var(--text)] outline-none",
              "hover:bg-[var(--hover)] focus-visible:ring-1 focus-visible:ring-[var(--accent-border)]",
              selected && "bg-[var(--accent-soft)]",
              !on && "text-[var(--text-muted)]",
            )}
          >
            <Avatar
              agent={{
                displayName: p.displayName || p.name,
                avatarStyle: p.avatarStyle,
                avatarKind: p.avatarKind,
                avatarColor: p.avatarColor,
              }}
              size={20}
              image={p.avatarImage}
              animate={false}
            />
            <span className="min-w-0 flex-1 truncate">{p.displayName || p.name}</span>
            {p.model ? (
              <span className="shrink-0 font-mono text-[var(--t-count)] text-[var(--text-muted)]">{p.model}</span>
            ) : null}
            {!on ? <span className="shrink-0 font-ui text-[var(--t-section)] text-[var(--text-muted)]">offline</span> : null}
            {p.isDefault ? (
              <span className="shrink-0 font-mono text-[var(--t-count)] text-[var(--text-muted)]">default</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
