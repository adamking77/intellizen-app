import type { AgentChatWidget } from "@/lib/agent-widgets";
import { parseAgentChatWidget } from "@/lib/agent-widgets";
import { mutateAuthoritativeHomePins } from "@/lib/home-pin-mutations";
import {
  createGenuiHomePin,
  isGenuiHomePin,
  type HomeGenuiPin,
  type HomePin,
} from "@/lib/home-pins";

/** Legacy local GenUI shape retained only for one-time migration into Home Pins. */
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

export interface GenuiPinPersistence {
  read: () => Promise<HomePin[]>;
  write: (pins: HomePin[]) => Promise<unknown>;
}

export async function pinGenuiWidget(
  widget: AgentChatWidget,
  persistence: GenuiPinPersistence,
): Promise<HomeGenuiPin> {
  let requestedId: string | undefined;
  const result = await mutateAuthoritativeHomePins({
    ...persistence,
    transform: (current) => {
      const requested = createGenuiHomePin(widget, current);
      requestedId = requested.id;
      return [...current, requested];
    },
  });
  const verified = result.authoritative.find(
    (pin): pin is HomeGenuiPin => isGenuiHomePin(pin) && pin.id === requestedId,
  );
  if (!verified) {
    throw new Error("The generated view was not verified in Home Pins. Try again.");
  }
  return verified;
}

export function unpinGenuiWidget(pinId: string): GenuiPin[] {
  const next = loadGenuiPins().filter((pin) => pin.id !== pinId);
  saveGenuiPins(next);
  return next;
}

export async function migrateLegacyGenuiPins(persistence: GenuiPinPersistence) {
  const legacyPins = loadGenuiPins();
  if (legacyPins.length === 0) return [];

  const result = await mutateAuthoritativeHomePins({
    ...persistence,
    transform: (current) => {
      let next = current;
      for (const legacy of legacyPins) {
        if (next.some((pin) => pin.id === legacy.id)) continue;
        const generated = createGenuiHomePin(legacy.widget, next);
        next = [...next, {
          ...generated,
          id: legacy.id,
          title: legacy.title,
          pinnedAt: legacy.pinnedAt,
        }];
      }
      return next;
    },
  });

  if (!legacyPins.every((legacy) => result.authoritative.some((pin) => pin.id === legacy.id))) {
    throw new Error("Legacy generated views were not fully verified in Home Pins.");
  }
  if (typeof window !== "undefined") window.localStorage.removeItem(STORAGE_KEY);
  return result.authoritative.filter(isGenuiHomePin);
}
