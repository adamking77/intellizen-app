import type { WorkspaceDatabaseModel } from "@/lib/types";

export interface DatabaseDashboardPin {
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
const STORAGE_KEY = "intelizen:database-dashboard-pins";

type PinnedViewType = WorkspaceDatabaseModel["views"][number]["type"];
type PinnedChartType = WorkspaceDatabaseModel["views"][number]["chartType"];

interface DashboardPinSizing {
  defaultW: number;
  defaultH: number;
  minW: number;
  minH: number;
}

export function loadDatabaseDashboardPins(): DatabaseDashboardPin[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return migrateDashboardPins(parsed);
  } catch {
    return [];
  }
}

export function saveDatabaseDashboardPins(pins: DatabaseDashboardPin[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(pins));
}

export function supportsPinnedDashboardView(type: WorkspaceDatabaseModel["views"][number]["type"]) {
  return type === "chart" || type === "table" || type === "list";
}

export function upsertDatabaseDashboardPin(
  pins: DatabaseDashboardPin[],
  input: Pick<DatabaseDashboardPin, "databaseId" | "viewId"> & {
    viewType?: PinnedViewType;
    chartType?: PinnedChartType;
  },
) {
  const existing = pins.find((pin) => pin.viewId === input.viewId);
  if (existing) {
    return { pins, added: false, pin: existing };
  }

  const sizing = getDashboardPinSizing(input.viewType, input.chartType);

  const pin: DatabaseDashboardPin = {
    id: crypto.randomUUID(),
    databaseId: input.databaseId,
    viewId: input.viewId,
    ...getNextPinPlacement(pins, sizing.defaultW),
    w: sizing.defaultW,
    h: sizing.defaultH,
  };

  return {
    pins: [...pins, pin],
    added: true,
    pin,
  };
}

export function getDashboardPinSizing(
  viewType: PinnedViewType | undefined,
  chartType?: PinnedChartType,
): DashboardPinSizing {
  if (viewType === "table") {
    return { defaultW: 6, defaultH: 12, minW: 5, minH: 9 };
  }

  if (viewType === "list") {
    return { defaultW: 4, defaultH: 10, minW: 4, minH: 8 };
  }

  if (viewType === "chart") {
    if (chartType === "donut") {
      return { defaultW: 6, defaultH: 12, minW: 5, minH: 9 };
    }
    if (chartType === "line") {
      return { defaultW: 6, defaultH: 11, minW: 5, minH: 8 };
    }
    return { defaultW: 5, defaultH: 11, minW: 5, minH: 8 };
  }

  return { defaultW: DEFAULT_PIN_W, defaultH: DEFAULT_PIN_H, minW: 4, minH: 8 };
}

function migrateDashboardPins(values: unknown[]): DatabaseDashboardPin[] {
  const migrated = values
    .map((value, index) => {
      if (isDashboardPin(value)) return value;
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
      } satisfies DatabaseDashboardPin;
    })
    .filter((pin): pin is DatabaseDashboardPin => Boolean(pin));

  return needsGridNormalization(migrated) ? normalizeDashboardPins(migrated) : migrated;
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

function isDashboardPin(value: unknown): value is DatabaseDashboardPin {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<DatabaseDashboardPin>;
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

function needsGridNormalization(pins: DatabaseDashboardPin[]) {
  if (pins.length <= 1) return false;
  if (pins.some((pin) => pin.x < 0 || pin.w <= 0 || pin.x + pin.w > GRID_COLS)) return true;
  if (pins.every((pin) => pin.x === 0)) return true;
  return hasOverlaps(pins);
}

function normalizeDashboardPins(pins: DatabaseDashboardPin[]) {
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

function getNextPinPlacement(pins: DatabaseDashboardPin[], width: number) {
  const normalized = normalizeDashboardPins(pins);
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

function hasOverlaps(pins: DatabaseDashboardPin[]) {
  for (let i = 0; i < pins.length; i += 1) {
    for (let j = i + 1; j < pins.length; j += 1) {
      if (rectsOverlap(pins[i], pins[j])) return true;
    }
  }
  return false;
}

function rectsOverlap(left: DatabaseDashboardPin, right: DatabaseDashboardPin) {
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
