import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";

import type { HermesProfile } from "@/engine/profiles";
import { nextIndex } from "@/components/layout/use-roving";
import { Avatar } from "@/components/agents/avatar";
import { Pill } from "@/components/ui/status-pill";
import { cn } from "@/lib/utils";
import type { Team } from "@/components/agents/agent-model";

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
  teams = [],
  onTeam,
  onClose,
}: {
  profiles: HermesProfile[];
  target: string | null;
  usable: (profile: HermesProfile) => boolean;
  onTarget: (name: string) => void;
  teams?: Team[];
  onTeam?: (team: Team) => void;
  onClose: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const rows = useRef<(HTMLButtonElement | null)[]>([]);
  const [active, setActive] = useState(() => {
    const at = profiles.findIndex((p) => p.name === target);
    const teamAt = teams.findIndex((team) => `team:${team.id}` === target);
    return at >= 0 ? at : teamAt >= 0 ? profiles.length + teamAt : 0;
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
      const profile = profiles[active];
      const team = teams[active - profiles.length];
      if (profile || team) {
        e.preventDefault();
        e.stopPropagation();
        if (profile) pick(profile.name);
        else {
          onTeam?.(team);
          onClose();
        }
      }
      return;
    }
    const next = nextIndex(e.key, active, profiles.length + teams.length);
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
              "flex min-h-[var(--h-row)] w-full items-center gap-2 rounded-[var(--r-ctl)] px-2 text-left font-ui text-[var(--t-ui)] text-[var(--text)] outline-none",
              "hover:bg-[var(--hover)] focus-visible:bg-[var(--hover)]",
              selected && "bg-[var(--selected)] hover:bg-[var(--selected-hover)]",
              !on && "text-[var(--text-muted)]",
            )}
          >
            <span data-agent-avatar className="shrink-0">
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
            </span>
            <span className="min-w-0 flex-1 truncate">{p.displayName || p.name}</span>
            {p.model ? (
              <span className="shrink-0 font-mono text-[var(--t-count)] text-[var(--text-muted)]">{p.model}</span>
            ) : null}
            {!on ? <Pill>offline</Pill> : null}
            {p.isDefault ? (
              <Pill>default</Pill>
            ) : null}
            {selected ? <span aria-hidden>›</span> : null}
          </button>
        );
      })}
      {teams.length ? (
        <div className="px-2 pb-1 pt-[9px] font-ui text-[var(--t-count)] font-light uppercase tracking-[0.14em] text-[var(--overlay-1)]">
          Teams
        </div>
      ) : null}
      {teams.map((team, teamIndex) => {
        const i = profiles.length + teamIndex;
        const faces = team.members.slice(0, 3).map((agentId) => {
          const profile = profileForTeamMember(profiles, agentId);
          return {
            key: agentId,
            profile,
            displayName: profile?.displayName || profile?.name || agentId,
          };
        });
        return (
          <button
            key={team.id}
            ref={(el) => {
              rows.current[i] = el;
            }}
            type="button"
            role="option"
            aria-selected={target === `team:${team.id}`}
            tabIndex={i === active ? 0 : -1}
            onFocus={() => setActive(i)}
            onClick={() => {
              onTeam?.(team);
              onClose();
            }}
            className={cn("flex min-h-[var(--h-row)] w-full items-center gap-2 rounded-[var(--r-ctl)] px-2 text-left font-ui text-[var(--t-ui)] text-[var(--text)] outline-none hover:bg-[var(--hover)] focus-visible:bg-[var(--hover)]", target === `team:${team.id}` && "bg-[var(--selected)] hover:bg-[var(--selected-hover)]")}
          >
            <span className="flex shrink-0 items-center">
              {faces.map((face, memberIndex) => (
                  <span key={face.key} style={{ marginInlineStart: memberIndex ? -5 : 0 }}>
                    <Avatar
                      agent={{
                        displayName: face.displayName,
                        avatarStyle: face.profile?.avatarStyle,
                        avatarKind: face.profile?.avatarKind,
                        avatarColor: face.profile?.avatarColor,
                      }}
                      size={18}
                      image={face.profile?.avatarImage}
                      animate={false}
                    />
                  </span>
              ))}
            </span>
            <span className="min-w-0 flex-1 truncate">{team.name}</span>
            <span className="shrink-0 font-mono text-[var(--t-count)] text-[var(--text-muted)]">
              {team.members.length}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function profileForTeamMember(profiles: HermesProfile[], agentId: string): HermesProfile | undefined {
  const name = agentId.startsWith("hermes:") ? agentId.slice(7) : agentId;
  return profiles.find((profile) => profile.name === name);
}
