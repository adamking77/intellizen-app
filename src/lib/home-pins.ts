import type { WorkspaceDatabaseModel } from "@/lib/types";

export interface HomePin {
  id: string;
  databaseId: string;
  viewId: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

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
  return type === "chart" || type === "table" || type === "list";
}

export function findHomePin(
  pins: HomePin[],
  input: Pick<HomePin, "databaseId" | "viewId">,
) {
  return pins.find((pin) => pin.databaseId === input.databaseId && pin.viewId === input.viewId) ?? null;
}

export function upsertHomePin(
  pins: HomePin[],
  input: Pick<HomePin, "databaseId" | "viewId">,
) {
  const existing = pins.find((pin) => pin.viewId === input.viewId);
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
  input: Pick<HomePin, "databaseId" | "viewId">,
) {
  const nextPins = pins.filter(
    (pin) => !(pin.databaseId === input.databaseId && pin.viewId === input.viewId),
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
  const nextPins = pins.filter((pin) => pin.databaseId !== databaseId);
  return {
    pins: nextPins,
    removed: nextPins.length !== pins.length,
  };
}

function migrateHomePins(values: unknown[]): HomePin[] {
  const migrated = values
    .map((value, index) => {
      if (isHomePin(value)) return value;
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

function isHomePin(value: unknown): value is HomePin {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<HomePin>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.databaseId === "string" &&
    typeof candidate.viewId === "string" &&
    typeof candidate.x === "number" &&
    typeof candidate.y === "number" &&
    typeof candidate.w === "number" &&
    typeof candidate.h === "number"
  );
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
