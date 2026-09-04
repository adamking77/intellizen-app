/** Flavor and accent, applied to the document and remembered. */
import { readPreference, writePreference } from "@/lib/settings-preferences";

export interface Flavor {
  id: string;
  name: string;
  /** Rail, panel, work surface — the three planes, for the card preview. */
  planes: [string, string, string];
  /** The accents this flavor offers. */
  accents: { name: string; hex: string }[];
}

/** Calmppuccin's fourteen named accents, per flavor. Same order as the
 *  `--rosewater … --lavender` tokens in index.css. */
const ACCENT_NAMES = [
  "rosewater",
  "flamingo",
  "pink",
  "mauve",
  "red",
  "maroon",
  "peach",
  "yellow",
  "green",
  "teal",
  "sky",
  "sapphire",
  "blue",
  "lavender",
] as const;

function accents(hexes: string[]) {
  return ACCENT_NAMES.map((name, i) => ({ name, hex: hexes[i] }));
}

/** Lightest rail to darkest, so the picker reads as one continuous ramp.
 *  Nothing may depend on a position in this list; `DEFAULT_FLAVOR` names
 *  the default. Hexes mirror the per-flavor blocks in index.css. */
export const FLAVORS: Flavor[] = [
  {
    id: "flat",
    name: "Flat White",
    planes: ["#eceae7", "#f4f2ef", "#fbfaf8"],
    accents: accents([
      "#a07b74", "#a86a6a", "#a85590", "#734aa0", "#a8354f", "#944650", "#a8652e",
      "#947a28", "#457747", "#387f73", "#2c739b", "#256597", "#355aa0", "#555ea8",
    ]),
  },
  {
    id: "latte",
    name: "Latte",
    planes: ["#cfd1d4", "#dcdee1", "#e9eaee"],
    accents: accents([
      "#a8817a", "#b07070", "#b05a95", "#7a4fa8", "#b03a56", "#9c4b57", "#b06a33",
      "#9c7f2c", "#4a7c4e", "#3d8478", "#3178a0", "#2a6a9c", "#3a5fa8", "#5a63b0",
    ]),
  },
  {
    id: "frappe",
    name: "Frappé",
    planes: ["#222532", "#282b3a", "#2f3344"],
    accents: accents([
      "#e6d2ce", "#ecc8c8", "#e7b9da", "#be9fe5", "#e786a1", "#db96a2", "#e5a67e",
      "#ead4a5", "#9cd297", "#8fd6ca", "#83cfdd", "#73badb", "#82a9e9", "#a9b2ec",
    ]),
  },
  {
    id: "macchiato",
    name: "Macchiato",
    planes: ["#171825", "#1e2030", "#24273a"],
    accents: accents([
      "#e4d0cc", "#eac6c6", "#e5b7d8", "#bc9de3", "#e5849f", "#d994a0", "#e3a47c",
      "#e8d2a3", "#9ad095", "#8dd4c8", "#81cddb", "#71b8d9", "#80a7e7", "#a7b0ea",
    ]),
  },
  {
    id: "mocha",
    name: "Mocha",
    planes: ["#11111a", "#171724", "#1d1d2c"],
    accents: accents([
      "#e2cfcb", "#e9c5c5", "#e4b5d7", "#ba9ae2", "#e4829e", "#d8939f", "#e2a37b",
      "#e7d1a2", "#99cf94", "#8cd3c7", "#80ccda", "#70b7d8", "#7fa6e6", "#a6afe9",
    ]),
  },
  {
    id: "nitro",
    name: "Nitro Cold Brew",
    planes: ["#0d0d14", "#13131f", "#181825"],
    accents: accents([
      "#dcc9c5", "#e3bfbf", "#deafd1", "#b494dc", "#de7c98", "#d28d99", "#dc9d75",
      "#e1cb9c", "#93c98e", "#86cdc1", "#7ac6d4", "#6ab1d2", "#79a0e0", "#a0a9e3",
    ]),
  },
  {
    id: "oled",
    name: "Oledppuccin",
    planes: ["#000000", "#07070c", "#0b0b11"],
    accents: accents([
      "#c9b7b3", "#d0adad", "#cb9ebe", "#a385c9", "#cb7189", "#c07f8a", "#c98e6a",
      "#cdb98d", "#85b681", "#79bab0", "#6eb4c1", "#5fa0bf", "#6d90cc", "#9098cf",
    ]),
  },
];

export const FLAVOR_KEY = "intelizen:flavor";
export const ACCENT_KEY = "intelizen:accent";
export const PANES_KEY = "intelizen:panes";
export const SELECTION_STRENGTH_KEY = "intelizen:selection-strength";
export const THEME_CHANGED_EVENT = "intelizen:theme-changed";

