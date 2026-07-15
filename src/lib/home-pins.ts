import { parseAgentChatWidget, type AgentChatWidget } from "@/lib/agent-widgets";
import type { WorkspaceDatabaseModel } from "@/lib/types";

export type HomeWidgetKind = "database-view" | "genui";

export interface HomePinBase {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  title?: string;
  filter?: HomeWidgetFilter[];
  config?: Record<string, unknown>;
}

export interface HomeWidgetFilter {
  fieldId: string;
  op: string;
  value: string;
}

/** `kind` stays optional so pre-unification Home Pin objects remain source-compatible. */
export interface HomeDatabaseViewPin extends HomePinBase {
  kind?: "database-view";
  databaseId: string;
  viewId: string;
}

export interface HomeGenuiPin extends HomePinBase {
  kind: "genui";
  widget: AgentChatWidget;
  pinnedAt: string;
}

export type HomePin = HomeDatabaseViewPin | HomeGenuiPin;
export type HomePinPlacement = Pick<HomePin, "id" | "x" | "y" | "w" | "h">;

const GRID_COLS = 12;
const DEFAULT_PIN_W = 4;
const DEFAULT_PIN_H = 11;
const STORAGE_KEY = "intelizen:home-pins";
const LEGACY_STORAGE_KEY = "intelizen:database-dashboard-pins";

export function loadHomePins(): HomePin[] {
  if (typeof window === "undefined") return [];
  try {
    const raw =
      window.localStorage.getItem(STORAGE_KEY) ??
      window.localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return migrateHomePins(parsed);
  } catch {
    return [];
  }
}

export function saveHomePins(pins: HomePin[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(pins));
}

export function supportsPinnedHomeView(type: WorkspaceDatabaseModel["views"][number]["type"]) {
  return type === "chart" || type === "table" || type === "list" || type === "timeline";
}

export function isDatabaseViewHomePin(pin: HomePin): pin is HomeDatabaseViewPin {
  return pin.kind !== "genui";
}

export function isGenuiHomePin(pin: HomePin): pin is HomeGenuiPin {
  return pin.kind === "genui";
}

export function findHomePin(
  pins: HomePin[],
  input: Pick<HomeDatabaseViewPin, "databaseId" | "viewId">,
) {
  return pins.find(
    (pin) => isDatabaseViewHomePin(pin) && pin.databaseId === input.databaseId && pin.viewId === input.viewId,
  ) ?? null;
}

export function upsertHomePin(
  pins: HomePin[],
  input: Pick<HomeDatabaseViewPin, "databaseId" | "viewId">,
) {
  const existing = findHomePin(pins, input);
  if (existing) {
    return { pins, added: false, pin: existing };
  }

  const pin: HomePin = {
    id: crypto.randomUUID(),
    databaseId: input.databaseId,
    viewId: input.viewId,
    ...getNextPinPlacement(pins, DEFAULT_PIN_W),
    w: DEFAULT_PIN_W,
    h: DEFAULT_PIN_H,
  };

  return {
    pins: [...pins, pin],
    added: true,
    pin,
  };
}

export function removeHomePin(
  pins: HomePin[],
  input: Pick<HomeDatabaseViewPin, "databaseId" | "viewId">,
) {
  const nextPins = pins.filter(
    (pin) => !(
      isDatabaseViewHomePin(pin) &&
      pin.databaseId === input.databaseId &&
      pin.viewId === input.viewId
    ),
  );
  return {
    pins: nextPins,
    removed: nextPins.length !== pins.length,
  };
}

export function removeHomePinsForDatabase(
  pins: HomePin[],
  databaseId: string,
) {
  const nextPins = pins.filter((pin) => !isDatabaseViewHomePin(pin) || pin.databaseId !== databaseId);
  return {
    pins: nextPins,
    removed: nextPins.length !== pins.length,
  };
}

export function patchHomePinPlacements(
  pins: HomePin[],
  placements: HomePinPlacement[],
) {
  const placementById = new Map(placements.map((placement) => [placement.id, placement]));
  return pins.map((pin) => {
    const placement = placementById.get(pin.id);
    if (!placement) return pin;
    return {
      ...pin,
      x: placement.x,
      y: placement.y,
      w: placement.w,
      h: placement.h,
    };
  });
}

export function removeHomePinById(pins: HomePin[], pinId: string) {
  return pins.filter((pin) => pin.id !== pinId);
}

