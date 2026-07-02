import type { AgentChatWidget } from "@/lib/agent-widgets";
import { parseAgentChatWidget } from "@/lib/agent-widgets";

/**
 * Pinned GenUI widgets: agent-generated views/dashboard widgets Adam has
 * explicitly pinned from chat onto Home. Stored locally (same governance as
 * home pins — nothing appears on Home unless Adam pins it). html-kind
 * widgets re-run their live bridge queries every time they mount, so a
 * pinned widget is a self-refreshing tracker, not a snapshot.
 */
export interface GenuiPin {
  id: string;
  title: string;
  widget: AgentChatWidget;
  pinnedAt: string;
}

const STORAGE_KEY = "intelizen:genui-pins";
const MAX_PINS = 12;

export function loadGenuiPins(): GenuiPin[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((value): GenuiPin | null => {
        if (!value || typeof value !== "object") return null;
        const candidate = value as Partial<GenuiPin>;
        if (typeof candidate.id !== "string" || typeof candidate.title !== "string") return null;
        const widget = parseAgentChatWidget(candidate.widget);
        if (!widget) return null;
        return {
          id: candidate.id,
          title: candidate.title,
          widget,
          pinnedAt: typeof candidate.pinnedAt === "string" ? candidate.pinnedAt : new Date().toISOString(),
        };
      })
      .filter((pin): pin is GenuiPin => Boolean(pin));
  } catch {
    return [];
  }
}

export function saveGenuiPins(pins: GenuiPin[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(pins.slice(0, MAX_PINS)));
}

export function pinGenuiWidget(widget: AgentChatWidget): GenuiPin {
  const pins = loadGenuiPins();
  const pin: GenuiPin = {
    id: crypto.randomUUID(),
    title: widget.title?.trim() || defaultTitle(widget),
    widget,
    pinnedAt: new Date().toISOString(),
  };
  saveGenuiPins([...pins, pin]);
  return pin;
}

export function unpinGenuiWidget(pinId: string): GenuiPin[] {
  const next = loadGenuiPins().filter((pin) => pin.id !== pinId);
  saveGenuiPins(next);
  return next;
}

function defaultTitle(widget: AgentChatWidget) {
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