export const DEFAULT_SELECTION_STRENGTH = 0.08;
export const MIN_SELECTION_STRENGTH = 0.04;
export const MAX_SELECTION_STRENGTH = 0.14;

export function normalizeSelectionStrength(value: string | number): number {
  const parsed = typeof value === "number" ? value : Number.parseFloat(value);
  if (!Number.isFinite(parsed)) return DEFAULT_SELECTION_STRENGTH;
  return Math.round(
    Math.min(MAX_SELECTION_STRENGTH, Math.max(MIN_SELECTION_STRENGTH, parsed)) * 100,
  ) / 100;
}

export function loadSelectionStrength(): number {
  return normalizeSelectionStrength(
    readPreference(SELECTION_STRENGTH_KEY, String(DEFAULT_SELECTION_STRENGTH)),
  );
}

function setSelectionStrength(value: number) {
  const strength = normalizeSelectionStrength(value);
  document.documentElement.style.setProperty("--sel-step", String(strength));
  document.documentElement.style.setProperty(
    "--sel-accent-weight",
    `${Math.round(strength * 600) / 10}%`,
  );
  return strength;
}

export function applySelectionStrength(value: number) {
  const strength = setSelectionStrength(value);
  writePreference(SELECTION_STRENGTH_KEY, String(strength));
  window.dispatchEvent(new Event(THEME_CHANGED_EVENT));
}

/** How the shell's panes sit: separate panels over the window, or
 *  one surface divided by hairlines. Read by `[data-panes]` rules in index.css. */
export type Panes = "connected" | "segmented";
export const DEFAULT_PANES: Panes = "connected";

export function loadPanes(): Panes {
  return readPreference(PANES_KEY, DEFAULT_PANES) === "connected" ? "connected" : "segmented";
}

export function applyPanes(panes: Panes) {
  document.documentElement.dataset.panes = panes;
  writePreference(PANES_KEY, panes);
}

export const DEFAULT_FLAVOR = "mocha";
/** Blue — IntelliZen's accent per DESIGN.md — is slot 12 of the fourteen. */
const DEFAULT_ACCENT_INDEX = 12;

export function defaultFlavor(): Flavor {
  return FLAVORS.find((f) => f.id === DEFAULT_FLAVOR) ?? FLAVORS[0];
}

export function flavorById(id: string): Flavor {
  return FLAVORS.find((f) => f.id === id) ?? defaultFlavor();
}

/** Recorded rather than derived: a luminance test on the rail plane would
 *  quietly misclassify a flavor added at the boundary later. */
const LIGHT_FLAVORS = new Set(["latte", "flat"]);

export function isLight(flavorId: string) {
  return LIGHT_FLAVORS.has(flavorId);
}

export function applyTheme(flavorId: string, accentHex: string) {
  document.documentElement.dataset.flavor = flavorId;
  document.documentElement.dataset.panes = loadPanes();
  setSelectionStrength(loadSelectionStrength());
  // Every accent use in the app reads --accent, so setting it here moves
  // selection, focus, active nav, links and primary actions together.
  document.documentElement.style.setProperty("--accent", accentHex);
  window.dispatchEvent(new Event(THEME_CHANGED_EVENT));

  // Tell macOS which appearance the window is wearing so the native vibrancy
  // and traffic lights follow the flavor rather than the system setting.
  // Dynamically imported: this also runs in a plain browser without Tauri.
  void import("@tauri-apps/api/window")
    .then(({ getCurrentWindow }) =>
      getCurrentWindow().setTheme(isLight(flavorId) ? "light" : "dark"),
    )
    .catch(() => {
      // No Tauri, or a window that will not take a theme. The stylesheet has
      // already done the part that matters.
    });
}

/** Remembered theme, or the default. */
export function loadTheme(): { flavor: string; accent: string } {
  const f = flavorById(readPreference(FLAVOR_KEY, DEFAULT_FLAVOR));
  // An accent from another flavor would be off-palette; fall back to blue.
  const stored = readPreference(ACCENT_KEY, "");
  const valid = f.accents.some((a) => a.hex === stored);
  return { flavor: f.id, accent: valid ? stored : f.accents[DEFAULT_ACCENT_INDEX].hex };
}

export function saveTheme(flavor: string, accent: string) {
  writePreference(FLAVOR_KEY, flavor);
  writePreference(ACCENT_KEY, accent);
}

/** The same accent slot in another flavor, so switching flavor keeps the
 *  user's colour choice rather than resetting it. */
export function sameAccentIn(from: Flavor, accentHex: string, to: Flavor): string {
  const i = from.accents.findIndex((a) => a.hex === accentHex);
  return to.accents[i >= 0 ? i : DEFAULT_ACCENT_INDEX].hex;
}
