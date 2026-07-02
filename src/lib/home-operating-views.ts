// Pin governance for Home operating views: agents propose views, Adam pins.
// Default is none pinned — Home belongs to the pinned database dashboard.

export type OperatingViewKey = "distribution" | "approvals" | "roles";

export const OPERATING_VIEW_LABELS: Record<OperatingViewKey, string> = {
  distribution: "GZS distribution health",
  approvals: "Active approvals",
  roles: "Agent work by role",
};

const STORAGE_KEY = "intelizen:home-operating-view-pins";
const VALID_KEYS: OperatingViewKey[] = ["distribution", "approvals", "roles"];

export function loadOperatingViewPins(): OperatingViewKey[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((key): key is OperatingViewKey => VALID_KEYS.includes(key));
  } catch {
    return [];
  }
}

export function saveOperatingViewPins(pins: OperatingViewKey[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(pins));
  } catch {
    /* ignore */
  }
}
