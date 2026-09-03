import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  FLAVORS,
  applyPanes,
  applyTheme,
  flavorById,
  loadPanes,
  loadTheme,
  sameAccentIn,
  saveTheme,
  type Flavor,
  type Panes,
} from "@/lib/theme";
import { cn } from "@/lib/utils";

import { SETTINGS_TITLE } from "./settings-style";

const caps = "font-ui text-[11px] font-light uppercase tracking-[0.14em] text-[var(--text-muted)]";
const card =
  "flex flex-col gap-2 rounded-xl p-2.5 text-left text-[var(--text)] motion-safe:transition-colors";
const activeTag =
  "whitespace-nowrap rounded-full bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] px-2 py-px text-[11px] text-[var(--accent)]";

/** The two arrangements, drawn rather than described: three panes at the
 *  shell's proportions, joined by a hairline or held apart over the window. */
function PanesDrawing({ panes }: { panes: Panes }) {
  const joined = panes === "connected";
  return (
    <div
      className={cn("flex h-[62px] overflow-hidden rounded", joined ? "gap-px bg-[var(--line)]" : "gap-[5px] p-[5px]")}
    >
      {[
        ["0 0 18%", "var(--crust)"],
        ["1", "var(--base)"],
        ["0 0 26%", "var(--mantle)"],
      ].map(([flex, bg], i) => (
        <div key={i} className={joined ? "" : "rounded-[3px]"} style={{ flex, background: bg }} />
      ))}
    </div>
  );
}

/** Pick an accent from the active flavor's fourteen. */
function AccentPicker({
  flavor,
  accent,
  onPick,
  onClose,
}: {
  flavor: Flavor;
  accent: string;
  onPick: (hex: string) => void;
  onClose: () => void;
}) {
  const [hovered, setHovered] = useState<{ name: string; hex: string } | null>(null);
  const shown = hovered ?? flavor.accents.find((a) => a.hex === accent) ?? { name: "custom", hex: accent };

  return (
    <div
      className="fixed inset-0 z-20 flex items-center justify-center bg-[color-mix(in_srgb,var(--crust)_42%,transparent)] backdrop-blur-[7px]"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label="Accent"
        className="flex w-[400px] flex-col gap-3.5 rounded-xl bg-[var(--raised)] p-5 shadow-[0_40px_120px_rgba(0,0,0,0.55)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <span className={caps}>Accent</span>
          <span className="text-xs text-[var(--text-muted)]">{flavor.name}</span>
        </div>

        <div className="grid grid-cols-7 gap-2">
          {flavor.accents.map((a) => (
            <button
              key={a.name}
              type="button"
              title={a.name}
              aria-label={a.name}
              aria-pressed={a.hex === accent}
              onClick={() => onPick(a.hex)}
              onMouseEnter={() => setHovered(a)}
              onMouseLeave={() => setHovered(null)}
              className="h-9 w-9 rounded-full motion-safe:transition-transform motion-safe:hover:scale-[1.14]"
              style={{
                background: a.hex,
                boxShadow: a.hex === accent ? "inset 0 0 0 3px var(--raised), inset 0 0 0 5px var(--text)" : undefined,
              }}
            />
          ))}
        </div>

        <div className="flex min-h-[22px] items-center gap-2">
          <span className="h-[18px] w-[18px] rounded-full" style={{ background: shown.hex }} />
          <span className="text-[13px]">{shown.name}</span>
          <span className="font-mono text-xs text-[var(--text-muted)]">{shown.hex}</span>
        </div>

        <p className="text-xs leading-[1.45] text-[var(--text-muted)]">
          Moves selection, focus, active navigation and primary actions. It never touches the colours that carry
          meaning — waiting, verified, failed.
        </p>

        <div className="flex justify-end">
          <Button variant="secondary" size="sm" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Flavor cards, the active flavor's accent, and the pane arrangement.
 *  Applies and persists immediately; nothing loads, so no loading, empty or
 *  error state exists for this surface. */
export function AppearanceSection() {
  const [theme, setTheme] = useState(loadTheme);
  const [panes, setPanes] = useState(loadPanes);
  const [picking, setPicking] = useState(false);
  const active = flavorById(theme.flavor);
  const accentName = active.accents.find((a) => a.hex === theme.accent)?.name ?? "custom";

  function commit(flavor: string, accent: string) {
    setTheme({ flavor, accent });
    applyTheme(flavor, accent);
    saveTheme(flavor, accent);
  }

  function commitPanes(next: Panes) {
    setPanes(next);
    applyPanes(next);
  }

  return (
    <div className="flex flex-col gap-2">
      <h1 className={SETTINGS_TITLE}>Appearance</h1>
      <p className="pb-2.5 text-[13px] leading-normal text-[var(--text-muted)]">
        Calmppuccin, seven flavors. Each carries its own fourteen accents.
      </p>

      <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(148px,1fr))]">
        {FLAVORS.map((flavor) => {
          const on = flavor.id === theme.flavor;
          const swatch = sameAccentIn(active, theme.accent, flavor);
          return (
            <button
              key={flavor.id}
              type="button"
              aria-pressed={on}
              onClick={() => commit(flavor.id, swatch)}
              className={cn(card, on ? "bg-[var(--raised)]" : "bg-[var(--mantle)]")}
            >
              <div className="flex h-[92px] overflow-hidden rounded">
                {flavor.planes.map((plane, i) => (
                  <div key={i} className="flex-1" style={{ background: plane }} />
                ))}
                <div className="w-[18px]" style={{ background: swatch }} />
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[13px]">{flavor.name}</span>
                {on ? <span className={activeTag}>active</span> : null}
              </div>
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-3 pt-[18px]">
        <span className={cn(caps, "text-[10px]")}>Accent</span>
        <button
          type="button"
          onClick={() => setPicking(true)}
          className="flex items-center gap-2.5 rounded bg-[var(--mantle)] py-[7px] pl-2 pr-3 text-[13px] text-[var(--text)] motion-safe:transition-colors hover:bg-[var(--raised)]"
        >
          <span className="h-[22px] w-[22px] rounded-full" style={{ background: theme.accent }} />
          {accentName}
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
        <span className="text-xs text-[var(--text-muted)]">
          Switching flavor keeps this choice, in that flavor's own palette.
        </span>
      </div>

      <div className="flex flex-col gap-2.5 pt-[26px]">
        <span className={cn(caps, "text-[10px]")}>Panes</span>
        <div className="flex gap-3">
          {(
            [
              { id: "connected", name: "Connected", note: "One surface, divided by a hairline." },
              { id: "segmented", name: "Segmented", note: "Separate panels over the window." },
            ] as const
          ).map((opt) => {
            const on = opt.id === panes;
            return (
              <button
                key={opt.id}
                type="button"
                aria-pressed={on}
                onClick={() => commitPanes(opt.id)}
                className={cn(card, "max-w-[260px] flex-1", on ? "bg-[var(--raised)]" : "bg-[var(--mantle)]")}
              >
                <PanesDrawing panes={opt.id} />
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[13px]">{opt.name}</span>
                  {on ? <span className={activeTag}>active</span> : null}
                </div>
                <span className="text-xs text-[var(--text-muted)]">{opt.note}</span>
              </button>
            );
          })}
        </div>
      </div>

      {picking ? (
        <AccentPicker
          flavor={active}
          accent={theme.accent}
          onPick={(hex) => commit(theme.flavor, hex)}
          onClose={() => setPicking(false)}
        />
      ) : null}
    </div>
  );
}
