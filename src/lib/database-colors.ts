import type { WorkspaceDatabaseField } from "@/lib/types";

export type SemanticRole = "danger" | "warning" | "success" | "info" | "neutral";

export const SEMANTIC_PALETTE: Record<SemanticRole, string> = {
  danger: "var(--bad)",
  warning: "var(--wait)",
  success: "var(--ok)",
  info: "var(--runtime)",
  neutral: "var(--overlay-1)",
};

export const SEMANTIC_MAP: Record<string, SemanticRole> = {
  critical: "danger",
  urgent: "danger",
  high: "danger",
  medium: "warning",
  low: "success",
  none: "neutral",
  "not started": "neutral",
  todo: "neutral",
  "to do": "neutral",
  backlog: "neutral",
  cancelled: "neutral",
  canceled: "neutral",
  "in progress": "info",
  active: "success",
  doing: "info",
  "in review": "info",
  done: "success",
  complete: "success",
  completed: "success",
  closed: "success",
  shipped: "success",
  blocked: "danger",
  on_hold: "info",
  "on hold": "info",
};

export const HASH_PALETTE = [
  "var(--red)",
  "var(--peach)",
  "var(--yellow)",
  "var(--green)",
  "var(--teal)",
  "var(--sky)",
  "var(--mauve)",
  "var(--pink)",
];

export const NAMED_OPTION_COLORS = [
  { label: "Rose", value: "var(--red)" },
  { label: "Peach", value: "var(--peach)" },
  { label: "Gold", value: "var(--yellow)" },
  { label: "Mint", value: "var(--green)" },
  { label: "Teal", value: "var(--teal)" },
  { label: "Sky", value: "var(--sky)" },
  { label: "Iris", value: "var(--mauve)" },
  { label: "Pink", value: "var(--pink)" },
] as const;

export const CYCLING_PALETTE = [0, 4, 2, 6, 1, 5, 3, 7];

export function hashString(value: string) {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) + hash + value.charCodeAt(index)) >>> 0;
  }
  return hash >>> 0;
}

export function getReadableTextColor(backgroundHex: string) {
  if (backgroundHex.trim().startsWith("var(")) {
    return "var(--crust)";
  }
  const hex = backgroundHex.replace("#", "");
  if (hex.length !== 6) {
    return "var(--text)";
  }

  const red = Number.parseInt(hex.slice(0, 2), 16);
  const green = Number.parseInt(hex.slice(2, 4), 16);
  const blue = Number.parseInt(hex.slice(4, 6), 16);
  const yiq = (red * 299 + green * 587 + blue * 114) / 1000;
  return yiq >= 150 ? "var(--crust)" : "var(--text)";
}

export function resolveStatusColor(value: string, field?: WorkspaceDatabaseField) {
  const explicit = field?.optionColors?.[value];
  if (explicit) {
    return explicit;
  }
  const semantic = SEMANTIC_MAP[value.trim().toLowerCase()];
  if (semantic) {
    return SEMANTIC_PALETTE[semantic];
  }
  return HASH_PALETTE[hashString(value.trim().toLowerCase()) % HASH_PALETTE.length];
}

export function resolveFieldOptionColor(field: WorkspaceDatabaseField, option: string) {
  const explicit = field.optionColors?.[option];
  if (explicit) {
    return explicit;
  }

  const semantic = SEMANTIC_MAP[option.trim().toLowerCase()];
  if (semantic) {
    return SEMANTIC_PALETTE[semantic];
  }

  const optionIndex = field.options?.findIndex((candidate) => candidate === option) ?? -1;
  if (optionIndex >= 0) {
    const paletteIndex = CYCLING_PALETTE[optionIndex % CYCLING_PALETTE.length];
    return HASH_PALETTE[paletteIndex];
  }

  return HASH_PALETTE[hashString(`${field.id}:${option}`) % HASH_PALETTE.length];
}

export function resolveRelationColor(title: string) {
  return HASH_PALETTE[hashString(title.trim().toLowerCase()) % HASH_PALETTE.length];
}