export function restoreHomePin(pins: HomePin[], pin: HomePin) {
  const alreadyPresent = pins.some(
    (candidate) =>
      candidate.id === pin.id ||
      (
        isDatabaseViewHomePin(candidate) &&
        isDatabaseViewHomePin(pin) &&
        candidate.databaseId === pin.databaseId &&
        candidate.viewId === pin.viewId &&
        candidate.config?.presetKey === pin.config?.presetKey
      ),
  );
  return alreadyPresent ? pins : [...pins, pin];
}

export function createGenuiHomePin(widget: AgentChatWidget, pins: HomePin[]): HomeGenuiPin {
  const generatedPins = pins.filter(isGenuiHomePin);
  if (generatedPins.length >= 12) {
    throw new Error("Home already has the maximum of 12 generated views.");
  }
  const width = 6;
  return {
    id: crypto.randomUUID(),
    kind: "genui",
    title: widget.title?.trim() || defaultGenuiTitle(widget),
    widget,
    pinnedAt: new Date().toISOString(),
    ...getNextPinPlacement(pins, width),
    w: width,
    h: 12,
  };
}

export function createDatabaseHomePin(
  pins: HomePin[],
  input: Pick<HomeDatabaseViewPin, "databaseId" | "viewId"> &
    Pick<HomeDatabaseViewPin, "title" | "filter" | "config">,
): HomeDatabaseViewPin {
  return {
    id: crypto.randomUUID(),
    kind: "database-view",
    databaseId: input.databaseId,
    viewId: input.viewId,
    title: input.title,
    filter: input.filter,
    config: input.config,
    ...getNextPinPlacement(pins, DEFAULT_PIN_W),
    w: DEFAULT_PIN_W,
    h: DEFAULT_PIN_H,
  };
}

export function patchHomePinMetadata(
  pins: HomePin[],
  pinId: string,
  metadata: Pick<HomePinBase, "title" | "filter" | "config">,
) {
  return pins.map((pin) => pin.id === pinId ? { ...pin, ...metadata } : pin);
}

export function parseHomeWidgetFilterJson(value: string): HomeWidgetFilter[] {
  const trimmed = value.trim();
  if (!trimmed) return [];
  const parsed = JSON.parse(trimmed) as unknown;
  if (!isHomeWidgetFilterArray(parsed)) {
    throw new Error("Filters must be a JSON array of fieldId, op, and value objects.");
  }
  return parsed;
}

export function parseHomeWidgetConfigJson(value: string): Record<string, unknown> {
  const trimmed = value.trim();
  if (!trimmed) return {};
  const parsed = JSON.parse(trimmed) as unknown;
  if (!isPlainRecord(parsed)) throw new Error("Config must be a JSON object.");
  return parsed;
}

export function parseHomePin(value: unknown): HomePin | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.id !== "string" ||
    typeof candidate.x !== "number" ||
    typeof candidate.y !== "number" ||
    typeof candidate.w !== "number" ||
    typeof candidate.h !== "number"
  ) {
    return null;
  }
  if (candidate.kind !== undefined && candidate.kind !== "database-view" && candidate.kind !== "genui") {
    return null;
  }

  const common = {
    id: candidate.id,
    x: candidate.x,
    y: candidate.y,
    w: candidate.w,
    h: candidate.h,
    ...(typeof candidate.title === "string" && candidate.title.trim() ? { title: candidate.title.trim() } : {}),
    ...(isHomeWidgetFilterArray(candidate.filter) ? { filter: candidate.filter } : {}),
    ...(isPlainRecord(candidate.config) ? { config: candidate.config } : {}),
  };

  if (candidate.kind === "genui") {
    const widget = parseAgentChatWidget(candidate.widget);
    if (!widget) return null;
    return {
      ...common,
      kind: "genui",
      widget,
      pinnedAt: typeof candidate.pinnedAt === "string" ? candidate.pinnedAt : new Date().toISOString(),
    };
  }

  if (typeof candidate.databaseId !== "string" || typeof candidate.viewId !== "string") return null;
  return {
    ...common,
    kind: candidate.kind === "database-view" ? "database-view" : undefined,
    databaseId: candidate.databaseId,
    viewId: candidate.viewId,
  };
}

