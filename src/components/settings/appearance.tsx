import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import {
  FLAVORS,
  DEFAULT_SELECTION_STRENGTH,
  MAX_SELECTION_STRENGTH,
  MIN_SELECTION_STRENGTH,
  applyPanes,
  applySavedTheme,
  applySelectionStrength,
  applyTheme,
  flavorById,
  isLight,
  loadPanes,
  loadSelectionStrength,
  loadSystemThemePreferences,
  loadTheme,
  resolveTheme,
  sameAccentIn,
  saveSystemThemePreferences,
  saveTheme,
  systemAppearance,
  SYSTEM_APPEARANCE_CHANGED_EVENT,
  type Flavor,
  type Panes,
  type SystemAppearance,
  type SystemThemePreferences,
} from "@/lib/theme";
import { cn } from "@/lib/utils";

import { SettingSwitch } from "./setting-switch";
import { SETTINGS_TITLE } from "./settings-style";

const caps = "font-ui text-[var(--t-section)] font-light uppercase tracking-[0.14em] text-[var(--text-muted)]";
const card =
  "flex flex-col gap-2 rounded-[var(--r-plane)] p-2.5 text-left text-[var(--text)] motion-safe:transition-[background-color,box-shadow] hover:bg-[var(--raised)]";
const activeTag =
  "whitespace-nowrap rounded-[var(--r-pill)] bg-[color-mix(in_srgb,var(--accent)_20%,transparent)] px-2 py-px text-[var(--t-section)] text-[var(--accent)]";

/** The two arrangements, drawn rather than described: three panes at the
 *  shell's proportions, joined by a hairline or held apart over the window. */
