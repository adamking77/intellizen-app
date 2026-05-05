import type { HomePin } from "@/lib/home-pins";

export interface HomeDashboardLayoutItem {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

const STORAGE_KEY = "intelizen:home-layout";

export function loadHomeDashboardLayout(): HomeDashboardLayoutItem[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isHomeDashboardLayoutItem);
  } catch {
    return [];
  }
}

export function saveHomeDashboardLayout(layout: HomeDashboardLayoutItem[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
}

export function mergeHomeDashboardLayout(
  pins: HomePin[],
  layout: HomeDashboardLayoutItem[],
): HomeDashboardLayoutItem[] {
  const layoutById = new Map(layout.map((item) => [item.id, item]));
  return pins.map((pin) => {
    const saved = layoutById.get(pin.id);
    if (saved) return saved;
    return {
      id: pin.id,
      x: pin.x,
      y: pin.y,
      w: pin.w,
      h: pin.h,
    } satisfies HomeDashboardLayoutItem;
  });
}

function isHomeDashboardLayoutItem(value: unknown): value is HomeDashboardLayoutItem {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<HomeDashboardLayoutItem>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.x === "number" &&
    typeof candidate.y === "number" &&
    typeof candidate.w === "number" &&
    typeof candidate.h === "number"
  );
}
