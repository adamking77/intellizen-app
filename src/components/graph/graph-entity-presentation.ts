import { Building2, CalendarClock, MapPin, User } from "lucide-react";

import type { GraphEntityType } from "@/lib/types";

export const GRAPH_ENTITY_STYLES: Record<
  GraphEntityType,
  { chip: string; fill: string; border: string; text: string; accent: string }
> = {
  person: {
    chip: "color-mix(in srgb, var(--entity-person) 15%, transparent)",
    fill: "var(--base)",
    border: "var(--entity-person)",
    text: "var(--text)",
    accent: "var(--entity-person)",
  },
  organisation: {
    chip: "color-mix(in srgb, var(--entity-org) 15%, transparent)",
    fill: "var(--base)",
    border: "var(--entity-org)",
    text: "var(--text)",
    accent: "var(--entity-org)",
  },
  location: {
    chip: "color-mix(in srgb, var(--entity-location) 15%, transparent)",
    fill: "var(--base)",
    border: "var(--entity-location)",
    text: "var(--text)",
    accent: "var(--entity-location)",
  },
  event: {
    chip: "color-mix(in srgb, var(--entity-event) 15%, transparent)",
    fill: "var(--base)",
    border: "var(--entity-event)",
    text: "var(--text)",
    accent: "var(--entity-event)",
  },
};

export const GRAPH_ENTITY_ICON: Record<GraphEntityType, typeof User> = {
  person: User,
  organisation: Building2,
  location: MapPin,
  event: CalendarClock,
};

export const GRAPH_ENTITY_LABEL: Record<GraphEntityType, string> = {
  person: "Person",
  organisation: "Organisation",
  location: "Location",
  event: "Event",
};