function migrateHomePins(values: unknown[]): HomePin[] {
  const migrated = values
    .map((value, index) => {
      const current = parseHomePin(value);
      if (current) return current;
      if (!value || typeof value !== "object") return null;
      const candidate = value as {
        id?: string;
        databaseId?: string;
        viewId?: string;
        width?: "narrow" | "medium" | "wide";
        height?: "short" | "medium" | "tall";
      };
      if (
        typeof candidate.id !== "string" ||
        typeof candidate.databaseId !== "string" ||
        typeof candidate.viewId !== "string"
      ) {
        return null;
      }
      return {
        id: candidate.id,
        databaseId: candidate.databaseId,
        viewId: candidate.viewId,
        x: 0,
        y: index * DEFAULT_PIN_H,
        w: legacyWidthToGrid(candidate.width),
        h: legacyHeightToGrid(candidate.height),
      } satisfies HomePin;
    })
    .filter((pin): pin is HomePin => Boolean(pin));

  return needsGridNormalization(migrated) ? normalizeHomePins(migrated) : migrated;
}

function legacyWidthToGrid(width: "narrow" | "medium" | "wide" | undefined) {
  if (width === "narrow") return 4;
  if (width === "wide") return 12;
  return DEFAULT_PIN_W;
}

function legacyHeightToGrid(height: "short" | "medium" | "tall" | undefined) {
  if (height === "short") return 9;
  if (height === "tall") return 16;
  return DEFAULT_PIN_H;
}

function needsGridNormalization(pins: HomePin[]) {
  if (pins.length <= 1) return false;
  if (pins.some((pin) => pin.x < 0 || pin.w <= 0 || pin.x + pin.w > GRID_COLS)) return true;
  if (pins.every((pin) => pin.x === 0)) return true;
  return hasOverlaps(pins);
}

function normalizeHomePins(pins: HomePin[]) {
  let cursorX = 0;
  let cursorY = 0;
  let rowHeight = 0;

  return pins.map((pin) => {
    const w = clampGridWidth(pin.w);
    const h = clampGridHeight(pin.h);

    if (cursorX + w > GRID_COLS) {
      cursorX = 0;
      cursorY += rowHeight;
      rowHeight = 0;
    }

    const nextPin = {
      ...pin,
      x: cursorX,
      y: cursorY,
      w,
      h,
    };

    cursorX += w;
    rowHeight = Math.max(rowHeight, h);
    return nextPin;
  });
}

function getNextPinPlacement(pins: HomePin[], width: number) {
  const normalized = normalizeHomePins(pins);
  let cursorX = 0;
  let cursorY = 0;
  let rowHeight = 0;

  for (const pin of normalized) {
    if (cursorX + pin.w > GRID_COLS) {
      cursorX = 0;
      cursorY += rowHeight;
      rowHeight = 0;
    }
    cursorX += pin.w;
    rowHeight = Math.max(rowHeight, pin.h);
    if (cursorX >= GRID_COLS) {
      cursorX = 0;
      cursorY += rowHeight;
      rowHeight = 0;
    }
  }

  const clampedWidth = clampGridWidth(width);
  if (cursorX + clampedWidth > GRID_COLS) {
    cursorX = 0;
    cursorY += rowHeight;
  }

  return { x: cursorX, y: cursorY };
}

function hasOverlaps(pins: HomePin[]) {
  for (let i = 0; i < pins.length; i += 1) {
    for (let j = i + 1; j < pins.length; j += 1) {
      if (rectsOverlap(pins[i], pins[j])) return true;
    }
  }
  return false;
}

function rectsOverlap(left: HomePin, right: HomePin) {
  return !(
    left.x + left.w <= right.x ||
    right.x + right.w <= left.x ||
    left.y + left.h <= right.y ||
    right.y + right.h <= left.y
  );
}

function clampGridWidth(width: number) {
  return Math.min(Math.max(Math.round(width), 3), GRID_COLS);
}

function clampGridHeight(height: number) {
  return Math.max(Math.round(height), 8);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isHomeWidgetFilterArray(value: unknown): value is HomeWidgetFilter[] {
  return Array.isArray(value) && value.every((entry) => {
    if (!isPlainRecord(entry)) return false;
    return typeof entry.fieldId === "string" && typeof entry.op === "string" && typeof entry.value === "string";
  });
}

function defaultGenuiTitle(widget: AgentChatWidget) {
  switch (widget.kind) {
    case "html":
      return "Agent view";
    case "data-table":
      return "Agent table";
    case "data-chart":
      return "Agent chart";
    case "data-metrics":
      return "Agent metrics";
    case "data-insights":
      return "Agent insights";
    case "record-links":
      return "Agent links";
  }
}