function PanesDrawing({ panes }: { panes: Panes }) {
  const joined = panes === "connected";
  return (
    <div
      className={cn("flex h-[62px] overflow-hidden rounded-[var(--r-ctl)]", joined ? "gap-px bg-[var(--line)]" : "gap-[5px] p-[5px]")}
    >
      {[
        ["0 0 18%", "var(--crust)"],
        ["1", "var(--base)"],
        ["0 0 26%", "var(--mantle)"],
      ].map(([flex, bg], i) => (
        <div key={i} className={joined ? "" : "rounded-[var(--r-ctl)]"} style={{ flex, background: bg }} />
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
  const dialog = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const selected = dialog.current?.querySelector<HTMLElement>('[aria-pressed="true"]');
    (selected ?? dialog.current)?.focus();
  }, []);

  return (
    <div
      className="modal-backdrop absolute inset-0 z-20 flex items-center justify-center"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label="Accent"
        aria-modal="true"
        tabIndex={-1}
        ref={dialog}
        className="modal-surface flex w-[min(400px,calc(100%_-_24px))] flex-col gap-3.5 p-5"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            onClose();
            return;
          }
          if (event.key !== "Tab") return;
          const controls = [...(dialog.current?.querySelectorAll<HTMLElement>("button") ?? [])];
          if (!controls.length) return;
          const first = controls[0];
          const last = controls[controls.length - 1];
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
          }
        }}
      >
        <div className="flex items-center justify-between">
          <span className={caps}>Accent</span>
          <span className="text-xs text-[var(--text-muted)]">{flavor.name}</span>
        </div>

        <div className="grid grid-cols-7 gap-2 max-[900px]:grid-cols-4">
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
              className="swatch h-9 w-9 rounded-[var(--r-pill)]"
              style={{
                background: a.hex,
                boxShadow: a.hex === accent ? "inset 0 0 0 3px var(--raised), inset 0 0 0 5px var(--text)" : undefined,
              }}
            />
          ))}
        </div>

        <div className="flex min-h-[22px] items-center gap-2">
          <span className="h-[18px] w-[18px] rounded-[var(--r-pill)]" style={{ background: shown.hex }} />
          <span className="text-[var(--t-ui)]">{shown.name}</span>
          <span className="font-mono text-xs text-[var(--text-muted)]">{shown.hex}</span>
        </div>

        <p className="text-xs leading-[1.45] text-[var(--text-muted)]">
          Moves primary actions, keyboard focus and links. It never touches neutral selection or the colours that carry
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
  const [appearance, setAppearance] = useState(systemAppearance);
  const [systemTheme, setSystemTheme] = useState(loadSystemThemePreferences);
  const [theme, setTheme] = useState(() => resolveTheme(appearance));
  const [panes, setPanes] = useState(loadPanes);
  const [selectionStrength, setSelectionStrength] = useState(loadSelectionStrength);
  const [picking, setPicking] = useState(false);
  const active = flavorById(theme.flavor);
  const accentName = active.accents.find((a) => a.hex === theme.accent)?.name ?? "custom";
  const lightFlavors = FLAVORS.filter((flavor) => isLight(flavor.id));
  const darkFlavors = FLAVORS.filter((flavor) => !isLight(flavor.id));

  useEffect(() => {
    const onAppearance = (event: Event) => {
      const next = (event as CustomEvent<SystemAppearance>).detail;
      setAppearance(next);
      setTheme(resolveTheme(next));
    };
    window.addEventListener(SYSTEM_APPEARANCE_CHANGED_EVENT, onAppearance);
    return () => window.removeEventListener(SYSTEM_APPEARANCE_CHANGED_EVENT, onAppearance);
  }, []);

  function commit(flavor: string, accent: string) {
    setTheme({ flavor, accent });
    applyTheme(flavor, accent);
    saveTheme(flavor, accent);
  }

  function commitSystemTheme(next: SystemThemePreferences) {
    saveSystemThemePreferences(next);
    setSystemTheme(next);
    setTheme(applySavedTheme(appearance));
  }

  function commitAccent(accent: string) {
    if (!systemTheme.followSystem) {
      commit(theme.flavor, accent);
      return;
    }
    const manual = loadTheme();
    const manualFlavor = flavorById(manual.flavor);
    saveTheme(manual.flavor, sameAccentIn(active, accent, manualFlavor));
    setTheme(applySavedTheme(appearance));
  }

  function commitPanes(next: Panes) {
    setPanes(next);
    applyPanes(next);
  }

  function commitSelectionStrength(next: number) {
    setSelectionStrength(next);
    applySelectionStrength(next);
  }

  return (
    <div className="flex flex-col gap-2">
      <h1 className={SETTINGS_TITLE}>Appearance</h1>
      <p className="pb-2.5 text-[var(--t-ui)] leading-normal text-[var(--text-muted)]">
        Calmppuccin, seven flavors. Each carries its own fourteen accents.
      </p>

      <div className="flex items-center gap-3 rounded-[var(--r-ctl)] bg-[var(--mantle)] px-3 py-2.5">
        <SettingSwitch
          on={systemTheme.followSystem}
          label="Follow system appearance"
          onToggle={() => commitSystemTheme({ ...systemTheme, followSystem: !systemTheme.followSystem })}
        />
        <div>
          <div className="text-[var(--t-ui)] text-[var(--text)]">Follow system</div>
          <div className="text-xs text-[var(--text-muted)]">Switch light and dark flavors with macOS.</div>
        </div>
      </div>

      {systemTheme.followSystem ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="rounded-[var(--r-plane)] bg-[var(--mantle)] p-3">
            <span className={cn(caps, "mb-2 block text-[var(--t-count)]")}>Light appearance</span>
            <Select
              value={systemTheme.lightFlavor}
              containerClassName="flex"
              onChange={(event) => commitSystemTheme({ ...systemTheme, lightFlavor: event.target.value })}
            >
              {lightFlavors.map((flavor) => <option key={flavor.id} value={flavor.id}>{flavor.name}</option>)}
            </Select>
          </label>
          <label className="rounded-[var(--r-plane)] bg-[var(--mantle)] p-3">
            <span className={cn(caps, "mb-2 block text-[var(--t-count)]")}>Dark appearance</span>
            <Select
              value={systemTheme.darkFlavor}
              containerClassName="flex"
              onChange={(event) => commitSystemTheme({ ...systemTheme, darkFlavor: event.target.value })}
            >
              {darkFlavors.map((flavor) => <option key={flavor.id} value={flavor.id}>{flavor.name}</option>)}
            </Select>
          </label>
        </div>
      ) : <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(148px,1fr))]">
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
              <div className="flex h-[92px] overflow-hidden rounded-[var(--r-ctl)]">
                {flavor.planes.map((plane, i) => (
                  <div key={i} className="flex-1" style={{ background: plane }} />
                ))}
                <div className="w-[18px]" style={{ background: swatch }} />
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[var(--t-ui)]">{flavor.name}</span>
                {on ? <span className={activeTag}>active</span> : null}
              </div>
            </button>
          );
        })}
      </div>}

      <div className="flex items-center gap-3 pt-[18px]">
        <span className={cn(caps, "text-[var(--t-count)]")}>Accent</span>
        <button
          type="button"
          onClick={() => setPicking(true)}
          className="flex items-center gap-2.5 rounded-[var(--r-ctl)] bg-[var(--mantle)] py-[7px] pl-2 pr-3 text-[var(--t-ui)] text-[var(--text)] motion-safe:transition-colors hover:bg-[var(--raised)]"
        >
          <span className="h-[22px] w-[22px] rounded-[var(--r-pill)]" style={{ background: theme.accent }} />
          {accentName}
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
        <span className="text-xs text-[var(--text-muted)]">
          Switching flavor keeps this choice, in that flavor's own palette.
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-3 pt-[18px]">
        <label htmlFor="selection-strength" className={cn(caps, "text-[var(--t-count)]")}>
          Selection strength
        </label>
        <input
          id="selection-strength"
          type="range"
          min={MIN_SELECTION_STRENGTH}
          max={MAX_SELECTION_STRENGTH}
          step="0.01"
          value={selectionStrength}
          onChange={(event) => commitSelectionStrength(Number(event.currentTarget.value))}
          className="selection-strength"
        />
        <button
          type="button"
          className="h-[var(--h-ctl)] rounded-[var(--r-ctl)] px-2.5 text-xs text-[var(--text-muted)] hover:bg-[var(--hover)] hover:text-[var(--text)]"
          onClick={() => commitSelectionStrength(DEFAULT_SELECTION_STRENGTH)}
        >
          Default
        </button>
        <div className="selection-preview" aria-label="Selection preview">
          <span className="nav-node">Plain</span>
          <span className="nav-node selection-preview-hover">Hovered</span>
          <span className="nav-node" aria-selected="true">Selected</span>
        </div>
      </div>

      <div className="flex flex-col gap-2.5 pt-[26px]">
        <span className={cn(caps, "text-[var(--t-count)]")}>Panes</span>
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
                  <span className="text-[var(--t-ui)]">{opt.name}</span>
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
          onPick={commitAccent}
          onClose={() => setPicking(false)}
        />
      ) : null}
    </div>
  );
}
